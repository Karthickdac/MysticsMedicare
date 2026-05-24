import { Router, type IRouter } from "express";
import { db, rolesTable, staffTable } from "@workspace/db";
import { asc, eq, count } from "drizzle-orm";
import { CreateRoleBody, UpdateRoleBody } from "@workspace/api-zod";
import { requiredIso } from "../lib/format";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();

// Curated catalog of permission strings the UI exposes in the matrix. Keep
// this in sync with what front-end code actually checks. New permissions
// should be added here so admins can grant them to custom roles.
export const KNOWN_PERMISSIONS = [
  "patient.read", "patient.write", "patient.delete",
  "appointment.read", "appointment.write", "appointment.cancel",
  "encounter.read", "encounter.write",
  "lab.read", "lab.order", "lab.result", "lab.verify",
  "radiology.read", "radiology.order", "radiology.report", "radiology.verify",
  "prescription.read", "prescription.write", "prescription.dispense",
  "pharmacy.read", "pharmacy.sell", "pharmacy.purchase", "pharmacy.grn",
  "billing.read", "billing.create", "billing.collect", "billing.refund", "billing.void", "billing.claim",
  "ipd.admit", "ipd.discharge", "ipd.nursing", "ipd.rounds",
  "ot.read", "ot.book", "ot.complete",
  "inventory.read", "inventory.write",
  "vaccination.read", "vaccination.write",
  "consent.read", "consent.write",
  "vitals.read", "vitals.write",
  "videos.read", "videos.upload",
  "roster.read", "roster.write",
  "staff.read", "staff.write",
  "reports.read", "reports.export",
  "admin.settings", "admin.roles", "admin.audit", "admin.notifications",
] as const;

// Seeded on first request to avoid a hard ordering dep on app boot.
const BUILTIN_ROLE_DEFS: Array<{ name: string; description: string; permissions: string[] }> = [
  { name: "admin", description: "Full system access", permissions: [...KNOWN_PERMISSIONS] },
  { name: "doctor", description: "Physician — clinical workflows", permissions: [
    "patient.read","patient.write","appointment.read","appointment.write","appointment.cancel",
    "encounter.read","encounter.write","lab.read","lab.order","lab.result","lab.verify",
    "radiology.read","radiology.order","radiology.report","radiology.verify",
    "prescription.read","prescription.write","vitals.read","vitals.write",
    "ipd.admit","ipd.discharge","ipd.rounds","ot.read","ot.book","ot.complete",
    "vaccination.read","vaccination.write","consent.read","consent.write","videos.read","videos.upload",
    "roster.read","reports.read",
  ]},
  { name: "nurse", description: "Nursing — vitals, MAR, rounds", permissions: [
    "patient.read","encounter.read","vitals.read","vitals.write","ipd.nursing","ipd.rounds",
    "ipd.discharge","ot.read","ot.complete","vaccination.read","vaccination.write",
    "pharmacy.read","prescription.read","prescription.dispense","roster.read",
  ]},
  { name: "receptionist", description: "Front desk — appointments, registration", permissions: [
    "patient.read","patient.write","appointment.read","appointment.write","appointment.cancel",
    "encounter.read","billing.read","billing.create","ipd.admit","roster.read",
  ]},
  { name: "accountant", description: "Finance — bills, reports, GST", permissions: [
    "billing.read","billing.create","billing.collect","billing.refund","billing.void","billing.claim",
    "reports.read","reports.export",
  ]},
  { name: "cashier", description: "Front-desk collections", permissions: [
    "billing.read","billing.create","billing.collect","patient.read",
  ]},
  { name: "pharmacist", description: "Pharmacy dispense + purchase", permissions: [
    "pharmacy.read","pharmacy.sell","pharmacy.purchase","pharmacy.grn",
    "prescription.read","prescription.dispense","inventory.read","inventory.write",
  ]},
  { name: "lab_tech", description: "Lab sample collection + result entry", permissions: [
    "lab.read","lab.result","patient.read",
  ]},
  { name: "radiologist", description: "Radiology reporting", permissions: [
    "radiology.read","radiology.report","radiology.verify","patient.read",
  ]},
];

async function seedBuiltinRolesIfNeeded(): Promise<void> {
  const existing = await db.select({ name: rolesTable.name }).from(rolesTable);
  const have = new Set(existing.map((r) => r.name));
  const missing = BUILTIN_ROLE_DEFS.filter((r) => !have.has(r.name));
  if (missing.length === 0) return;
  await db.insert(rolesTable).values(missing.map((r) => ({
    name: r.name, description: r.description, permissions: r.permissions, isBuiltin: true,
  })));
}

function shape(r: typeof rolesTable.$inferSelect) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    permissions: (r.permissions as string[]) ?? [],
    isBuiltin: r.isBuiltin,
    createdAt: requiredIso(r.createdAt),
  };
}

router.get("/admin/roles", requireRole("admin"), async (_req, res) => {
  await seedBuiltinRolesIfNeeded();
  const rows = await db.select().from(rolesTable).orderBy(asc(rolesTable.name));
  res.json(rows.map(shape));
});

router.post("/admin/roles", requireRole("admin"), async (req, res) => {
  const parsed = CreateRoleBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  try {
    const [row] = await db.insert(rolesTable).values({
      name: parsed.data.name,
      description: parsed.data.description,
      permissions: parsed.data.permissions,
      isBuiltin: false,
    }).returning();
    res.status(201).json(shape(row));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/unique|duplicate/i.test(msg)) {
      res.status(409).json({ error: `Role "${parsed.data.name}" already exists` });
      return;
    }
    throw e;
  }
});

router.patch("/admin/roles/:id", requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = UpdateRoleBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [existing] = await db.select().from(rolesTable).where(eq(rolesTable.id, id));
  if (!existing) return res.status(404).json({ error: "Not found" });
  const patch: Partial<typeof rolesTable.$inferInsert> = {};
  if (parsed.data.description !== undefined) patch.description = parsed.data.description;
  if (parsed.data.permissions !== undefined) patch.permissions = parsed.data.permissions;
  const [row] = await db.update(rolesTable).set(patch).where(eq(rolesTable.id, id)).returning();
  res.json(shape(row));
});

router.delete("/admin/roles/:id", requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(rolesTable).where(eq(rolesTable.id, id));
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (existing.isBuiltin) {
    return res.status(409).json({ error: "Cannot delete a built-in role" });
  }
  const [{ value: inUse }] = await db
    .select({ value: count() })
    .from(staffTable)
    .where(eq(staffTable.role, existing.name));
  if (Number(inUse) > 0) {
    return res.status(409).json({ error: `Role is assigned to ${inUse} staff member(s)` });
  }
  await db.delete(rolesTable).where(eq(rolesTable.id, id));
  res.status(204).end();
});

export default router;
