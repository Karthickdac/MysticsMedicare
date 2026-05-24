# HMS end-to-end tests

Playwright specs that drive a real browser against a running dev stack
(or any deployed environment) to verify cross-cutting flows.

## Prerequisites

- The API server and HMS web artifacts must be running (e.g. via the
  configured workflows). The API must have the default admin seeded
  (`admin@medicare.in` / `admin123` — see
  `artifacts/api-server/src/scripts/seed.ts`).
- Install Playwright browsers once per machine:
  `pnpm --filter @workspace/hms exec playwright install chromium`.

## Running

```sh
# Local dev (defaults to http://localhost:22938 unless REPLIT_DEV_DOMAIN is set):
pnpm --filter @workspace/hms run test:e2e

# Point at a specific URL (e.g. Replit preview / staging):
E2E_BASE_URL=https://your-host.replit.dev \
  pnpm --filter @workspace/hms run test:e2e

# Override the seeded admin credentials:
E2E_ADMIN_EMAIL=ops@example.com \
  E2E_ADMIN_PASSWORD=secret \
  pnpm --filter @workspace/hms run test:e2e
```

## What's covered

`admin.spec.ts` walks the admin module end-to-end:

1. Login as the seeded admin.
2. Create a staff member with a joining date and assign a role.
3. On `/roster` (Week view): schedule Morning + Night shifts for that
   staff today, attempt a duplicate Morning to confirm the conflict
   signal (server "Cannot schedule" toast or the client-side
   "scheduling conflicts" warning card), then delete a shift.
4. On `/audit`: filter by action + 29-day date range, export CSV, and
   exercise pagination if the dataset has more than one page.
5. On `/admin/reports`: assert the Reports hub heading, KPI cards, and
   a recharts SVG render; switch the date range via the `7d` and `90d`
   presets and verify the From date moves accordingly; export the
   combined CSV and assert the filename.

The spec is intentionally tolerant of a shared dev database: it
generates unique staff names per run and never asserts empty states or
exact row counts.
