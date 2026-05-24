---
name: requirePermission OR semantics
description: requirePermission(...perms) grants if the user holds ANY listed perm. Choosing the wrong set silently widens or narrows access.
---

`requirePermission(p1, p2, ...)` in `artifacts/api-server/src/lib/auth.ts` is an OR check: a user is allowed if their role has at least one of the listed permissions.

**Why:** When migrating off `requireRole(...)`, the natural reflex is to list all permissions that "feel related" to the route. That broadens access to every role holding any of those permissions. Example mistakes from the role-enforcement migration:
- `requirePermission("ipd.rounds", "ipd.discharge")` for discharge unintentionally let nurses in (they hold both). Tightened to `encounter.write` (admin + doctor only).
- `requirePermission("radiology.read")` for radiology scheduling cut off receptionists. Use `requirePermission("radiology.read", "appointment.write")` so receptionist keeps access via appointment.write.

**How to apply:** Before picking perms for a route, list the role set the old policy allowed, then choose perms whose **union of holders equals that role set** under `BUILTIN_ROLE_DEFS` in `lib/permissions.ts`. If no clean union exists, prefer adding a narrowly-scoped perm to the relevant built-in roles over listing perms that overshoot.
