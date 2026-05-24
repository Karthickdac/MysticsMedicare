---
name: Role FK + seed order
description: staff.role and users.role both FK to roles.name. Any code that inserts staff or users on a fresh DB must seed roles first.
---

Both `staffTable.role` and `usersTable.role` reference `rolesTable.name` (onUpdate cascade, no onDelete — deletes are guarded in the API).

**Why:** Without the FK the role matrix was decorative — staff could carry role strings that no `rolesTable` row defined, so `requirePermission` resolved to empty perms. With the FK, fresh-DB seeding will fail unless `rolesTable` is populated first.

**How to apply:**
- Any seed/migration that inserts into `staffTable` or `usersTable` must call `seedBuiltinRoles()` from `artifacts/api-server/src/lib/permissions.ts` (or otherwise ensure rows exist) before the inserts.
- Server boot calls `seedBuiltinRoles()` once in `index.ts` after `server.listen`; `GET /admin/roles` also calls it defensively.
- DELETE `/admin/roles/:id` must check **both** `staffTable.role` and `usersTable.role` for usage before allowing deletion (no onDelete cascade is intentional — orphaning a login user's role would break their auth).
