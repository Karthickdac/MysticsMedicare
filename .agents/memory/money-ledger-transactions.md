---
name: Money ledger transactions
description: Payment/refund writes plus the bill-row aggregate update must happen in one DB transaction, or concurrency will desync the ledger.
---

Any code path that inserts a `bill_payments` or `bill_refunds` row AND updates `bills.paidAmount` / `bills.refundedAmount` / `bills.status` must run inside a single `db.transaction(...)` block, ideally with `SELECT ... FOR UPDATE` on the bill row.

**Why:** Two concurrent payment requests both read `paidAmount=0`, both pass the "balance > 0" check, both insert payment rows, and both write `paidAmount = balance`. The bill ends up over-collected and the aggregate disagrees with the sum of `bill_payments`. Same shape of bug applies to refunds.

**How to apply:**
- Wrap insert-then-recompute-then-update in `await db.transaction(async (tx) => { ... })`.
- Re-read the bill inside the tx with a row lock before recomputing totals; do not trust the value read before the transaction.
- Cashier session close (`expectedCash` calc) reads many payment rows — fine to leave outside a tx since it's a snapshot, but reject session close if any open payment write is racing by re-checking session status inside the update.
