import { Router, type IRouter } from "express";
import { db, hospitalSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateHospitalSettingsBody } from "@workspace/api-zod";
import { requiredIso } from "../lib/format";
import { requirePermission } from "../lib/auth";
import {
  getHospitalSettings,
  invalidateHospitalSettingsCache,
  shapePublic,
  type HospitalSettingsRow,
} from "../lib/hospital-settings";

const router: IRouter = Router();

function shape(r: HospitalSettingsRow) {
  return {
    id: r.id,
    name: r.name,
    legalName: r.legalName,
    gstin: r.gstin,
    pan: r.pan,
    address: r.address,
    city: r.city,
    state: r.state,
    pincode: r.pincode,
    phone: r.phone,
    email: r.email,
    website: r.website,
    logoUrl: r.logoUrl,
    primaryColor: r.primaryColor,
    invoicePrefix: r.invoicePrefix,
    receiptPrefix: r.receiptPrefix,
    workingHours: (r.workingHours as Record<string, unknown>) ?? {},
    holidays: (r.holidays as Array<{ date: string; label: string }>) ?? [],
    updatedAt: requiredIso(r.updatedAt),
  };
}

// Public subset — branding + working hours. Every authenticated user (any role
// the auth middleware permits) needs this for the app shell + booking UI.
router.get("/hospital-settings/public", async (_req, res) => {
  const row = await getHospitalSettings();
  res.json(shapePublic(row));
});

router.get("/admin/hospital-settings", requirePermission("admin.settings"), async (_req, res) => {
  const row = await getHospitalSettings();
  res.json(shape(row));
});

router.put("/admin/hospital-settings", requirePermission("admin.settings"), async (req, res) => {
  const parsed = UpdateHospitalSettingsBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  await getHospitalSettings(); // ensure row exists
  const patch = { ...parsed.data, updatedAt: new Date() } as Partial<typeof hospitalSettingsTable.$inferInsert>;
  const [row] = await db.update(hospitalSettingsTable).set(patch).where(eq(hospitalSettingsTable.id, 1)).returning();
  invalidateHospitalSettingsCache();
  res.json(shape(row));
});

export default router;
