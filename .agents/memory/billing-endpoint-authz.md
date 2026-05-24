---
name: Billing endpoint authz
description: Why every billing read endpoint (and the PDF invoice/receipt streams) must carry an explicit requireRole gate, not just requireAuth.
---

Every billing-surface route — including reads and PDF streams — must be wrapped in `requireRole(...)`.

**Why:** App-level middleware only checks `requireAuth`. If a billing GET is missing `requireRole`, *any* authenticated user (e.g. a lab tech or nurse role) can fetch invoice JSON, payment ledgers, or PDF receipts by guessing IDs. That is broken access control over financial + PII data.

**How to apply:**
- New routes under `/bills/*`, `/cashier/*`, `/reports/*`, `/pdf/invoice/*`, `/pdf/receipt/*` must declare an allow-list with `requireRole(...)`. Default cashier-touching list: `"admin","accountant","receptionist","cashier"`; add `"doctor"` only for read-only views they genuinely need.
- When you add a new financial role (e.g. "auditor"), grep every `requireRole(` in `routes/bills.ts`, `routes/cashier.ts`, `routes/reports.ts`, `routes/pdf.ts` and decide explicitly — do not assume.
- Mutations stricter than reads: void → admin only; refund → admin/accountant/cashier (not receptionist).
