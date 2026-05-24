import { Router, type IRouter } from "express";
import {
  db,
  staffTable,
  appointmentsTable,
  encountersTable,
  admissionsTable,
} from "@workspace/db";
import { asc, eq, sql, count } from "drizzle-orm";
import { CreateStaffBody, UpdateStaffBody } from "@workspace/api-zod";
import { dateOnly, requiredIso } from "../lib/format";
import { requireRole } from "../lib/auth";

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
    joiningDate: dateOnly(s.joiningDate),
    createdAt: requiredIso(s.createdAt),
  };
}

router.get("/staff", async (_req, res) => {
  const rows = await db.select().from(staffTable).orderBy(asc(staffTable.name));
  res.json(rows.map(shape));
});

router.post("/staff", requireRole("admin"), async (req, res) => {
  const parsed = CreateStaffBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const r = await db.execute<{ next: string }>(
    sql`SELECT 'STF' || lpad((coalesce(max(id),0)+1)::text, 4, '0') AS next FROM staff`,
  );
  const next = r.rows[0]?.next ?? `STF${Date.now().toString().slice(-4)}`;
  const [row] = await db
    .insert(staffTable)
    .values({ ...parsed.data, staffId: next })
    .returning();
  res.status(201).json(shape(row));
});

router.patch("/staff/:id", requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = UpdateStaffBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db.update(staffTable).set(parsed.data).where(eq(staffTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(shape(row));
});

router.delete("/staff/:id", requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(staffTable).where(eq(staffTable.id, id));
  if (!existing) return res.status(404).json({ error: "Not found" });
  // Hard-delete is unsafe — staff is referenced by appointments, encounters,
  // admissions, prescriptions, etc. Block delete when there are dependents
  // and suggest suspending the account instead.
  const checks = await Promise.all([
    db.select({ v: count() }).from(appointmentsTable).where(eq(appointmentsTable.doctorId, id)),
    db.select({ v: count() }).from(encountersTable).where(eq(encountersTable.doctorId, id)),
    db.select({ v: count() }).from(admissionsTable).where(eq(admissionsTable.doctorId, id)),
  ]);
  const total = checks.reduce((s, [r]) => s + Number(r.v), 0);
  if (total > 0) {
    return res.status(409).json({
      error: `Cannot delete — ${total} clinical records reference this staff member. Mark as suspended instead.`,
    });
  }
  await db.delete(staffTable).where(eq(staffTable.id, id));
  res.status(204).end();
});

export default router;
