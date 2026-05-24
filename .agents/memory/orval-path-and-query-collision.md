---
name: Orval path+query collision
description: Combining path-param and query-param on the same endpoint produces duplicate Params types and breaks codegen.
---

When an OpenAPI operation declares both a path parameter (e.g. `/foo/{id}`) AND query parameters, the orval generator emits the same `XxxParams` interface twice — once into `api.ts` and once into the typed parameters folder — causing duplicate identifier TS errors at build time.

**Why:** orval splits param interfaces per location; same operationId + both locations = same name collision.

**How to apply:** either keep the query parameters and drop the path param (filter by `?id=`), or drop the query params and filter client-side. For pharmacy we kept `/pharmacy/sales?kind=rx&from=...&to=...` query-only and used separate `/pharmacy/sales/{id}` for the by-id GET.
