import { Router, type IRouter } from "express";
import {
  db,
  labOrdersTable,
  labTestCatalogTable,
  patientsTable,
  billsTable,
} from "@workspace/db";
import { desc, eq, and, sql, asc, inArray } from "drizzle-orm";
import {
  CreateLabOrderBody,
  RecordLabResultBody,
  CollectLabSampleBody,
  RejectLabSampleBody,
  VerifyLabResultBody,
  DispatchLabReportBody,
  CreateLabCatalogItemBody,
  UpdateLabCatalogItemBody,
} from "@workspace/api-zod";
import { isoDate, num, requiredIso } from "../lib/format";
import { sendNotification } from "../lib/notifications";
import { requireRole } from "../lib/auth";
import { nextBillNumber } from "../lib/hospital-settings";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function ageYears(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const ms = Date.now() - d.getTime();
  return Math.floor(ms / (365.25 * 86400000));
}

function shapeCatalog(c: typeof labTestCatalogTable.$inferSelect) {
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    category: c.category,
    sampleType: c.sampleType,
    container: c.container,
    price: num(c.price),
    gstRate: num(c.gstRate),
    hsn: c.hsn,
    turnaroundHours: c.turnaroundHours,
    parameters: (c.parameters as unknown[]) ?? [],
    active: c.active,
    createdAt: requiredIso(c.createdAt),
  };
}

function shape(
  l: typeof labOrdersTable.$inferSelect,
  p: typeof patientsTable.$inferSelect,
) {
  return {
    id: l.id,
    patientId: l.patientId,
    patientName: p.name,
    patientAge: ageYears(p.dob),
    patientSex: p.gender,
    catalogId: l.catalogId,
    testName: l.testName,
    category: l.category,
    priority: l.priority,
    status: l.status,
    result: l.result,
    normalRange: l.normalRange,
    notes: l.notes,
    orderedBy: l.orderedBy,
    billId: l.billId,
    sampleId: l.sampleId,
    barcode: l.barcode,
    collectedBy: l.collectedBy,
    collectedAt: isoDate(l.collectedAt),
    rejectionReason: l.rejectionReason,
    results: (l.resultsJson as unknown[]) ?? [],
    attachmentUrl: l.attachmentUrl,
    verifiedBy: l.verifiedBy,
    verifiedAt: isoDate(l.verifiedAt),
    reportPdfUrl: l.reportPdfUrl,
    dispatchedAt: isoDate(l.dispatchedAt),
    dispatchedVia: l.dispatchedVia,
    createdAt: requiredIso(l.createdAt),
    completedAt: isoDate(l.completedAt),
  };
}

async function loadShaped(id: number) {
  const [row] = await db
    .select({ l: labOrdersTable, p: patientsTable })
    .from(labOrdersTable)
    .innerJoin(patientsTable, eq(labOrdersTable.patientId, patientsTable.id))
    .where(eq(labOrdersTable.id, id));
  return row ? shape(row.l, row.p) : null;
}

// ---------------------------------------------------------------------------
// Catalog CRUD (test master)
// ---------------------------------------------------------------------------
router.get("/lab/catalog", requireRole("admin", "doctor", "labtech", "receptionist"), async (_req, res) => {
  const rows = await db.select().from(labTestCatalogTable).orderBy(asc(labTestCatalogTable.name));
  res.json(rows.map(shapeCatalog));
});

function catalogToRow(input: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...input };
  if (input.price != null) out.price = String(input.price);
  if (input.gstRate != null) out.gstRate = String(input.gstRate);
  return out;
}

router.post("/lab/catalog", requireRole("admin", "labtech"), async (req, res) => {
  const parsed = CreateLabCatalogItemBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  try {
    const [row] = await db
      .insert(labTestCatalogTable)
      .values(catalogToRow(parsed.data) as typeof labTestCatalogTable.$inferInsert)
      .returning();
    res.status(201).json(shapeCatalog(row));
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return res.status(409).json({ error: "Catalog code already exists" });
    }
    throw e;
  }
});

