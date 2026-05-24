import { Router, type IRouter } from "express";
import { db, hospitalSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateHospitalSettingsBody } from "@workspace/api-zod";
import { requiredIso } from "../lib/format";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();

type Row = typeof hospitalSettingsTable.$inferSelect;

async function loadOrSeed(): Promise<Row> {
  const [existing] = await db.select().from(hospitalSettingsTable).where(eq(hospitalSettingsTable.id, 1));
  if (existing) return existing;
  const [created] = await db.insert(hospitalSettingsTable).values({
    id: 1,
    name: "MediCare Pro",
    legalName: "Mystics MediCare Pvt Ltd",
    invoicePrefix: "INV",
    receiptPrefix: "RCT",
    primaryColor: "#0ea5e9",
    workingHours: {
      mon: { open: "08:00", close: "20:00" },
      tue: { open: "08:00", close: "20:00" },
      wed: { open: "08:00", close: "20:00" },
      thu: { open: "08:00", close: "20:00" },
      fri: { open: "08:00", close: "20:00" },
      sat: { open: "09:00", close: "14:00" },
      sun: { closed: true },
    },
    holidays: [],
  }).returning();
  return created;
}

function shape(r: Row) {
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

router.get("/admin/hospital-settings", requireRole("admin"), async (_req, res) => {
  const row = await loadOrSeed();
  res.json(shape(row));
});

router.put("/admin/hospital-settings", requireRole("admin"), async (req, res) => {
  const parsed = UpdateHospitalSettingsBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  await loadOrSeed();
  const patch = { ...parsed.data, updatedAt: new Date() } as Partial<typeof hospitalSettingsTable.$inferInsert>;
  const [row] = await db.update(hospitalSettingsTable).set(patch).where(eq(hospitalSettingsTable.id, 1)).returning();
  res.json(shape(row));
});

export default router;
