import { Router, type IRouter } from "express";
import { db, checkupPackagesTable } from "@workspace/db";
import { asc } from "drizzle-orm";
import { CreateCheckupPackageBody } from "@workspace/api-zod";
import { num, requiredIso } from "../lib/format";
import { requirePermission } from "../lib/auth";

const router: IRouter = Router();

function shape(c: typeof checkupPackagesTable.$inferSelect) {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    price: num(c.price),
    tests: (c.tests as string[]) ?? [],
    createdAt: requiredIso(c.createdAt),
  };
}

router.get("/checkups/packages", async (_req, res) => {
  const rows = await db.select().from(checkupPackagesTable).orderBy(asc(checkupPackagesTable.name));
  res.json(rows.map(shape));
});

router.post("/checkups/packages", requirePermission("admin.settings"), async (req, res) => {
  const parsed = CreateCheckupPackageBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db
    .insert(checkupPackagesTable)
    .values({
      name: parsed.data.name,
      description: parsed.data.description,
      price: parsed.data.price.toString(),
      tests: parsed.data.tests,
    })
    .returning();
  res.status(201).json(shape(row));
});

export default router;