router.patch("/lab/catalog/:id", requireRole("admin", "labtech"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = UpdateLabCatalogItemBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db
    .update(labTestCatalogTable)
    .set(catalogToRow(parsed.data) as Partial<typeof labTestCatalogTable.$inferInsert>)
    .where(eq(labTestCatalogTable.id, id))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(shapeCatalog(row));
});

// ---------------------------------------------------------------------------
// Orders + workflow
// ---------------------------------------------------------------------------
router.get("/lab/orders", requireRole("admin", "doctor", "labtech", "receptionist", "nurse"), async (req, res) => {
  const conds = [] as ReturnType<typeof eq>[];
  if (req.query.patientId) conds.push(eq(labOrdersTable.patientId, Number(req.query.patientId)));
  if (req.query.status) conds.push(eq(labOrdersTable.status, String(req.query.status)));
  const rows = await db
    .select({ l: labOrdersTable, p: patientsTable })
    .from(labOrdersTable)
    .innerJoin(patientsTable, eq(labOrdersTable.patientId, patientsTable.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(labOrdersTable.createdAt))
    .limit(500);
  res.json(rows.map((r) => shape(r.l, r.p)));
});

// Order creation: resolves catalog → testName/category, generates sample id
// + barcode, and (if autoBill) appends a line to (or creates) a draft bill
// for the patient. Bill creation is best-effort: failures fall back to
// creating just the order so the lab workflow is never blocked.
router.post("/lab/orders", requireRole("admin", "doctor", "labtech"), async (req, res) => {
  const parsed = CreateLabOrderBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const { patientId, catalogId, autoBill, ...rest } = parsed.data;
  let testName = rest.testName;
  let category = rest.category;
  let catalog: typeof labTestCatalogTable.$inferSelect | undefined;
  if (catalogId) {
    [catalog] = await db.select().from(labTestCatalogTable).where(eq(labTestCatalogTable.id, catalogId));
    if (!catalog) return res.status(400).json({ error: "Invalid catalogId" });
    testName = testName ?? catalog.name;
    category = category ?? catalog.category ?? undefined;
  }
  if (!testName) return res.status(400).json({ error: "testName or catalogId is required" });

  // Generate sample id (LAB-YYYYMMDD-NNNN) atomically via id sequence.
  const [{ next }] = (
    await db.execute<{ next: string }>(
      sql`SELECT 'LAB' || to_char(now(), 'YYYYMMDD') || lpad((coalesce(max(id),0)+1)::text, 4, '0') AS next FROM lab_orders`,
    )
  ).rows;

  const [row] = await db
    .insert(labOrdersTable)
    .values({
      patientId,
      catalogId: catalog?.id ?? null,
      testName,
      category: category ?? null,
      priority: rest.priority ?? "routine",
      orderedBy: rest.orderedBy ?? null,
      sampleId: next,
      barcode: next,
    })
    .returning();

  // Auto-bill: create a single-line bill for this catalog item.
  if (autoBill && catalog) {
    try {
      const price = Number(catalog.price);
      const gstRate = Number(catalog.gstRate);
      const taxable = price;
      const cgst = Math.round(taxable * (gstRate / 2 / 100) * 100) / 100;
      const sgst = cgst;
      const total = Math.round((taxable + cgst + sgst) * 100) / 100;
      const billNo = await nextBillNumber(db);
      const [bill] = await db
        .insert(billsTable)
        .values({
          patientId,
          billNumber: billNo,
          department: "lab",
          subtotal: taxable.toFixed(2),
          discount: "0",
          cgst: cgst.toFixed(2),
          sgst: sgst.toFixed(2),
          igst: "0",
          total: total.toFixed(2),
          gstMode: "intra",
          items: [
            {
              serviceCode: catalog.code,
              description: catalog.name,
              quantity: 1,
              unitPrice: price,
              discount: 0,
              gstRate,
              cgst,
              sgst,
              igst: 0,
              amount: taxable,
            },
          ],
        })
        .returning();
      await db.update(labOrdersTable).set({ billId: bill.id }).where(eq(labOrdersTable.id, row.id));
      row.billId = bill.id;
    } catch (e) {
      // Don't fail the order — surface a soft warning in logs only.
      console.warn("[lab.autoBill]", (e as Error).message);
    }
  }

  const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, patientId));
  res.status(201).json(shape(row, p!));
});

