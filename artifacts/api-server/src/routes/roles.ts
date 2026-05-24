import { Router, type IRouter } from "express";
import { db, rolesTable, staffTable, usersTable } from "@workspace/db";
import { asc, eq, count } from "drizzle-orm";
import { CreateRoleBody, UpdateRoleBody } from "@workspace/api-zod";
import { requiredIso } from "../lib/format";
import { requirePermission } from "../lib/auth";
import {
  KNOWN_PERMISSIONS,
  invalidateRolePermissionsCache,
  seedBuiltinRoles,
} from "../lib/permissions";

const router: IRouter = Router();

// Re-export so other modules that consume this list keep working.
export { KNOWN_PERMISSIONS };

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

router.get("/admin/roles", requirePermission("admin.roles"), async (_req, res) => {
  // Boot-time seeding handles the initial population; this is a defensive
  // top-up for fresh DB clones where the admin opens the matrix before the
  // first server-startup seed finishes.
  await seedBuiltinRoles();
  const rows = await db.select().from(rolesTable).orderBy(asc(rolesTable.name));
  res.json(rows.map(shape));
});

router.post("/admin/roles", requirePermission("admin.roles"), async (req, res) => {
  const parsed = CreateRoleBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  try {
    const [row] = await db.insert(rolesTable).values({
      name: parsed.data.name,
      description: parsed.data.description,
      permissions: parsed.data.permissions,
      isBuiltin: false,
    }).returning();
    invalidateRolePermissionsCache(parsed.data.name);
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

router.patch("/admin/roles/:id", requirePermission("admin.roles"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = UpdateRoleBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [existing] = await db.select().from(rolesTable).where(eq(rolesTable.id, id));
  if (!existing) return res.status(404).json({ error: "Not found" });
  const patch: Partial<typeof rolesTable.$inferInsert> = {};
  if (parsed.data.description !== undefined) patch.description = parsed.data.description;
  if (parsed.data.permissions !== undefined) patch.permissions = parsed.data.permissions;
  const [row] = await db.update(rolesTable).set(patch).where(eq(rolesTable.id, id)).returning();
  invalidateRolePermissionsCache(existing.name);
  res.json(shape(row));
});

router.delete("/admin/roles/:id", requirePermission("admin.roles"), async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(rolesTable).where(eq(rolesTable.id, id));
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (existing.isBuiltin) {
    return res.status(409).json({ error: "Cannot delete a built-in role" });
  }
  const [{ value: staffInUse }] = await db
    .select({ value: count() })
    .from(staffTable)
    .where(eq(staffTable.role, existing.name));
  const [{ value: usersInUse }] = await db
    .select({ value: count() })
    .from(usersTable)
    .where(eq(usersTable.role, existing.name));
  const total = Number(staffInUse) + Number(usersInUse);
  if (total > 0) {
    return res.status(409).json({
      error: `Role is in use by ${staffInUse} staff member(s) and ${usersInUse} login user(s)`,
    });
  }
  await db.delete(rolesTable).where(eq(rolesTable.id, id));
  invalidateRolePermissionsCache(existing.name);
  res.status(204).end();
});

export default router;
