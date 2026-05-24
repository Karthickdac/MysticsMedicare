import { Router, type IRouter } from "express";
import {
  db,
  radiologyTable,
  radiologyCatalogTable,
  patientsTable,
  billsTable,
} from "@workspace/db";
import { desc, eq, and, sql, asc, inArray } from "drizzle-orm";
import {
  CreateRadiologyOrderBody,
  RecordRadiologyReportBody,
  ScheduleRadiologyBody,
  CaptureRadiologyImagesBody,
  VerifyRadiologyReportBody,
  DispatchRadiologyReportBody,
  CreateRadiologyCatalogItemBody,
  UpdateRadiologyCatalogItemBody,
} from "@workspace/api-zod";
import { isoDate, num, requiredIso } from "../lib/format";
import { sendNotification } from "../lib/notifications";
import { requireRole } from "../lib/auth";
import { nextBillNumber } from "../lib/hospital-settings";

const router: IRouter = Router();

function shapeCatalog(c: typeof radiologyCatalogTable.$inferSelect) {
  return {
    id: c.id,
    code: c.code,
    modality: c.modality,
    bodyPart: c.bodyPart,
    name: c.name,
    price: num(c.price),
    gstRate: num(c.gstRate),
    hsn: c.hsn,
    durationMin: c.durationMin,
    prepInstructions: c.prepInstructions,
    active: c.active,
    createdAt: requiredIso(c.createdAt),
  };
}

function shape(r: typeof radiologyTable.$inferSelect, p: typeof patientsTable.$inferSelect) {
  return {
    id: r.id,
    patientId: r.patientId,
    patientName: p.name,
    catalogId: r.catalogId,
    modality: r.modality,
    bodyPart: r.bodyPart,
    priority: r.priority,
    status: r.status,
    findings: r.findings,
    impression: r.impression,
    radiologist: r.radiologist,
    imageUrl: r.imageUrl,
    pacsUrl: r.pacsUrl,
    billId: r.billId,
    scheduledAt: isoDate(r.scheduledAt),
    technologist: r.technologist,
    capturedAt: isoDate(r.capturedAt),
    verifiedBy: r.verifiedBy,
    verifiedAt: isoDate(r.verifiedAt),
    reportPdfUrl: r.reportPdfUrl,
    dispatchedAt: isoDate(r.dispatchedAt),
    dispatchedVia: r.dispatchedVia,
    createdAt: requiredIso(r.createdAt),
    completedAt: isoDate(r.completedAt),
  };
}

async function loadShaped(id: number) {
  const [row] = await db
    .select({ r: radiologyTable, p: patientsTable })
    .from(radiologyTable)
    .innerJoin(patientsTable, eq(radiologyTable.patientId, patientsTable.id))
    .where(eq(radiologyTable.id, id));
  return row ? shape(row.r, row.p) : null;
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------
router.get("/radiology/catalog", requireRole("admin", "doctor", "radiologist", "technologist", "receptionist"), async (_req, res) => {
  const rows = await db.select().from(radiologyCatalogTable).orderBy(asc(radiologyCatalogTable.name));
  res.json(rows.map(shapeCatalog));
});

function catalogToRow(input: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...input };
  if (input.price != null) out.price = String(input.price);
  if (input.gstRate != null) out.gstRate = String(input.gstRate);
  return out;
}

