import { Router, type IRouter, type Request } from "express";
import { db, patientsTable, appointmentsTable, billsTable, staffTable, labOrdersTable, radiologyTable } from "@workspace/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { renderLabReportPdf, renderRadiologyReportPdf } from "./pdf";
import {
  issuePatientCookie,
  clearPatientCookie,
  readPatientId,
  requirePatient,
} from "../lib/auth";
import { num, requiredIso } from "../lib/format";

const router: IRouter = Router();

router.post("/portal/login", async (req, res) => {
  const mrn = String(req.body?.mrn ?? "").trim();
  const phone = String(req.body?.phone ?? "").trim();
  if (!mrn || !phone) return res.status(400).json({ error: "mrn and phone required" });
  const [p] = await db
    .select()
    .from(patientsTable)
    .where(and(eq(patientsTable.uhid, mrn), eq(patientsTable.phone, phone)));
  if (!p) return res.status(401).json({ error: "Invalid credentials" });
  issuePatientCookie(res, p.id);
  res.json({ id: p.id, name: p.name, mrn: p.uhid, phone: p.phone });
});

router.post("/portal/logout", (_req, res) => {
  clearPatientCookie(res);
  res.json({ ok: true });
});

router.get("/portal/me", async (req, res) => {
  const pid = readPatientId(req);
  if (!pid) return res.status(401).json({ error: "Unauthorized" });
  const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, pid));
  if (!p) return res.status(401).json({ error: "Unauthorized" });
  res.json({ id: p.id, name: p.name, mrn: p.uhid, phone: p.phone, dob: p.dob, gender: p.gender });
});

router.get("/portal/appointments", requirePatient, async (req, res) => {
  const pid = (req as Request & { patientId: number }).patientId;
  const rows = await db
    .select({ a: appointmentsTable, s: staffTable })
    .from(appointmentsTable)
    .leftJoin(staffTable, eq(appointmentsTable.doctorId, staffTable.id))
    .where(eq(appointmentsTable.patientId, pid))
    .orderBy(desc(appointmentsTable.scheduledAt))
    .limit(100);
  res.json(
    rows.map(({ a, s }) => ({
      id: a.id,
      scheduledAt: requiredIso(a.scheduledAt),
      department: a.department,
      status: a.status,
      doctorName: s?.name ?? null,
      reason: a.reason,
    })),
  );
});

router.get("/portal/bills", requirePatient, async (req, res) => {
  const pid = (req as Request & { patientId: number }).patientId;
  const rows = await db
    .select()
    .from(billsTable)
    .where(eq(billsTable.patientId, pid))
    .orderBy(desc(billsTable.createdAt))
    .limit(100);
  res.json(
    rows.map((b) => ({
      id: b.id,
      billNumber: b.billNumber,
      status: b.status,
      total: num(b.total),
      subtotal: num(b.subtotal),
      gstAmount: num(b.cgst) + num(b.sgst) + num(b.igst),
      paymentMethod: b.paymentMethod,
      createdAt: requiredIso(b.createdAt),
    })),
  );
});

// Portal-visible lab reports: only verified or dispatched results are
// shown — keeps patients from seeing un-signed values.
router.get("/portal/lab-reports", requirePatient, async (req, res) => {
  const pid = (req as Request & { patientId: number }).patientId;
  const rows = await db
    .select()
    .from(labOrdersTable)
    .where(and(eq(labOrdersTable.patientId, pid), inArray(labOrdersTable.status, ["verified", "dispatched"])))
    .orderBy(desc(labOrdersTable.createdAt))
    .limit(100);
  res.json(
    rows.map((l) => ({
      id: l.id,
      patientId: l.patientId,
      patientName: "",
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
      collectedAt: l.collectedAt ? l.collectedAt.toISOString() : null,
      rejectionReason: l.rejectionReason,
      results: (l.resultsJson as unknown[]) ?? [],
      attachmentUrl: l.attachmentUrl,
      verifiedBy: l.verifiedBy,
      verifiedAt: l.verifiedAt ? l.verifiedAt.toISOString() : null,
      // Portal-scoped URL so patients can open it with their session.
      reportPdfUrl: `/api/portal/lab-reports/${l.id}/pdf`,
      dispatchedAt: l.dispatchedAt ? l.dispatchedAt.toISOString() : null,
      dispatchedVia: l.dispatchedVia,
      patientAcknowledgedAt: l.patientAcknowledgedAt ? l.patientAcknowledgedAt.toISOString() : null,
      createdAt: l.createdAt.toISOString(),
      completedAt: l.completedAt ? l.completedAt.toISOString() : null,
    })),
  );
});

