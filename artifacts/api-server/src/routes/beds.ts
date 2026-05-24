import { Router, type IRouter } from "express";
import { db, bedsTable, patientsTable, admissionsTable } from "@workspace/db";
import { eq, asc, and } from "drizzle-orm";
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

import { requirePermission } from "../lib/auth";
router.post("/beds", requirePermission("admin.settings"), async (req, res) => {
  const parsed = CreateBedBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  // Drop nulls so Drizzle uses column defaults (e.g. dailyRate NOT NULL default).
  const values = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== null),
  ) as unknown as typeof bedsTable.$inferInsert;
  const [row] = await db.insert(bedsTable).values(values).returning();
  res.status(201).json(shape(row));
});

router.post("/beds/:id/assign", requirePermission("ipd.admit", "ipd.nursing"), async (req, res) => {
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

// Deprecated: legacy bed-level discharge. New code MUST use
// POST /admissions/:id/discharge which atomically closes the encounter,
// releases the bed → cleaning, and fires the discharge-summary notification.
// This path is retained only to release beds that have no active admission
// (e.g. seed data, manual housekeeping) and rejects when an admission exists.
router.post("/beds/:id/discharge", requirePermission("ipd.discharge"), async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(bedsTable).where(eq(bedsTable.id, id));
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (existing.patientId) {
    return res.status(409).json({
      error: "Bed has an active admission. Use POST /admissions/:id/discharge to close it.",
    });
  }
  // Defense in depth: even if bed.patientId drifted, refuse to housekeep a
  // bed that an admission still references as its current bed.
  const [linkedAdm] = await db
    .select({ id: admissionsTable.id })
    .from(admissionsTable)
    .where(and(eq(admissionsTable.bedId, id), eq(admissionsTable.status, "active")))
    .limit(1);
  if (linkedAdm) {
    return res.status(409).json({
      error: `Active admission #${linkedAdm.id} still references this bed. Discharge or transfer it first.`,
    });
  }
  const [row] = await db
    .update(bedsTable)
    .set({ status: "available", admittedAt: null })
    .where(eq(bedsTable.id, id))
    .returning();
  res.json(shape(row, null));
});

export default router;
