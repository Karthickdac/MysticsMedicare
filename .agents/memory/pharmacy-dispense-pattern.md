---
name: Pharmacy dispense pattern
description: Transactional pattern for pharmacy sales — batch locking, FEFO, inline bill posting, Rx safety.
---

When dispensing pharmacy stock (Rx or OTC), the sale handler must do everything in one DB transaction:

1. Collect distinct batch IDs from line items, sort ASC, then `SELECT ... FROM pharmacy_batches WHERE id IN (...) FOR UPDATE`. Sorting prevents deadlocks across concurrent sales touching overlapping batches.
2. Aggregate requested qty per batch (a single sale may name the same batch twice). Reject if `qtyOnHand < requested`.
3. Build per-line GST/HSN-tagged items by joining `drugs` once; persist `gstRate` snapshot onto `pharmacy_sale_items` so bill totals stay correct even if formulary GST changes later.
4. Decrement each batch in the same tx.
5. If `patientId`, generate an `INV...` bill number with `SELECT 'INV'||to_char(now(),'YYYYMMDD')||lpad((coalesce(max(id),0)+1)::text,4,'0')` (same pattern as `bills.ts`) and insert a `bills` row with intra-state GST split (CGST/SGST halves). HSN goes into `bill_items[].serviceCode`.
6. Insert `pharmacy_sales` + `pharmacy_sale_items`.
7. If `prescriptionId` provided, `SELECT ... FROM prescriptions WHERE id=? FOR UPDATE` and verify `status='pending'` AND `patient_id` matches before updating to `dispensed`. Without this, two concurrent dispense calls double-dispense the same Rx.

**Why:** all of (stock decrement, bill creation, Rx status change) must commit or roll back together — partial commits leak stock or charge patients twice.

**How to apply:** any new pharmacy mutation (returns, GRN merges, transfers) must also use row-level locks on `pharmacy_batches` (and on the merge-target row for GRN). The schema enforces a unique index on `(drug_id, batch_no, expiry)` so GRN merge-or-insert cannot create duplicate batch rows under race; conflict-safe upsert is the preferred merge mechanic.

**Input bounds:** OpenAPI numeric types alone don't reject negatives. Always re-check `qty > 0 && Number.isInteger(qty)`, `discount >= 0`, `costPerUnit >= 0`, `mrp >= 0` server-side before opening the tx — negative qty otherwise *increases* stock via `qtyOnHand - (-q)`.
