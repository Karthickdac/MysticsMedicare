import { Router, type IRouter } from "express";
import { db, rosterShiftsTable, staffTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { CreateRosterShiftBody } from "@workspace/api-zod";
import { dateOnly, requiredIso } from "../lib/format";
import { requireRole } from "../lib/auth";

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

router.get("/roster", async (_req, res) => {
  const rows = await db
    .select({ r: rosterShiftsTable, s: staffTable })
    .from(rosterShiftsTable)
    .innerJoin(staffTable, eq(rosterShiftsTable.staffId, staffTable.id))
    .orderBy(desc(rosterShiftsTable.date))
    .limit(500);
  res.json(rows.map((x) => shape(x.r, x.s)));
});

// Two shifts conflict for the same staff+date when at least one of them is a
// full-day marker (Leave / OnCall) — those are exclusive of any other shift —
// OR when both are the same Morning/Evening/Night band. We intentionally
// allow e.g. Morning + Evening for double shifts (with a notes nudge).
function conflicts(a: string, b: string): boolean {
  const exclusive = (s: string) => s === "Leave" || s === "OnCall";
  if (exclusive(a) || exclusive(b)) return true;
  return a === b;
}

router.post("/roster", requireRole("admin"), async (req, res) => {
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
    // Backstop for the JS conflict check above — concurrent admins could
    // both pass the pre-check, and the (staff_id,date,shift) unique index
    // is what guarantees we never persist a duplicate band.
    const msg = e instanceof Error ? e.message : String(e);
    if (/unique|duplicate/i.test(msg)) {
      return res.status(409).json({ error: `Conflict: ${parsed.data.shift} already scheduled for this staff on ${parsed.data.date}` });
    }
    throw e;
  }
});

router.delete("/roster/:id", requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  const result = await db.delete(rosterShiftsTable).where(eq(rosterShiftsTable.id, id));
  if (!result.rowCount) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
});

export default router;
