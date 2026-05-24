import { Router, type IRouter } from "express";
import { db, prescriptionsTable, patientsTable } from "@workspace/db";
import { desc, eq, and } from "drizzle-orm";
import { CreatePrescriptionBody } from "@workspace/api-zod";
import { isoDate, requiredIso } from "../lib/format";

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

router.get("/prescriptions", async (req, res) => {
  const conds = [] as ReturnType<typeof eq>[];
  if (req.query.patientId) conds.push(eq(prescriptionsTable.patientId, Number(req.query.patientId)));
  if (req.query.status) conds.push(eq(prescriptionsTable.status, String(req.query.status)));
  const rows = await db
    .select({ p: prescriptionsTable, pt: patientsTable })
    .from(prescriptionsTable)
    .innerJoin(patientsTable, eq(prescriptionsTable.patientId, patientsTable.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(prescriptionsTable.createdAt))
    .limit(500);
  res.json(rows.map((r) => shape(r.p, r.pt)));
});

router.post("/prescriptions", async (req, res) => {
  const parsed = CreatePrescriptionBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db.insert(prescriptionsTable).values(parsed.data).returning();
  const [pt] = await db.select().from(patientsTable).where(eq(patientsTable.id, row.patientId));
  res.status(201).json(shape(row, pt!));
});

export default router;
