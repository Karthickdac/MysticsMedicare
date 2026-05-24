import { Router, type IRouter } from "express";
import { db, staffTable } from "@workspace/db";
import { asc, eq, sql } from "drizzle-orm";
import { CreateStaffBody, UpdateStaffBody } from "@workspace/api-zod";
import { requiredIso } from "../lib/format";

const router: IRouter = Router();

function shape(s: typeof staffTable.$inferSelect) {
  return {
    id: s.id,
    staffId: s.staffId,
    name: s.name,
    role: s.role,
    department: s.department,
    email: s.email,
    phone: s.phone,
    specialization: s.specialization,
    avatarUrl: s.avatarUrl,
    status: s.status,
    createdAt: requiredIso(s.createdAt),
  };
}

router.get("/staff", async (_req, res) => {
  const rows = await db.select().from(staffTable).orderBy(asc(staffTable.name));
  res.json(rows.map(shape));
});

router.post("/staff", async (req, res) => {
  const parsed = CreateStaffBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const r = await db.execute<{ next: string }>(
    sql`SELECT 'STF' || lpad((coalesce(max(id),0)+1)::text, 4, '0') AS next FROM staff`,
  );
  const next = r.rows[0]?.next ?? `STF${Date.now().toString().slice(-4)}`;
  const [row] = await db.insert(staffTable).values({ ...parsed.data, staffId: next }).returning();
  res.status(201).json(shape(row));
});

router.patch("/staff/:id", async (req, res) => {
  const id = Number(req.params.id);
  const parsed = UpdateStaffBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db.update(staffTable).set(parsed.data).where(eq(staffTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(shape(row));
});

export default router;
