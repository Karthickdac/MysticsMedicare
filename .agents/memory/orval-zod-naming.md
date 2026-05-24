---
name: Orval zod schema naming
description: How orval names generated zod schemas vs TS types and how to avoid wildcard re-export collisions in api-zod.
---

For each OpenAPI operation with a request body, orval generates:
- a zod schema named `<operationId>Body` (e.g. operationId `createAdmission` → `CreateAdmissionBody`) in the api-zod package
- a TS type named after the OpenAPI **schema component** referenced by `requestBody.content.schema.$ref`

`lib/api-zod/src/index.ts` re-exports both via wildcard. If the OpenAPI schema component is named the same as the operation body zod (e.g. component `CreateAdmissionBody`), the wildcard collides → build fails.

**Rule:** name request-body OpenAPI schema components with an `*Input` suffix (e.g. `CreateAdmissionInput`). Server route files import the zod via the operation-body name (`CreateAdmissionBody`) — never the schema-component name.

Same collision occurs for `List<X>Params` zod (generated when a path has both path params and query params). Avoid query params on such endpoints in the spec; handlers still read `req.query` at runtime.
