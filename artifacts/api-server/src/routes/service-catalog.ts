import { Router, type IRouter } from "express";
import { db, serviceCatalogTable } from "@workspace/db";
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { CreateServiceCatalogItemBody, UpdateServiceCatalogItemBody } from "@workspace/api-zod";
import { num } from "../lib/format";
import { requirePermission } from "../lib/auth";

const router: IRouter = Router();

function shape(s: typeof serviceCatalogTable.$inferSelect) {
  return {
    id: s.id,
    code: s.code,
    name: s.name,
    category: s.category,
    department: s.department,
    unitPrice: num(s.unitPrice),
    gstRate: num(s.gstRate),
    hsnSac: s.hsnSac,
    isPackage: s.isPackage,
    isActive: s.isActive,
  };
}

// Seed minimal catalog on first call so the UI is never empty in fresh
// installs. Safe: guarded by a count check and conflict-aware insert.
async function ensureSeed() {
  const [{ c }] = (await db.execute<{ c: number }>(sql`SELECT count(*)::int AS c FROM service_catalog`)).rows;
  if (c > 0) return;
  const seed = [
    { code: "CON-GEN", name: "General Consultation", category: "Consultation", department: "OPD", unitPrice: "500", gstRate: "0" },
    { code: "CON-SPL", name: "Specialist Consultation", category: "Consultation", department: "OPD", unitPrice: "1000", gstRate: "0" },
    { code: "ROOM-GEN", name: "General Ward — per day", category: "Room", department: "IPD", unitPrice: "1500", gstRate: "0" },
    { code: "ROOM-PVT", name: "Private Room — per day", category: "Room", department: "IPD", unitPrice: "5000", gstRate: "12" },
    { code: "ROOM-ICU", name: "ICU — per day", category: "Room", department: "ICU", unitPrice: "12000", gstRate: "0" },
    { code: "LAB-CBC", name: "Complete Blood Count (CBC)", category: "Lab", department: "Lab", unitPrice: "400", gstRate: "18", hsnSac: "9993" },
    { code: "LAB-LFT", name: "Liver Function Test", category: "Lab", department: "Lab", unitPrice: "800", gstRate: "18", hsnSac: "9993" },
    { code: "RAD-XRAY", name: "X-Ray (single view)", category: "Radiology", department: "Radiology", unitPrice: "600", gstRate: "18" },
    { code: "RAD-USG", name: "Ultrasound — Abdomen", category: "Radiology", department: "Radiology", unitPrice: "1500", gstRate: "18" },
    { code: "PROC-ECG", name: "ECG", category: "Procedure", department: "Cardiology", unitPrice: "300", gstRate: "18" },
    { code: "PROC-MIN", name: "Minor Procedure", category: "Procedure", department: "OPD", unitPrice: "2000", gstRate: "18" },
    { code: "PKG-MHC", name: "Master Health Checkup", category: "Package", department: "Preventive", unitPrice: "4500", gstRate: "18", isPackage: true },
    { code: "PKG-DIAB", name: "Diabetes Care Package", category: "Package", department: "Preventive", unitPrice: "2500", gstRate: "18", isPackage: true },
    { code: "PHARM-MISC", name: "Pharmacy — Misc", category: "Pharmacy", department: "Pharmacy", unitPrice: "0", gstRate: "12" },
  ];
  await db.insert(serviceCatalogTable).values(
    seed.map((s) => ({
      code: s.code,
      name: s.name,
      category: s.category,
      department: s.department,
      unitPrice: s.unitPrice,
      gstRate: s.gstRate,
      hsnSac: s.hsnSac ?? null,
      isPackage: s.isPackage ?? false,
    })),
  ).onConflictDoNothing();
}

router.get("/service-catalog", async (req, res) => {
  await ensureSeed();
  const conds: ReturnType<typeof eq>[] = [];
  if (!req.query.includeInactive) conds.push(eq(serviceCatalogTable.isActive, true));
  if (req.query.category) conds.push(eq(serviceCatalogTable.category, String(req.query.category)));
  if (req.query.search) {
    const q = `%${String(req.query.search)}%`;
    const orExpr = or(
      ilike(serviceCatalogTable.name, q),
      ilike(serviceCatalogTable.code, q),
    );
    if (orExpr) conds.push(orExpr as unknown as ReturnType<typeof eq>);
  }
  const rows = await db
    .select()
    .from(serviceCatalogTable)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(serviceCatalogTable.category), asc(serviceCatalogTable.name))
    .limit(500);
  res.json(rows.map(shape));
});

router.post("/service-catalog", requirePermission("admin.settings"), async (req, res) => {
  const parsed = CreateServiceCatalogItemBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const d = parsed.data;
  const [row] = await db
    .insert(serviceCatalogTable)
    .values({
      code: d.code,
      name: d.name,
      category: d.category,
      department: d.department ?? null,
      unitPrice: Number(d.unitPrice).toFixed(2),
      gstRate: (d.gstRate ?? 18).toString(),
      hsnSac: d.hsnSac ?? null,
      isPackage: d.isPackage ?? false,
      isActive: d.isActive ?? true,
    })
    .returning();
  res.status(201).json(shape(row));
});

router.patch("/service-catalog/:id", requirePermission("admin.settings"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = UpdateServiceCatalogItemBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const d = parsed.data;
  const patch: Partial<typeof serviceCatalogTable.$inferInsert> = {};
  if (d.name != null) patch.name = d.name;
  if (d.category != null) patch.category = d.category;
  if (d.department != null) patch.department = d.department;
  if (d.unitPrice != null) patch.unitPrice = Number(d.unitPrice).toFixed(2);
  if (d.gstRate != null) patch.gstRate = String(d.gstRate);
  if (d.hsnSac != null) patch.hsnSac = d.hsnSac;
  if (d.isPackage != null) patch.isPackage = d.isPackage;
  if (d.isActive != null) patch.isActive = d.isActive;
  const [row] = await db.update(serviceCatalogTable).set(patch).where(eq(serviceCatalogTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(shape(row));
});

export default router;
