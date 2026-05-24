import { Router, type IRouter } from "express";
import { db, rosterShiftsTable, staffTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
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

router.post("/roster", requireRole("admin"), async (req, res) => {
  const parsed = CreateRosterShiftBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db.insert(rosterShiftsTable).values(parsed.data).returning();
  const [s] = await db.select().from(staffTable).where(eq(staffTable.id, row.staffId));
  res.status(201).json(shape(row, s!));
});

export default router;
