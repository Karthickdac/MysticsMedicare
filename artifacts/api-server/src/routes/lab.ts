import { Router, type IRouter } from "express";
import { db, labOrdersTable, patientsTable } from "@workspace/db";
import { desc, eq, and } from "drizzle-orm";
import { CreateLabOrderBody, RecordLabResultBody } from "@workspace/api-zod";
import { isoDate, requiredIso } from "../lib/format";
import { sendNotification } from "../lib/notifications";

const router: IRouter = Router();

function shape(l: typeof labOrdersTable.$inferSelect, p: typeof patientsTable.$inferSelect) {
  return {
    id: l.id,
    patientId: l.patientId,
    patientName: p.name,
    testName: l.testName,
    category: l.category,
    status: l.status,
    result: l.result,
    normalRange: l.normalRange,
    notes: l.notes,
    orderedBy: l.orderedBy,
    createdAt: requiredIso(l.createdAt),
    completedAt: isoDate(l.completedAt),
  };
}

router.get("/lab/orders", async (req, res) => {
  const conds = [] as ReturnType<typeof eq>[];
  if (req.query.patientId) conds.push(eq(labOrdersTable.patientId, Number(req.query.patientId)));
  if (req.query.status) conds.push(eq(labOrdersTable.status, String(req.query.status)));
  const rows = await db
    .select({ l: labOrdersTable, p: patientsTable })
    .from(labOrdersTable)
    .innerJoin(patientsTable, eq(labOrdersTable.patientId, patientsTable.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(labOrdersTable.createdAt))
    .limit(500);
  res.json(rows.map((r) => shape(r.l, r.p)));
});

import { requireRole } from "../lib/auth";
router.post("/lab/orders", requireRole("admin", "doctor"), async (req, res) => {
  const parsed = CreateLabOrderBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db.insert(labOrdersTable).values(parsed.data).returning();
  const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, row.patientId));
  res.status(201).json(shape(row, p!));
});

router.post("/lab/orders/:id/result", requireRole("admin", "labtech"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = RecordLabResultBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db
    .update(labOrdersTable)
    .set({ ...parsed.data, status: "completed", completedAt: new Date() })
    .where(eq(labOrdersTable.id, id))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, row.patientId));
  await sendNotification({
    eventKey: "lab_result_ready",
    channel: "sms",
    patientId: row.patientId,
    variables: { testName: row.testName },
  });
  res.json(shape(row, p!));
});

export default router;
