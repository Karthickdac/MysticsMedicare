import { Router, type IRouter } from "express";
import { db, radiologyTable, patientsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { CreateRadiologyOrderBody, RecordRadiologyReportBody } from "@workspace/api-zod";
import { isoDate, requiredIso } from "../lib/format";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();

function shape(r: typeof radiologyTable.$inferSelect, p: typeof patientsTable.$inferSelect) {
  return {
    id: r.id,
    patientId: r.patientId,
    patientName: p.name,
    modality: r.modality,
    bodyPart: r.bodyPart,
    status: r.status,
    findings: r.findings,
    impression: r.impression,
    radiologist: r.radiologist,
    imageUrl: r.imageUrl,
    createdAt: requiredIso(r.createdAt),
    completedAt: isoDate(r.completedAt),
  };
}

router.get("/radiology", async (req, res) => {
  const where = req.query.patientId ? eq(radiologyTable.patientId, Number(req.query.patientId)) : undefined;
  const rows = await db
    .select({ r: radiologyTable, p: patientsTable })
    .from(radiologyTable)
    .innerJoin(patientsTable, eq(radiologyTable.patientId, patientsTable.id))
    .where(where)
    .orderBy(desc(radiologyTable.createdAt))
    .limit(500);
  res.json(rows.map((x) => shape(x.r, x.p)));
});

router.post("/radiology", requireRole("admin", "doctor"), async (req, res) => {
  const parsed = CreateRadiologyOrderBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db.insert(radiologyTable).values(parsed.data).returning();
  const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, row.patientId));
  res.status(201).json(shape(row, p!));
});

router.post("/radiology/:id/report", requireRole("admin", "doctor"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = RecordRadiologyReportBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db
    .update(radiologyTable)
    .set({ ...parsed.data, status: "completed", completedAt: new Date() })
    .where(eq(radiologyTable.id, id))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, row.patientId));
  res.json(shape(row, p!));
});

export default router;
