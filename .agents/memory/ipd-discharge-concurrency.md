---
name: IPD discharge / MAR integrity invariants
description: Concurrency and authorization rules for admission discharge and MAR POST that future IPD edits must preserve.
---

**Discharge rule:** `POST /admissions/:id/discharge` must take `pg_advisory_xact_lock(<admission id>)` then `pg_advisory_xact_lock(<bed id>)` (matching the keyspace used by admit/transfer on bed id), re-read the admission inside the lock, and use the latest `bedId` for the bed release. The bed is released to status `cleaning` (not `available`) — housekeeping flips it to `available` later.

**Why:** without the admission lock + re-read, a concurrent transfer can move the patient to a new bed between the discharge's initial read and the bed update, leaving a discharged admission still showing the patient as occupying the new bed.

**MAR write rule:** `POST /admissions/:id/mar` must (1) confirm the admission exists and `status === "active"`, (2) load the prescription and confirm it belongs to this admission (match on `encounterId` when present, else fall back to `patientId`), and (3) upsert on `(admissionId, prescriptionId, scheduledAt)` — re-clicking "Given" must not create duplicate dose rows.

**Why:** the path is reachable by any authenticated nurse, so without the prescription-ownership check a nurse could record doses against unrelated patients' prescriptions and corrupt the medication record.

**Deprecated path:** `POST /beds/:id/discharge` is housekeeping-only; if the bed has an active admission it must 409 and redirect the caller to the admission discharge endpoint. Don't reuse it to close admissions — it bypasses encounter closure and the `discharge_summary_ready` notification.