router.post("/radiology/catalog", requireRole("admin", "radiologist"), async (req, res) => {
  const parsed = CreateRadiologyCatalogItemBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  try {
    const [row] = await db
      .insert(radiologyCatalogTable)
      .values(catalogToRow(parsed.data) as typeof radiologyCatalogTable.$inferInsert)
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

router.patch("/radiology/catalog/:id", requireRole("admin", "radiologist"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = UpdateRadiologyCatalogItemBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db
    .update(radiologyCatalogTable)
    .set(catalogToRow(parsed.data) as Partial<typeof radiologyCatalogTable.$inferInsert>)
    .where(eq(radiologyCatalogTable.id, id))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(shapeCatalog(row));
});

// ---------------------------------------------------------------------------
// Orders + workflow
// ---------------------------------------------------------------------------
router.get("/radiology", requireRole("admin", "doctor", "radiologist", "technologist", "receptionist", "nurse"), async (req, res) => {
  const conds = [] as ReturnType<typeof eq>[];
  if (req.query.patientId) conds.push(eq(radiologyTable.patientId, Number(req.query.patientId)));
  const rows = await db
    .select({ r: radiologyTable, p: patientsTable })
    .from(radiologyTable)
    .innerJoin(patientsTable, eq(radiologyTable.patientId, patientsTable.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(radiologyTable.createdAt))
    .limit(500);
  res.json(rows.map((x) => shape(x.r, x.p)));
});

// Create order: resolves catalog → modality/body part, optional schedule
// and auto-bill (best-effort, single-line bill).
router.post("/radiology", requireRole("admin", "doctor", "radiologist", "receptionist"), async (req, res) => {
  const parsed = CreateRadiologyOrderBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const { patientId, catalogId, autoBill, scheduledAt, ...rest } = parsed.data;
  let modality = rest.modality;
  let bodyPart = rest.bodyPart;
  let catalog: typeof radiologyCatalogTable.$inferSelect | undefined;
  if (catalogId) {
    [catalog] = await db.select().from(radiologyCatalogTable).where(eq(radiologyCatalogTable.id, catalogId));
    if (!catalog) return res.status(400).json({ error: "Invalid catalogId" });
    modality = modality ?? catalog.modality;
    bodyPart = bodyPart ?? catalog.bodyPart;
  }
  if (!modality || !bodyPart) return res.status(400).json({ error: "modality + bodyPart (or catalogId) required" });

  const initialStatus = scheduledAt ? "scheduled" : "pending";
  const [row] = await db
    .insert(radiologyTable)
    .values({
      patientId,
      catalogId: catalog?.id ?? null,
      modality,
      bodyPart,
      priority: rest.priority ?? "routine",
      status: initialStatus,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    })
    .returning();

  if (autoBill && catalog) {
    try {
      const price = Number(catalog.price);
      const gstRate = Number(catalog.gstRate);
      const cgst = Math.round(price * (gstRate / 2 / 100) * 100) / 100;
      const sgst = cgst;
      const total = Math.round((price + cgst + sgst) * 100) / 100;
      const billNo = await nextBillNumber(db);
      const [bill] = await db
        .insert(billsTable)
        .values({
          patientId,
          billNumber: billNo,
          department: "radiology",
          subtotal: price.toFixed(2),
          discount: "0",
          cgst: cgst.toFixed(2),
          sgst: sgst.toFixed(2),
          igst: "0",
          total: total.toFixed(2),
          gstMode: "intra",
          items: [
            {
              serviceCode: catalog.code,
              description: `${catalog.modality} — ${catalog.bodyPart}`,
              quantity: 1,
              unitPrice: price,
              discount: 0,
              gstRate,
              cgst,
              sgst,
              igst: 0,
              amount: price,
            },
          ],
        })
        .returning();
      await db.update(radiologyTable).set({ billId: bill.id }).where(eq(radiologyTable.id, row.id));
      row.billId = bill.id;
    } catch (e) {
      console.warn("[radiology.autoBill]", (e as Error).message);
    }
  }

  const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, patientId));
  res.status(201).json(shape(row, p!));
});

router.post("/radiology/:id/schedule", requireRole("admin", "radiologist", "technologist", "receptionist"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = ScheduleRadiologyBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  // Reschedule only while the study has not yet been captured/reported.
  const [row] = await db
    .update(radiologyTable)
    .set({
      status: "scheduled",
      scheduledAt: new Date(parsed.data.scheduledAt),
      technologist: parsed.data.technologist ?? sql`${radiologyTable.technologist}`,
    })
    .where(and(eq(radiologyTable.id, id), inArray(radiologyTable.status, ["pending", "scheduled"])))
    .returning();
  if (!row) return res.status(409).json({ error: "Order can only be scheduled while in 'pending' or 'scheduled' state" });
  const shaped = await loadShaped(row.id);
  res.json(shaped);
});

router.post("/radiology/:id/capture", requireRole("admin", "radiologist", "technologist"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = CaptureRadiologyImagesBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db
    .update(radiologyTable)
    .set({
      status: "captured",
      capturedAt: new Date(),
      imageUrl: parsed.data.imageUrl ?? sql`${radiologyTable.imageUrl}`,
      pacsUrl: parsed.data.pacsUrl ?? sql`${radiologyTable.pacsUrl}`,
      technologist: parsed.data.technologist ?? sql`${radiologyTable.technologist}`,
    })
    .where(and(eq(radiologyTable.id, id), sql`${radiologyTable.status} in ('pending','scheduled')`))
    .returning();
  if (!row) return res.status(409).json({ error: "Order must be 'pending' or 'scheduled' to capture" });
  const shaped = await loadShaped(row.id);
  res.json(shaped);
});

router.post("/radiology/:id/report", requireRole("admin", "radiologist", "doctor"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = RecordRadiologyReportBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  // Reports may only be written/amended while in 'captured' or 'reported'
  // status — never after verification.
  const [row] = await db
    .update(radiologyTable)
    .set({
      status: "reported",
      findings: parsed.data.findings ?? sql`${radiologyTable.findings}`,
      impression: parsed.data.impression ?? sql`${radiologyTable.impression}`,
      radiologist: parsed.data.radiologist ?? sql`${radiologyTable.radiologist}`,
      completedAt: new Date(),
    })
    .where(and(eq(radiologyTable.id, id), inArray(radiologyTable.status, ["captured", "reported"])))
    .returning();
  if (!row) return res.status(409).json({ error: "Report can only be entered after capture and before verification" });
  const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, row.patientId));
  res.json(shape(row, p!));
});

router.post("/radiology/:id/verify", requireRole("admin", "radiologist"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = VerifyRadiologyReportBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db
    .update(radiologyTable)
    .set({
      status: "verified",
      verifiedBy: parsed.data.verifiedBy,
      verifiedAt: new Date(),
      reportPdfUrl: `/pdf/radiology-report/${id}`,
    })
    .where(and(eq(radiologyTable.id, id), eq(radiologyTable.status, "reported")))
    .returning();
  if (!row) return res.status(409).json({ error: "Order must be 'reported' to verify" });
  const shaped = await loadShaped(row.id);
  res.json(shaped);
});

router.post("/radiology/:id/dispatch", requireRole("admin", "radiologist", "technologist", "receptionist"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = DispatchRadiologyReportBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const via = parsed.data.via ?? "both";
  const [row] = await db
    .update(radiologyTable)
    .set({ status: "dispatched", dispatchedAt: new Date(), dispatchedVia: via })
    .where(and(eq(radiologyTable.id, id), eq(radiologyTable.status, "verified")))
    .returning();
  if (!row) return res.status(409).json({ error: "Order must be 'verified' before dispatch" });
  if (via !== "none") {
    await sendNotification({
      eventKey: "lab_result_ready",
      channel: via === "sms" || via === "whatsapp" || via === "email" ? via : "both",
      patientId: row.patientId,
      variables: { testName: `${row.modality} ${row.bodyPart}` },
    });
  }
  const shaped = await loadShaped(row.id);
  res.json(shaped);
});

export default router;
