import { Router, type IRouter } from "express";
import { db, consentFormsTable, patientsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { CreateConsentFormBody } from "@workspace/api-zod";
import { requiredIso } from "../lib/format";

const router: IRouter = Router();

function shape(c: typeof consentFormsTable.$inferSelect, p: typeof patientsTable.$inferSelect) {
  return {
    id: c.id,
    patientId: c.patientId,
    patientName: p.name,
    type: c.type,
    details: c.details,
    signatureData: c.signatureData,
    witness: c.witness,
    signedAt: requiredIso(c.signedAt),
    createdAt: requiredIso(c.createdAt),
  };
}

router.get("/consent", async (req, res) => {
  const where = req.query.patientId ? eq(consentFormsTable.patientId, Number(req.query.patientId)) : undefined;
  const rows = await db
    .select({ c: consentFormsTable, p: patientsTable })
    .from(consentFormsTable)
    .innerJoin(patientsTable, eq(consentFormsTable.patientId, patientsTable.id))
    .where(where)
    .orderBy(desc(consentFormsTable.signedAt))
    .limit(500);
  res.json(rows.map((r) => shape(r.c, r.p)));
});

router.post("/consent", async (req, res) => {
  const parsed = CreateConsentFormBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db
    .insert(consentFormsTable)
    .values({ ...parsed.data, signedAt: new Date(parsed.data.signedAt) })
    .returning();
  const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, row.patientId));
  res.status(201).json(shape(row, p!));
});

export default router;
