import { Router, type IRouter } from "express";
import { db, vaccinationsTable, patientsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { RecordVaccinationBody } from "@workspace/api-zod";
import { dateOnly, requiredIso } from "../lib/format";
import { requirePermission } from "../lib/auth";
import { sendNotification } from "../lib/notifications";

const router: IRouter = Router();

function shape(v: typeof vaccinationsTable.$inferSelect, p: typeof patientsTable.$inferSelect) {
  return {
    id: v.id,
    patientId: v.patientId,
    patientName: p.name,
    vaccineName: v.vaccineName,
    doseNumber: v.doseNumber,
    batchNumber: v.batchNumber,
    administeredBy: v.administeredBy,
    nextDueDate: dateOnly(v.nextDueDate),
    administeredAt: requiredIso(v.administeredAt),
    createdAt: requiredIso(v.createdAt),
  };
}

router.get("/vaccinations", async (req, res) => {
  const where = req.query.patientId ? eq(vaccinationsTable.patientId, Number(req.query.patientId)) : undefined;
  const rows = await db
    .select({ v: vaccinationsTable, p: patientsTable })
    .from(vaccinationsTable)
    .innerJoin(patientsTable, eq(vaccinationsTable.patientId, patientsTable.id))
    .where(where)
    .orderBy(desc(vaccinationsTable.administeredAt))
    .limit(500);
  res.json(rows.map((r) => shape(r.v, r.p)));
});

router.post("/vaccinations", requirePermission("vaccination.write"), async (req, res) => {
  const parsed = RecordVaccinationBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db
    .insert(vaccinationsTable)
    .values({ ...parsed.data, administeredAt: new Date(parsed.data.administeredAt) })
    .returning();
  const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, row.patientId));
  if (row.nextDueDate) {
    await sendNotification({
      eventKey: "vaccination_reminder",
      channel: "both",
      patientId: row.patientId,
      variables: { patientName: p?.name, vaccineName: row.vaccineName, nextDueDate: dateOnly(row.nextDueDate) },
    });
  }
  res.status(201).json(shape(row, p!));
});

export default router;
