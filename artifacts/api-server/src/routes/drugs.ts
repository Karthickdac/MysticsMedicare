import { Router, type IRouter } from "express";
import { db, drugsTable } from "@workspace/db";
import { asc } from "drizzle-orm";
import { CreateDrugBody } from "@workspace/api-zod";
import { requiredIso } from "../lib/format";
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
    createdAt: requiredIso(d.createdAt),
  };
}

router.get("/drugs", async (_req, res) => {
  const rows = await db.select().from(drugsTable).orderBy(asc(drugsTable.name));
  res.json(rows.map(shape));
});

router.post("/drugs", requireRole("admin", "pharmacist"), async (req, res) => {
  const parsed = CreateDrugBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db.insert(drugsTable).values(parsed.data).returning();
  res.status(201).json(shape(row));
});

export default router;
