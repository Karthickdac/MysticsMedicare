import { Router, type IRouter } from "express";
import { db, rolesTable, staffTable } from "@workspace/db";
import { asc, eq, count } from "drizzle-orm";
import { CreateRoleBody, UpdateRoleBody } from "@workspace/api-zod";
import { requiredIso } from "../lib/format";
import { requirePermission } from "../lib/auth";
import {
  KNOWN_PERMISSIONS,
  BUILTIN_ROLE_DEFS,
  invalidateRolePermissionsCache,
} from "../lib/permissions";

const router: IRouter = Router();

// Re-export so other modules that consume this list keep working.
export { KNOWN_PERMISSIONS };

async function seedBuiltinRolesIfNeeded(): Promise<void> {
  const existing = await db.select({ name: rolesTable.name }).from(rolesTable);
  const have = new Set(existing.map((r) => r.name));
  const missing = BUILTIN_ROLE_DEFS.filter((r) => !have.has(r.name));
  if (missing.length === 0) return;
  await db.insert(rolesTable).values(missing.map((r) => ({
    name: r.name, description: r.description, permissions: r.permissions, isBuiltin: true,
  })));
}

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
  await seedBuiltinRolesIfNeeded();
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
  const [{ value: inUse }] = await db
    .select({ value: count() })
    .from(staffTable)
    .where(eq(staffTable.role, existing.name));
  if (Number(inUse) > 0) {
    return res.status(409).json({ error: `Role is assigned to ${inUse} staff member(s)` });
  }
  await db.delete(rolesTable).where(eq(rolesTable.id, id));
  invalidateRolePermissionsCache(existing.name);
  res.status(204).end();
});

export default router;
