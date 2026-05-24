import { Router, type IRouter } from "express";
import { db, encountersTable, patientsTable, staffTable } from "@workspace/db";
import { desc, eq, and } from "drizzle-orm";
import { CreateEncounterBody, UpdateEncounterBody } from "@workspace/api-zod";
import { requiredIso, isoDate } from "../lib/format";
import { requireRole } from "../lib/auth";
import { sendNotification } from "../lib/notifications";

const router: IRouter = Router();

function shape(e: typeof encountersTable.$inferSelect, p: typeof patientsTable.$inferSelect, s: typeof staffTable.$inferSelect) {
  return {
    id: e.id,
    patientId: e.patientId,
    patientName: p.name,
    type: e.type,
    doctorId: e.doctorId,
    doctorName: s.name,
    status: e.status,
    chiefComplaint: e.chiefComplaint,
    diagnosis: e.diagnosis,
    notes: e.notes,
    bedId: e.bedId,
    startedAt: requiredIso(e.startedAt),
    endedAt: isoDate(e.endedAt),
    createdAt: requiredIso(e.createdAt),
  };
}

router.get("/encounters", async (req, res) => {
  const conds = [] as ReturnType<typeof eq>[];
  if (req.query.patientId) conds.push(eq(encountersTable.patientId, Number(req.query.patientId)));
  if (req.query.type) conds.push(eq(encountersTable.type, String(req.query.type)));
  const rows = await db
    .select({ e: encountersTable, p: patientsTable, s: staffTable })
    .from(encountersTable)
    .innerJoin(patientsTable, eq(encountersTable.patientId, patientsTable.id))
    .innerJoin(staffTable, eq(encountersTable.doctorId, staffTable.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(encountersTable.startedAt))
    .limit(500);
  res.json(rows.map((r) => shape(r.e, r.p, r.s)));
});

router.post("/encounters", requireRole("admin", "doctor", "nurse", "receptionist"), async (req, res) => {
  const parsed = CreateEncounterBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db
    .insert(encountersTable)
    .values({
      patientId: parsed.data.patientId,
      type: parsed.data.type,
      doctorId: parsed.data.doctorId,
      chiefComplaint: parsed.data.chiefComplaint,
      diagnosis: parsed.data.diagnosis,
      notes: parsed.data.notes,
      bedId: parsed.data.bedId,
    })
    .returning();
  const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, row.patientId));
  const [s] = await db.select().from(staffTable).where(eq(staffTable.id, row.doctorId));
  res.status(201).json(shape(row, p!, s!));
});

router.get("/encounters/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [r] = await db
    .select({ e: encountersTable, p: patientsTable, s: staffTable })
    .from(encountersTable)
    .innerJoin(patientsTable, eq(encountersTable.patientId, patientsTable.id))
    .innerJoin(staffTable, eq(encountersTable.doctorId, staffTable.id))
    .where(eq(encountersTable.id, id))
    .limit(1);
  if (!r) return res.status(404).json({ error: "Not found" });
  res.json(shape(r.e, r.p, r.s));
});

router.patch("/encounters/:id", requireRole("admin", "doctor", "nurse"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = UpdateEncounterBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const data: Partial<typeof encountersTable.$inferInsert> = {};
  if (parsed.data.status) data.status = parsed.data.status;
  if (parsed.data.chiefComplaint !== undefined) data.chiefComplaint = parsed.data.chiefComplaint;
  if (parsed.data.diagnosis !== undefined) data.diagnosis = parsed.data.diagnosis;
  if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;
  if (parsed.data.endedAt) data.endedAt = new Date(parsed.data.endedAt);
  const [row] = await db.update(encountersTable).set(data).where(eq(encountersTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, row.patientId));
  const [s] = await db.select().from(staffTable).where(eq(staffTable.id, row.doctorId));
  if (data.status === "discharged" || data.endedAt) {
    await sendNotification({
      eventKey: "discharge_summary_ready",
      channel: "both",
      patientId: row.patientId,
      variables: { patientName: p?.name, summaryUrl: `/api/pdf/discharge-summary/${row.id}` },
    });
  }
  res.json(shape(row, p!, s!));
});

export default router;
