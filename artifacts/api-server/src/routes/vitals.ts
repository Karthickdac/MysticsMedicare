import { Router, type IRouter } from "express";
import { db, vitalsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { RecordVitalsBody } from "@workspace/api-zod";
import { num, requiredIso } from "../lib/format";

const router: IRouter = Router();

function shape(v: typeof vitalsTable.$inferSelect) {
  return {
    id: v.id,
    patientId: v.patientId,
    bp: v.bp,
    pulse: v.pulse,
    temperature: v.temperature ? num(v.temperature) : null,
    spo2: v.spo2,
    respiratoryRate: v.respiratoryRate,
    weight: v.weight ? num(v.weight) : null,
    height: v.height ? num(v.height) : null,
    recordedAt: requiredIso(v.recordedAt),
    recordedBy: v.recordedBy,
  };
}

router.get("/vitals", async (req, res) => {
  const where = req.query.patientId ? eq(vitalsTable.patientId, Number(req.query.patientId)) : undefined;
  const rows = await db.select().from(vitalsTable).where(where).orderBy(desc(vitalsTable.recordedAt)).limit(200);
  res.json(rows.map(shape));
});

router.post("/vitals", async (req, res) => {
  const parsed = RecordVitalsBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db
    .insert(vitalsTable)
    .values({
      patientId: parsed.data.patientId,
      bp: parsed.data.bp,
      pulse: parsed.data.pulse,
      temperature: parsed.data.temperature?.toString(),
      spo2: parsed.data.spo2,
      respiratoryRate: parsed.data.respiratoryRate,
      weight: parsed.data.weight?.toString(),
      height: parsed.data.height?.toString(),
      recordedBy: parsed.data.recordedBy,
    })
    .returning();
  res.status(201).json(shape(row));
});

export default router;
