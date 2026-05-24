import { Router, type IRouter } from "express";
import { db, prescriptionsTable, patientsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { isoDate, requiredIso } from "../lib/format";
import { sendNotification } from "../lib/notifications";

const router: IRouter = Router();

function shape(p: typeof prescriptionsTable.$inferSelect, pt: typeof patientsTable.$inferSelect) {
  return {
    id: p.id,
    patientId: p.patientId,
    patientName: pt.name,
    encounterId: p.encounterId,
    drug: p.drug,
    dosage: p.dosage,
    frequency: p.frequency,
    duration: p.duration,
    instructions: p.instructions,
    status: p.status,
    prescribedBy: p.prescribedBy,
    createdAt: requiredIso(p.createdAt),
    dispensedAt: isoDate(p.dispensedAt),
  };
}

router.get("/pharmacy/queue", async (_req, res) => {
  const rows = await db
    .select({ p: prescriptionsTable, pt: patientsTable })
    .from(prescriptionsTable)
    .innerJoin(patientsTable, eq(prescriptionsTable.patientId, patientsTable.id))
    .where(eq(prescriptionsTable.status, "pending"))
    .orderBy(asc(prescriptionsTable.createdAt));
  res.json(rows.map((r) => shape(r.p, r.pt)));
});

router.post("/prescriptions/:id/dispense", async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db
    .update(prescriptionsTable)
    .set({ status: "dispensed", dispensedAt: new Date() })
    .where(eq(prescriptionsTable.id, id))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  const [pt] = await db.select().from(patientsTable).where(eq(patientsTable.id, row.patientId));
  await sendNotification({
    eventKey: "prescription_ready",
    channel: "sms",
    patientId: row.patientId,
    variables: { drug: row.drug },
  });
  res.json(shape(row, pt!));
});

export default router;
