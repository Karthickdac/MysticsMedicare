import { Router, type IRouter } from "express";
import { db, patientsTable } from "@workspace/db";
import { desc, eq, ilike, or, sql } from "drizzle-orm";
import { CreatePatientBody, UpdatePatientBody } from "@workspace/api-zod";
import { ageFromDob, dateOnly, requiredIso } from "../lib/format";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();

// Roles allowed to read patient PHI. Billing-only roles (cashier, accountant)
// access patients indirectly via bills; they must not list/read raw PHI.
const PATIENT_READ_ROLES = ["admin", "doctor", "nurse", "receptionist", "labtech", "pharmacist"] as const;

function shape(p: typeof patientsTable.$inferSelect) {
  return {
    id: p.id,
    uhid: p.uhid,
    name: p.name,
    gender: p.gender,
    dob: dateOnly(p.dob)!,
    age: ageFromDob(p.dob),
    phone: p.phone,
    email: p.email,
    address: p.address,
    bloodGroup: p.bloodGroup,
    allergies: p.allergies,
    emergencyContact: p.emergencyContact,
    insuranceProvider: p.insuranceProvider,
    insuranceNumber: p.insuranceNumber,
    avatarUrl: p.avatarUrl,
    createdAt: requiredIso(p.createdAt),
  };
}

router.get("/patients", requireRole(...PATIENT_READ_ROLES), async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search : null;
  const rows = await db
    .select()
    .from(patientsTable)
    .where(
      search
        ? or(
            ilike(patientsTable.name, `%${search}%`),
            ilike(patientsTable.uhid, `%${search}%`),
            ilike(patientsTable.phone, `%${search}%`),
          )
        : undefined,
    )
    .orderBy(desc(patientsTable.createdAt))
    .limit(500);
  res.json(rows.map(shape));
});

router.post("/patients", requireRole("admin", "receptionist", "doctor"), async (req, res) => {
  const parsed = CreatePatientBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [{ next }] = await db.execute<{ next: string }>(
    sql`SELECT 'UH' || lpad((coalesce(max(id), 0) + 1)::text, 6, '0') AS next FROM patients`,
  ).then((r) => (r as unknown as { rows: { next: string }[] }).rows ? (r as unknown as { rows: { next: string }[] }).rows : [{ next: "UH000001" }]).catch(() => [{ next: "UH000001" }]);

  const [row] = await db
    .insert(patientsTable)
    .values({
      uhid: next ?? `UH${Date.now().toString().slice(-6)}`,
      name: parsed.data.name,
      gender: parsed.data.gender,
      dob: parsed.data.dob,
      phone: parsed.data.phone,
      email: parsed.data.email,
      address: parsed.data.address,
      bloodGroup: parsed.data.bloodGroup,
      allergies: parsed.data.allergies,
      emergencyContact: parsed.data.emergencyContact,
      insuranceProvider: parsed.data.insuranceProvider,
      insuranceNumber: parsed.data.insuranceNumber,
    })
    .returning();
  res.status(201).json(shape(row));
});

router.get("/patients/:id", requireRole(...PATIENT_READ_ROLES), async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db.select().from(patientsTable).where(eq(patientsTable.id, id)).limit(1);
  if (!row) return res.status(404).json({ error: "Patient not found" });
  res.json(shape(row));
});

router.patch("/patients/:id", requireRole("admin", "receptionist", "doctor"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = UpdatePatientBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db.update(patientsTable).set(parsed.data).where(eq(patientsTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Patient not found" });
  res.json(shape(row));
});

router.delete("/patients/:id", requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(patientsTable).where(eq(patientsTable.id, id));
  res.status(204).send();
});

export default router;
