import { Router, type IRouter } from "express";
import { db, drugsTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import { CreateDrugBody, UpdateDrugBody } from "@workspace/api-zod";
import { num, requiredIso } from "../lib/format";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();

function shape(d: typeof drugsTable.$inferSelect) {
  return {
    id: d.id,
    name: d.name,
    genericName: d.genericName,
    category: d.category,
    unit: d.unit,
    manufacturer: d.manufacturer,
    strength: d.strength,
    form: d.form,
    schedule: d.schedule,
    hsn: d.hsn,
    gstRate: num(d.gstRate),
    mrp: d.mrp == null ? null : num(d.mrp),
    reorderLevel: d.reorderLevel,
    createdAt: requiredIso(d.createdAt),
  };
}

// Drizzle numeric columns expect strings; coerce from zod-validated numbers.
function toRow(input: Partial<{ gstRate: number; mrp: number; reorderLevel: number }> & Record<string, unknown>) {
  const out: Record<string, unknown> = { ...input };
  if (input.gstRate != null) out.gstRate = String(input.gstRate);
  if (input.mrp != null) out.mrp = String(input.mrp);
  return out;
}

router.get("/drugs", async (_req, res) => {
  const rows = await db.select().from(drugsTable).orderBy(asc(drugsTable.name));
  res.json(rows.map(shape));
});

router.post("/drugs", requireRole("admin", "pharmacist"), async (req, res) => {
  const parsed = CreateDrugBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db.insert(drugsTable).values(toRow(parsed.data) as typeof drugsTable.$inferInsert).returning();
  res.status(201).json(shape(row));
});

router.patch("/drugs/:id", requireRole("admin", "pharmacist"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = UpdateDrugBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db
    .update(drugsTable)
    .set(toRow(parsed.data) as Partial<typeof drugsTable.$inferInsert>)
    .where(eq(drugsTable.id, id))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(shape(row));
});

router.delete("/drugs/:id", requireRole("admin", "pharmacist"), async (req, res) => {
  const id = Number(req.params.id);
  try {
    const [row] = await db.delete(drugsTable).where(eq(drugsTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (e) {
    // Drug is referenced by prescriptions, batches, or sale history — refuse
    // hard delete (FK violation) and ask caller to deactivate instead. Soft
    // delete would require a schema column; for now block with 409.
    const msg = (e as Error).message ?? "";
    if (msg.includes("foreign key") || msg.includes("violates")) {
      return res.status(409).json({ error: "Drug is referenced by existing prescriptions, batches, or sales and cannot be deleted." });
    }
    throw e;
  }
});

export default router;
