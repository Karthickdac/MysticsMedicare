import { Router, type IRouter } from "express";
import { db, bedsTable, patientsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { CreateBedBody, AssignBedBody } from "@workspace/api-zod";
import { isoDate, requiredIso } from "../lib/format";
import { sendNotification } from "../lib/notifications";

const router: IRouter = Router();

function shape(b: typeof bedsTable.$inferSelect, p?: typeof patientsTable.$inferSelect | null) {
  return {
    id: b.id,
    code: b.code,
    ward: b.ward,
    status: b.status,
    patientId: b.patientId,
    patientName: p?.name ?? null,
    admittedAt: isoDate(b.admittedAt),
    createdAt: requiredIso(b.createdAt),
  };
}

router.get("/beds", async (_req, res) => {
  const rows = await db
    .select({ b: bedsTable, p: patientsTable })
    .from(bedsTable)
    .leftJoin(patientsTable, eq(bedsTable.patientId, patientsTable.id))
    .orderBy(asc(bedsTable.ward), asc(bedsTable.code));
  res.json(rows.map((r) => shape(r.b, r.p)));
});

import { requireRole } from "../lib/auth";
router.post("/beds", requireRole("admin"), async (req, res) => {
  const parsed = CreateBedBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db.insert(bedsTable).values(parsed.data).returning();
  res.status(201).json(shape(row));
});

router.post("/beds/:id/assign", requireRole("admin", "nurse", "doctor", "receptionist"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = AssignBedBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db
    .update(bedsTable)
    .set({ patientId: parsed.data.patientId, status: "occupied", admittedAt: new Date() })
    .where(eq(bedsTable.id, id))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, row.patientId!));
  await sendNotification({
    eventKey: "ipd_admission",
    channel: "both",
    patientId: row.patientId!,
    variables: { bedCode: row.code, ward: row.ward },
  });
  res.json(shape(row, p));
});

router.post("/beds/:id/discharge", requireRole("admin", "nurse", "doctor"), async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(bedsTable).where(eq(bedsTable.id, id));
  if (existing?.patientId) {
    await sendNotification({
      eventKey: "ipd_discharge",
      channel: "both",
      patientId: existing.patientId,
      variables: { bedCode: existing.code },
    });
  }
  const [row] = await db
    .update(bedsTable)
    .set({ patientId: null, status: "available", admittedAt: null })
    .where(eq(bedsTable.id, id))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(shape(row, null));
});

export default router;
