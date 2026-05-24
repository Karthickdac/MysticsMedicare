import { Router, type IRouter } from "express";
import { db, inventoryTable } from "@workspace/db";
import { asc } from "drizzle-orm";
import { CreateInventoryItemBody } from "@workspace/api-zod";
import { dateOnly, num, requiredIso } from "../lib/format";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();

function shape(i: typeof inventoryTable.$inferSelect) {
  return {
    id: i.id,
    name: i.name,
    category: i.category,
    sku: i.sku,
    quantity: i.quantity,
    unit: i.unit,
    reorderLevel: i.reorderLevel,
    expiryDate: dateOnly(i.expiryDate),
    location: i.location,
    unitCost: i.unitCost ? num(i.unitCost) : null,
    createdAt: requiredIso(i.createdAt),
  };
}

router.get("/inventory", async (_req, res) => {
  const rows = await db.select().from(inventoryTable).orderBy(asc(inventoryTable.name));
  res.json(rows.map(shape));
});

router.post("/inventory", requireRole("admin", "pharmacist"), async (req, res) => {
  const parsed = CreateInventoryItemBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db
    .insert(inventoryTable)
    .values({
      ...parsed.data,
      unitCost: parsed.data.unitCost?.toString(),
    })
    .returning();
  res.status(201).json(shape(row));
});

export default router;
