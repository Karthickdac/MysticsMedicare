import { Router, type IRouter } from "express";
import { db, rosterShiftsTable, staffTable } from "@workspace/db";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { CreateRosterShiftBody } from "@workspace/api-zod";
import { dateOnly, requiredIso } from "../lib/format";
import { requirePermission } from "../lib/auth";

const router: IRouter = Router();

function shape(r: typeof rosterShiftsTable.$inferSelect, s: typeof staffTable.$inferSelect) {
  return {
    id: r.id,
    staffId: r.staffId,
    staffName: s.name,
    department: r.department,
    shift: r.shift,
    date: dateOnly(r.date)!,
    notes: r.notes,
    createdAt: requiredIso(r.createdAt),
  };
}

router.get("/roster", requirePermission("roster.read"), async (_req, res) => {
  const rows = await db
    .select({ r: rosterShiftsTable, s: staffTable })
    .from(rosterShiftsTable)
    .innerJoin(staffTable, eq(rosterShiftsTable.staffId, staffTable.id))
    .orderBy(desc(rosterShiftsTable.date))
    .limit(2000);
  res.json(rows.map((x) => shape(x.r, x.s)));
});

// Two shifts conflict for the same staff+date when at least one of them is a
// full-day marker (Leave / OnCall) — those are exclusive of any other shift —
// OR when both are the same Morning/Evening/Night band.
function conflicts(a: string, b: string): boolean {
  const exclusive = (s: string) => s === "Leave" || s === "OnCall";
  if (exclusive(a) || exclusive(b)) return true;
  return a === b;
}

router.post("/roster", requirePermission("roster.write"), async (req, res) => {
  const parsed = CreateRosterShiftBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

  const sameDay = await db
    .select()
    .from(rosterShiftsTable)
    .where(and(
      eq(rosterShiftsTable.staffId, parsed.data.staffId),
      eq(rosterShiftsTable.date, parsed.data.date),
    ));
  const clash = sameDay.find((x) => conflicts(x.shift, parsed.data.shift));
  if (clash) {
    return res.status(409).json({
      error: `Conflict: staff already has "${clash.shift}" on ${parsed.data.date}`,
    });
  }

  try {
    const [row] = await db.insert(rosterShiftsTable).values(parsed.data).returning();
    const [s] = await db.select().from(staffTable).where(eq(staffTable.id, row.staffId));
    res.status(201).json(shape(row, s!));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/unique|duplicate/i.test(msg)) {
      return res.status(409).json({ error: `Conflict: ${parsed.data.shift} already scheduled for this staff on ${parsed.data.date}` });
    }
    throw e;
  }
});

router.delete("/roster/:id", requirePermission("roster.write"), async (req, res) => {
  const id = Number(req.params.id);
  const result = await db.delete(rosterShiftsTable).where(eq(rosterShiftsTable.id, id));
  if (!result.rowCount) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
});

type BulkInput = { staffId: number; department: string; shift: string; date: string; notes?: string };

async function bulkInsert(shifts: BulkInput[]) {
  let created = 0;
  let skipped = 0;
  const skippedReasons: { staffId: number; date: string; shift: string; reason: string }[] = [];

  for (const s of shifts) {
    if (!s.staffId || !s.date || !s.shift || !s.department) {
      skipped++;
      skippedReasons.push({ staffId: s.staffId ?? 0, date: s.date ?? "", shift: s.shift ?? "", reason: "Missing fields" });
      continue;
    }
    const sameDay = await db
      .select()
      .from(rosterShiftsTable)
      .where(and(eq(rosterShiftsTable.staffId, s.staffId), eq(rosterShiftsTable.date, s.date)));
    const clash = sameDay.find((x) => conflicts(x.shift, s.shift));
    if (clash) {
      skipped++;
      skippedReasons.push({ staffId: s.staffId, date: s.date, shift: s.shift, reason: `Conflicts with existing ${clash.shift}` });
      continue;
    }
    try {
      await db.insert(rosterShiftsTable).values(s);
      created++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      skipped++;
      skippedReasons.push({ staffId: s.staffId, date: s.date, shift: s.shift, reason: /unique|duplicate/i.test(msg) ? "Duplicate shift band" : "DB error" });
    }
  }
  return { created, skipped, skippedReasons };
}

router.post("/roster/bulk", requirePermission("roster.write"), async (req, res) => {
  const shifts = Array.isArray(req.body?.shifts) ? (req.body.shifts as BulkInput[]) : null;
  if (!shifts) return res.status(400).json({ error: "shifts array required" });
  if (shifts.length > 500) return res.status(400).json({ error: "Too many shifts (max 500)" });
  const result = await bulkInsert(shifts);
  res.json(result);
});

router.post("/roster/copy-week", requirePermission("roster.write"), async (req, res) => {
  const fromWeekStart = typeof req.body?.fromWeekStart === "string" ? req.body.fromWeekStart : null;
  const toWeekStart = typeof req.body?.toWeekStart === "string" ? req.body.toWeekStart : null;
  const department = typeof req.body?.department === "string" ? req.body.department : null;
  if (!fromWeekStart || !toWeekStart) return res.status(400).json({ error: "fromWeekStart and toWeekStart required (YYYY-MM-DD)" });

  const from = new Date(fromWeekStart);
  const to = new Date(toWeekStart);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) return res.status(400).json({ error: "Invalid date" });
  const fromEnd = new Date(from); fromEnd.setDate(fromEnd.getDate() + 6);
  const offsetDays = Math.round((to.getTime() - from.getTime()) / 86_400_000);

  const where = department
    ? and(
        gte(rosterShiftsTable.date, fromWeekStart),
        lte(rosterShiftsTable.date, fromEnd.toISOString().slice(0, 10)),
        eq(rosterShiftsTable.department, department),
      )
    : and(
        gte(rosterShiftsTable.date, fromWeekStart),
        lte(rosterShiftsTable.date, fromEnd.toISOString().slice(0, 10)),
      );

  const sourceShifts = await db.select().from(rosterShiftsTable).where(where);
  const toInsert: BulkInput[] = sourceShifts.map((s) => {
    const d = new Date(s.date); d.setDate(d.getDate() + offsetDays);
    return {
      staffId: s.staffId,
      department: s.department,
      shift: s.shift,
      date: d.toISOString().slice(0, 10),
      notes: s.notes ?? undefined,
    };
  });

  const result = await bulkInsert(toInsert);
  res.json(result);
});

export default router;