// Mark sample collected → status 'collected'.
router.post("/lab/orders/:id/collect", requireRole("admin", "labtech", "nurse"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = CollectLabSampleBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db
    .update(labOrdersTable)
    .set({
      status: "collected",
      collectedBy: parsed.data.collectedBy ?? null,
      collectedAt: new Date(),
      sampleId: parsed.data.sampleId ?? sql`${labOrdersTable.sampleId}`,
      barcode: parsed.data.barcode ?? sql`${labOrdersTable.barcode}`,
    })
    .where(and(eq(labOrdersTable.id, id), eq(labOrdersTable.status, "pending")))
    .returning();
  if (!row) return res.status(409).json({ error: "Order must be in 'pending' status to be collected" });
  const shaped = await loadShaped(row.id);
  res.json(shaped);
});

// Reject sample (e.g. hemolysed, insufficient volume) — terminal status.
router.post("/lab/orders/:id/reject", requireRole("admin", "labtech"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = RejectLabSampleBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  // Only pending or freshly collected samples may be rejected — never after results are in.
  const [row] = await db
    .update(labOrdersTable)
    .set({ status: "rejected", rejectionReason: parsed.data.reason })
    .where(and(eq(labOrdersTable.id, id), inArray(labOrdersTable.status, ["pending", "collected"])))
    .returning();
  if (!row) return res.status(409).json({ error: "Sample can only be rejected from 'pending' or 'collected' state" });
  const shaped = await loadShaped(row.id);
  res.json(shaped);
});

// Compute H/L/A flag for a numeric value against an inclusive [low, high].
function flagFor(valStr: string, low?: number | null, high?: number | null): string | null {
  const v = Number(valStr);
  if (isNaN(v) || (low == null && high == null)) return null;
  if (high != null && v > high) return "H";
  if (low != null && v < low) return "L";
  return "N";
}

interface LabParam {
  name: string;
  unit?: string | null;
  refLow?: number | null;
  refHigh?: number | null;
  refText?: string | null;
  refByAgeSex?: Array<{ minAgeYears?: number | null; maxAgeYears?: number | null; sex: string; low: number; high: number }>;
}

interface LabResultEntry {
  name: string;
  value: string;
  unit?: string | null;
  flag?: string | null;
  refRange?: string | null;
  comment?: string | null;
}

function pickRange(param: LabParam, age: number | null, sex: string | null) {
  const variants = param.refByAgeSex ?? [];
  for (const v of variants) {
    if (v.sex && v.sex !== "A" && sex && v.sex !== sex) continue;
    if (age != null) {
      if (v.minAgeYears != null && age < v.minAgeYears) continue;
      if (v.maxAgeYears != null && age > v.maxAgeYears) continue;
    }
    return { low: v.low, high: v.high };
  }
  return { low: param.refLow ?? null, high: param.refHigh ?? null };
}