// Stream the lab report PDF to the authenticated patient, but only after
// confirming the order belongs to them (otherwise any patient could read
// any report by guessing an ID).
router.get("/portal/lab-reports/:id/pdf", requirePatient, async (req, res) => {
  const pid = (req as Request & { patientId: number }).patientId;
  const id = Number(req.params.id);
  const [o] = await db.select().from(labOrdersTable).where(eq(labOrdersTable.id, id));
  if (!o || o.patientId !== pid) return res.status(404).json({ error: "Not found" });
  if (o.status !== "verified" && o.status !== "dispatched") {
    return res.status(403).json({ error: "Report not yet released" });
  }
  await renderLabReportPdf(res, id);
});

// Patient confirms they have received/read the report. Idempotent — the
// timestamp is only set the first time.
router.post("/portal/lab-reports/:id/acknowledge", requirePatient, async (req, res) => {
  const pid = (req as Request & { patientId: number }).patientId;
  const id = Number(req.params.id);
  const [row] = await db
    .update(labOrdersTable)
    .set({ patientAcknowledgedAt: sql`COALESCE(${labOrdersTable.patientAcknowledgedAt}, NOW())` })
    .where(and(eq(labOrdersTable.id, id), eq(labOrdersTable.patientId, pid), inArray(labOrdersTable.status, ["verified", "dispatched"])))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json({ id: row.id, patientAcknowledgedAt: row.patientAcknowledgedAt?.toISOString() ?? null });
});

router.get("/portal/radiology-reports", requirePatient, async (req, res) => {
  const pid = (req as Request & { patientId: number }).patientId;
  const rows = await db
    .select()
    .from(radiologyTable)
    .where(and(eq(radiologyTable.patientId, pid), inArray(radiologyTable.status, ["verified", "dispatched"])))
    .orderBy(desc(radiologyTable.createdAt))
    .limit(100);
  res.json(
    rows.map((r) => ({
      id: r.id,
      patientId: r.patientId,
      patientName: "",
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
      scheduledAt: r.scheduledAt ? r.scheduledAt.toISOString() : null,
      technologist: r.technologist,
      capturedAt: r.capturedAt ? r.capturedAt.toISOString() : null,
      verifiedBy: r.verifiedBy,
      verifiedAt: r.verifiedAt ? r.verifiedAt.toISOString() : null,
      reportPdfUrl: `/api/portal/radiology-reports/${r.id}/pdf`,
      dispatchedAt: r.dispatchedAt ? r.dispatchedAt.toISOString() : null,
      dispatchedVia: r.dispatchedVia,
      patientAcknowledgedAt: r.patientAcknowledgedAt ? r.patientAcknowledgedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    })),
  );
});

router.get("/portal/radiology-reports/:id/pdf", requirePatient, async (req, res) => {
  const pid = (req as Request & { patientId: number }).patientId;
  const id = Number(req.params.id);
  const [o] = await db.select().from(radiologyTable).where(eq(radiologyTable.id, id));
  if (!o || o.patientId !== pid) return res.status(404).json({ error: "Not found" });
  if (o.status !== "verified" && o.status !== "dispatched") {
    return res.status(403).json({ error: "Report not yet released" });
  }
  await renderRadiologyReportPdf(res, id);
});

router.post("/portal/radiology-reports/:id/acknowledge", requirePatient, async (req, res) => {
  const pid = (req as Request & { patientId: number }).patientId;
  const id = Number(req.params.id);
  const [row] = await db
    .update(radiologyTable)
    .set({ patientAcknowledgedAt: sql`COALESCE(${radiologyTable.patientAcknowledgedAt}, NOW())` })
    .where(and(eq(radiologyTable.id, id), eq(radiologyTable.patientId, pid), inArray(radiologyTable.status, ["verified", "dispatched"])))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json({ id: row.id, patientAcknowledgedAt: row.patientAcknowledgedAt?.toISOString() ?? null });
});

export default router;