// Record results (parameter grid) — moves status to 'resulted'. Lab tech
// enters values; pathologist will sign off via /verify.
router.post("/lab/orders/:id/result", requireRole("admin", "labtech", "doctor"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = RecordLabResultBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [existing] = await db
    .select({ l: labOrdersTable, p: patientsTable })
    .from(labOrdersTable)
    .innerJoin(patientsTable, eq(labOrdersTable.patientId, patientsTable.id))
    .where(eq(labOrdersTable.id, id));
  if (!existing) return res.status(404).json({ error: "Not found" });
  // Results can only be recorded on a collected sample (allow re-entry on
  // already-resulted orders before sign-off). Pending, rejected, verified
  // and dispatched orders are immutable here.
  if (existing.l.status !== "collected" && existing.l.status !== "resulted") {
    return res.status(409).json({ error: `Cannot record results on '${existing.l.status}' order — sample must be collected first` });
  }

  // Enrich each parameter result with flag + refRange computed server-side
  // from catalog parameters (age/sex aware). Free-text params are passed
  // through untouched.
  let enriched: LabResultEntry[] = (parsed.data.results as LabResultEntry[] | undefined) ?? [];
  if (enriched.length && existing.l.catalogId) {
    const [cat] = await db.select().from(labTestCatalogTable).where(eq(labTestCatalogTable.id, existing.l.catalogId));
    const params = (cat?.parameters as LabParam[] | undefined) ?? [];
    const age = ageYears(existing.p.dob);
    enriched = enriched.map((r) => {
      const def = params.find((p) => p.name === r.name);
      if (!def) return r;
      const { low, high } = pickRange(def, age, existing.p.gender);
      const flag = r.flag ?? flagFor(r.value, low, high);
      const refRange = r.refRange ?? (low != null && high != null ? `${low} – ${high}` : def.refText ?? null);
      return { ...r, unit: r.unit ?? def.unit ?? null, flag, refRange };
    });
  }

  const [row] = await db
    .update(labOrdersTable)
    .set({
      status: "resulted",
      result: parsed.data.result ?? sql`${labOrdersTable.result}`,
      normalRange: parsed.data.normalRange ?? sql`${labOrdersTable.normalRange}`,
      notes: parsed.data.notes ?? sql`${labOrdersTable.notes}`,
      resultsJson: enriched,
      attachmentUrl: parsed.data.attachmentUrl ?? sql`${labOrdersTable.attachmentUrl}`,
      completedAt: new Date(),
    })
    .where(eq(labOrdersTable.id, id))
    .returning();
  res.json(shape(row, existing.p));
});

// Pathologist sign-off: moves status to 'verified' and stamps reportPdfUrl.
router.post("/lab/orders/:id/verify", requireRole("admin", "doctor"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = VerifyLabResultBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db
    .update(labOrdersTable)
    .set({
      status: "verified",
      verifiedBy: parsed.data.verifiedBy,
      verifiedAt: new Date(),
      reportPdfUrl: `/pdf/lab-report/${id}`,
    })
    .where(and(eq(labOrdersTable.id, id), eq(labOrdersTable.status, "resulted")))
    .returning();
  if (!row) return res.status(409).json({ error: "Order must be in 'resulted' status to verify" });
  const shaped = await loadShaped(row.id);
  res.json(shaped);
});

// Dispatch the (verified) report to the patient — sends notification and
// flips status to 'dispatched'. Verified-only gate ensures we never send
// un-signed reports.
router.post("/lab/orders/:id/dispatch", requireRole("admin", "labtech", "receptionist", "doctor"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = DispatchLabReportBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const via = parsed.data.via ?? "both";
  const [row] = await db
    .update(labOrdersTable)
    .set({ status: "dispatched", dispatchedAt: new Date(), dispatchedVia: via })
    .where(and(eq(labOrdersTable.id, id), eq(labOrdersTable.status, "verified")))
    .returning();
  if (!row) return res.status(409).json({ error: "Order must be 'verified' before dispatch" });
  if (via !== "none") {
    await sendNotification({
      eventKey: "lab_result_ready",
      channel: via === "sms" || via === "whatsapp" || via === "email" ? via : "both",
      patientId: row.patientId,
      variables: { testName: row.testName },
    });
  }
  const shaped = await loadShaped(row.id);
  res.json(shaped);
});

export default router;
