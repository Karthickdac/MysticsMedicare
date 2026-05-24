import { Router, type IRouter, type Response } from "express";
import PDFDocument from "pdfkit";
import {
  db,
  patientsTable,
  billsTable,
  billPaymentsTable,
  encountersTable,
  labOrdersTable,
  radiologyTable,
  prescriptionsTable,
  vitalsTable,
  vaccinationsTable,
  admissionsTable,
  marEntriesTable,
} from "@workspace/db";
import { and, desc, eq, gte } from "drizzle-orm";
import { num } from "../lib/format";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();

function startPdf(res: Response, filename: string) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  doc.pipe(res);
  doc.fontSize(20).text("MediCare HMS Plus", { align: "center" });
  doc.fontSize(10).fillColor("#666").text("Hospital Management System", { align: "center" });
  doc.moveDown().fillColor("#000");
  return doc;
}

function inr(n: string | number | null | undefined) {
  return `Rs. ${num(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function renderInvoicePdf(res: Response, id: number): Promise<void> {
  const [b] = await db.select().from(billsTable).where(eq(billsTable.id, id));
  if (!b) { res.status(404).json({ error: "Bill not found" }); return; }
  const [p] = b.patientId ? await db.select().from(patientsTable).where(eq(patientsTable.id, b.patientId)) : [null];
  const payments = await db.select().from(billPaymentsTable).where(eq(billPaymentsTable.billId, id));
  const doc = startPdf(res, `invoice-${b.billNumber}.pdf`);
  doc.fontSize(16).text("TAX INVOICE", { align: "center" });
  doc.fontSize(9).fillColor("#666")
    .text("123 Health Avenue, New Delhi 110001 — GSTIN: 07AABCU9603R1ZX", { align: "center" });
  doc.fillColor("#000").moveDown();

  const headerY = doc.y;
  doc.fontSize(10);
  doc.text(`Invoice #: ${b.billNumber}`, 50, headerY);
  doc.text(`Date: ${new Date(b.createdAt).toLocaleString("en-IN")}`);
  doc.text(`GST Mode: ${b.gstMode === "inter" ? "Inter-state (IGST)" : "Intra-state (CGST+SGST)"}`);
  doc.text(`Status: ${b.status.toUpperCase()}`);

  if (p) {
    doc.text(`Patient: ${p.name}  (UHID: ${p.uhid})`, 320, headerY);
    doc.text(`Phone: ${p.phone}`, 320);
    if (b.insuranceProvider) doc.text(`Insurer: ${b.insuranceProvider}${b.tpa ? ` (${b.tpa})` : ""}`, 320);
    if (b.policyNumber) doc.text(`Policy: ${b.policyNumber}`, 320);
  }
  doc.moveDown(2);

  // Items table
  const items = (b.items as Array<{ description: string; serviceCode?: string; quantity: number; unitPrice: number; discount?: number; gstRate?: number; amount: number }>) ?? [];
  const tableTop = doc.y;
  doc.fontSize(9).fillColor("#666");
  doc.text("Service", 50, tableTop, { width: 230 });
  doc.text("HSN", 280, tableTop, { width: 50 });
  doc.text("Qty", 330, tableTop, { width: 40, align: "right" });
  doc.text("Rate", 370, tableTop, { width: 60, align: "right" });
  doc.text("GST%", 430, tableTop, { width: 40, align: "right" });
  doc.text("Amount", 470, tableTop, { width: 80, align: "right" });
  doc.moveTo(50, tableTop + 14).lineTo(550, tableTop + 14).strokeColor("#ccc").stroke();
  doc.fillColor("#000");
  let y = tableTop + 20;
  for (const it of items) {
    doc.fontSize(9).text(it.description, 50, y, { width: 230 });
    doc.text(it.serviceCode ?? "—", 280, y, { width: 50 });
    doc.text(String(it.quantity), 330, y, { width: 40, align: "right" });
    doc.text(num(it.unitPrice).toFixed(2), 370, y, { width: 60, align: "right" });
    doc.text(num(it.gstRate ?? 18).toFixed(0) + "%", 430, y, { width: 40, align: "right" });
    doc.text(num(it.amount).toFixed(2), 470, y, { width: 80, align: "right" });
    y += 16;
    if (y > 720) { doc.addPage(); y = 60; }
  }
  doc.moveTo(50, y).lineTo(550, y).strokeColor("#ccc").stroke();
  y += 10;

  // Totals block
  const rightCol = 470;
  const labelCol = 360;
  function row(label: string, val: string, bold = false) {
    if (bold) doc.fontSize(11).font("Helvetica-Bold"); else doc.fontSize(10).font("Helvetica");
    doc.text(label, labelCol, y, { width: 110, align: "right" });
    doc.text(val, rightCol, y, { width: 80, align: "right" });
    y += bold ? 18 : 14;
    doc.font("Helvetica");
  }
  row("Subtotal", inr(b.subtotal));
  if (num(b.discount) > 0) row("Discount", "- " + inr(b.discount));
  if (num(b.cgst) > 0) row("CGST", inr(b.cgst));
  if (num(b.sgst) > 0) row("SGST", inr(b.sgst));
  if (num(b.igst) > 0) row("IGST", inr(b.igst));
  row("Grand Total", inr(b.total), true);
  if (num(b.paidAmount) > 0) row("Paid", inr(b.paidAmount));
  if (num(b.refundedAmount) > 0) row("Refunded", inr(b.refundedAmount));
  const balance = num(b.total) - num(b.paidAmount) + num(b.refundedAmount);
  row("Balance Due", inr(balance), true);

  if (payments.length > 0) {
    y += 12;
    doc.fontSize(10).font("Helvetica-Bold").text("Payments", 50, y); y += 14;
    doc.font("Helvetica").fontSize(9);
    for (const pay of payments) {
      doc.text(
        `${new Date(pay.receivedAt).toLocaleString("en-IN")}  •  ${pay.receiptNumber}  •  ${pay.mode.toUpperCase()}  •  ${inr(pay.amount)}${pay.reference ? `  •  Ref: ${pay.reference}` : ""}`,
        50, y,
      );
      y += 12;
    }
  }
  if (b.status === "void") {
    y += 8;
    doc.fontSize(11).fillColor("#b00").text(`*** VOIDED — ${b.voidReason ?? "no reason recorded"} ***`, 50, y);
    doc.fillColor("#000");
  }
  doc.end();
}

router.get("/pdf/invoice/:billId", requireRole("admin", "accountant", "receptionist", "cashier", "doctor"), async (req, res) => {
  await renderInvoicePdf(res, Number(req.params.billId));
});

export async function renderReceiptPdf(res: Response, id: number): Promise<void> {
  const [pay] = await db.select().from(billPaymentsTable).where(eq(billPaymentsTable.id, id));
  if (!pay) { res.status(404).json({ error: "Receipt not found" }); return; }
  const [b] = await db.select().from(billsTable).where(eq(billsTable.id, pay.billId));
  const [p] = b ? await db.select().from(patientsTable).where(eq(patientsTable.id, b.patientId)) : [null];
  const doc = startPdf(res, `receipt-${pay.receiptNumber}.pdf`);
  doc.fontSize(16).text("PAYMENT RECEIPT", { align: "center" }).moveDown();
  doc.fontSize(11);
  doc.text(`Receipt #: ${pay.receiptNumber}`);
  doc.text(`Date: ${new Date(pay.receivedAt).toLocaleString("en-IN")}`);
  if (b) doc.text(`Against Invoice: ${b.billNumber}`);
  if (p) {
    doc.text(`Patient: ${p.name}  (UHID: ${p.uhid})`);
    doc.text(`Phone: ${p.phone}`);
  }
  doc.moveDown();
  doc.text(`Mode: ${pay.mode.toUpperCase()}`);
  if (pay.reference) doc.text(`Reference: ${pay.reference}`);
  if (pay.receivedBy) doc.text(`Received By: ${pay.receivedBy}`);
  doc.moveDown();
  doc.fontSize(18).text(`Amount: ${inr(pay.amount)}`, { underline: true });
  if (b) {
    doc.moveDown();
    const balance = num(b.total) - num(b.paidAmount) + num(b.refundedAmount);
    doc.fontSize(11).text(`Bill Total: ${inr(b.total)}    Paid: ${inr(b.paidAmount)}    Balance: ${inr(balance)}`);
  }
  doc.moveDown(2);
  doc.fontSize(9).fillColor("#666").text("This is a computer generated receipt and does not require a signature.", { align: "center" });
  doc.end();
}

router.get("/pdf/receipt/:paymentId", requireRole("admin", "accountant", "receptionist", "cashier", "doctor"), async (req, res) => {
  await renderReceiptPdf(res, Number(req.params.paymentId));
});

export async function renderDischargeSummaryPdf(res: Response, id: number): Promise<void> {
  const [e] = await db.select().from(encountersTable).where(eq(encountersTable.id, id));
  if (!e) { res.status(404).json({ error: "Encounter not found" }); return; }
  const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, e.patientId));

  // Stay window — vitals/labs after admit, prescriptions linked to encounter.
  const stayStart = e.startedAt;
  const [adm] = await db
    .select()
    .from(admissionsTable)
    .where(eq(admissionsTable.encounterId, id))
    .limit(1);

  const vitals = await db
    .select()
    .from(vitalsTable)
    .where(and(eq(vitalsTable.patientId, e.patientId), gte(vitalsTable.recordedAt, stayStart)))
    .orderBy(desc(vitalsTable.recordedAt))
    .limit(10);

  const rx = await db
    .select()
    .from(prescriptionsTable)
    .where(eq(prescriptionsTable.encounterId, id))
    .orderBy(desc(prescriptionsTable.createdAt));

  const labs = await db
    .select()
    .from(labOrdersTable)
    .where(and(eq(labOrdersTable.patientId, e.patientId), gte(labOrdersTable.createdAt, stayStart)))
    .orderBy(desc(labOrdersTable.createdAt))
    .limit(20);

  const marGiven = adm
    ? await db
        .select()
        .from(marEntriesTable)
        .where(and(eq(marEntriesTable.admissionId, adm.id), eq(marEntriesTable.status, "given")))
    : [];

  const doc = startPdf(res, `discharge-${id}.pdf`);
  doc.fontSize(16).text("DISCHARGE SUMMARY", { align: "center" }).moveDown();
  if (p) {
    doc.fontSize(11).text(`Patient: ${p.name} (MRN: ${p.uhid})`);
    doc.text(`Age/Gender: ${p.dob ? new Date().getFullYear() - new Date(p.dob).getFullYear() : "-"} / ${p.gender}`);
    doc.text(`Phone: ${p.phone}`);
  }
  doc.text(`Encounter ID: ${e.id}`);
  doc.text(`Type: ${e.type}`);
  doc.text(`Admitted: ${new Date(e.startedAt).toLocaleString("en-IN")}`);
  if (e.endedAt) doc.text(`Discharged: ${new Date(e.endedAt).toLocaleString("en-IN")}`);
  doc.moveDown();

  doc.fontSize(12).text("Chief Complaints", { underline: true });
  doc.fontSize(11).text(e.chiefComplaint ?? "-");
  doc.moveDown();

  doc.fontSize(12).text("Diagnosis", { underline: true });
  doc.fontSize(11).text(e.diagnosis ?? "-");
  doc.moveDown();

  doc.fontSize(12).text("Vitals (recent)", { underline: true });
  if (vitals.length === 0) {
    doc.fontSize(11).text("-");
  } else {
    doc.fontSize(10);
    for (const v of vitals) {
      const parts = [
        new Date(v.recordedAt).toLocaleString("en-IN"),
        v.bp ? `BP ${v.bp}` : null,
        v.pulse ? `HR ${v.pulse}` : null,
        v.temperature ? `T ${v.temperature}°C` : null,
        v.spo2 ? `SpO2 ${v.spo2}%` : null,
        v.respiratoryRate ? `RR ${v.respiratoryRate}` : null,
      ].filter(Boolean);
      doc.text(parts.join("  •  "));
    }
  }
  doc.moveDown().fontSize(11);

  doc.fontSize(12).text("Medications", { underline: true });
  if (rx.length === 0) {
    doc.fontSize(11).text("-");
  } else {
    doc.fontSize(10);
    for (const r of rx) {
      const givenCount = marGiven.filter((m) => m.prescriptionId === r.id).length;
      const tail = givenCount > 0 ? `  (${givenCount} dose${givenCount > 1 ? "s" : ""} given)` : "";
      doc.text(`• ${r.drug} ${r.dosage}${r.frequency ? ` — ${r.frequency}` : ""}${r.duration ? ` × ${r.duration}` : ""}${tail}`);
    }
  }
  doc.moveDown().fontSize(11);

  doc.fontSize(12).text("Investigations", { underline: true });
  if (labs.length === 0) {
    doc.fontSize(11).text("-");
  } else {
    doc.fontSize(10);
    for (const l of labs) {
      doc.text(`• ${l.testName} — ${l.status}${l.result ? `: ${l.result}` : ""}`);
    }
  }
  doc.moveDown().fontSize(11);

  doc.fontSize(12).text("Treatment Plan & Notes", { underline: true });
  doc.fontSize(11).text(e.notes ?? adm?.summary ?? "-");
  doc.end();
}

router.get("/pdf/discharge-summary/:encounterId", async (req, res) => {
  await renderDischargeSummaryPdf(res, Number(req.params.encounterId));
});

// Lab report PDF: structured header, sample/collection block, parameter
// grid with reference range + flag column, and a signature footer.
// Exported so the patient portal can stream the same artifact under its
// own auth (requirePatient + ownership check) — keeps a single rendering
// pipeline whether staff or patient is viewing.
export async function renderLabReportPdf(res: Response, id: number): Promise<void> {
  const [o] = await db.select().from(labOrdersTable).where(eq(labOrdersTable.id, id));
  if (!o) { res.status(404).json({ error: "Lab order not found" }); return; }
  const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, o.patientId));
  const doc = startPdf(res, `lab-${id}.pdf`);
  doc.fontSize(16).text("LABORATORY REPORT", { align: "center" });
  doc.fontSize(9).fillColor("#666").text("NABL-accredited diagnostic services", { align: "center" });
  doc.fillColor("#000").moveDown();

  const headerY = doc.y;
  doc.fontSize(10);
  if (p) {
    doc.text(`Patient: ${p.name}`, 50, headerY);
    doc.text(`UHID: ${p.uhid}`, 50);
    doc.text(`Sex/DOB: ${p.gender} / ${p.dob}`, 50);
  }
  doc.text(`Order ID: ${o.id}`, 320, headerY);
  doc.text(`Test: ${o.testName}`, 320);
  doc.text(`Sample ID: ${o.sampleId ?? "—"}`, 320);
  doc.text(`Status: ${o.status.toUpperCase()}`, 320);
  doc.text(`Priority: ${o.priority}`, 320);
  doc.moveDown(2);

  const collectedAt = o.collectedAt ? new Date(o.collectedAt).toLocaleString("en-IN") : "—";
  const verifiedAt = o.verifiedAt ? new Date(o.verifiedAt).toLocaleString("en-IN") : "—";
  doc.fontSize(9).fillColor("#555");
  doc.text(`Ordered: ${new Date(o.createdAt).toLocaleString("en-IN")}    Collected: ${collectedAt}    Verified: ${verifiedAt}`);
  doc.fillColor("#000").moveDown();

  // Parameter grid
  const results = (o.resultsJson as Array<{ name: string; value: string; unit?: string | null; flag?: string | null; refRange?: string | null; comment?: string | null }>) ?? [];
  if (results.length > 0) {
    const tableTop = doc.y;
    doc.fontSize(9).fillColor("#666");
    doc.text("Parameter", 50, tableTop, { width: 180 });
    doc.text("Result", 230, tableTop, { width: 80, align: "right" });
    doc.text("Flag", 310, tableTop, { width: 40, align: "center" });
    doc.text("Unit", 350, tableTop, { width: 60 });
    doc.text("Reference", 410, tableTop, { width: 140 });
    doc.moveTo(50, tableTop + 14).lineTo(550, tableTop + 14).strokeColor("#ccc").stroke();
    doc.fillColor("#000");
    let y = tableTop + 20;
    for (const r of results) {
      const abnormal = r.flag === "H" || r.flag === "L" || r.flag === "A";
      doc.fontSize(9).text(r.name, 50, y, { width: 180 });
      doc.fillColor(abnormal ? "#b91c1c" : "#000");
      doc.text(r.value, 230, y, { width: 80, align: "right" });
      doc.text(r.flag ?? "", 310, y, { width: 40, align: "center" });
      doc.fillColor("#000");
      doc.text(r.unit ?? "", 350, y, { width: 60 });
      doc.text(r.refRange ?? "", 410, y, { width: 140 });
      if (r.comment) {
        y += 12;
        doc.fontSize(8).fillColor("#666").text(`Comment: ${r.comment}`, 50, y, { width: 500 });
        doc.fillColor("#000").fontSize(9);
      }
      y += 16;
    }
    doc.y = y + 8;
  } else if (o.result) {
    doc.fontSize(12).text("Result", { underline: true });
    doc.fontSize(11).text(o.result);
    if (o.normalRange) doc.text(`Normal Range: ${o.normalRange}`);
  } else {
    doc.fontSize(11).fillColor("#999").text("Pending").fillColor("#000");
  }

  if (o.notes) {
    doc.moveDown();
    doc.fontSize(11).fillColor("#666").text(`Notes: ${o.notes}`).fillColor("#000");
  }

  // Signature footer
  doc.moveDown(3);
  doc.fontSize(9).fillColor("#555");
  doc.text("__________________________", 50);
  doc.text(`Verified by: ${o.verifiedBy ?? "— (pending verification)"}`, 50);
  doc.text(`Verified on: ${verifiedAt}`, 50);
  doc.text("This is a computer-generated report. Reference ranges are age/sex-adjusted where applicable.", 50, doc.y + 10, { width: 500 });
  doc.fillColor("#000");
  doc.end();
}

router.get("/pdf/lab-report/:orderId", async (req, res) => {
  await renderLabReportPdf(res, Number(req.params.orderId));
});

// Radiology report PDF.
export async function renderRadiologyReportPdf(res: Response, id: number): Promise<void> {
  const [o] = await db.select().from(radiologyTable).where(eq(radiologyTable.id, id));
  if (!o) { res.status(404).json({ error: "Radiology order not found" }); return; }
  const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, o.patientId));
  const doc = startPdf(res, `radiology-${id}.pdf`);
  doc.fontSize(16).text("RADIOLOGY REPORT", { align: "center" });
  doc.fontSize(9).fillColor("#666").text("Imaging & Diagnostics", { align: "center" });
  doc.fillColor("#000").moveDown();

  const headerY = doc.y;
  doc.fontSize(10);
  if (p) {
    doc.text(`Patient: ${p.name}`, 50, headerY);
    doc.text(`UHID: ${p.uhid}`, 50);
    doc.text(`Sex/DOB: ${p.gender} / ${p.dob}`, 50);
  }
  doc.text(`Order ID: ${o.id}`, 320, headerY);
  doc.text(`Modality: ${o.modality}`, 320);
  doc.text(`Body Part: ${o.bodyPart}`, 320);
  doc.text(`Status: ${o.status.toUpperCase()}`, 320);
  doc.text(`Priority: ${o.priority}`, 320);
  doc.moveDown(2);

  const scheduledAt = o.scheduledAt ? new Date(o.scheduledAt).toLocaleString("en-IN") : "—";
  const capturedAt = o.capturedAt ? new Date(o.capturedAt).toLocaleString("en-IN") : "—";
  const verifiedAt = o.verifiedAt ? new Date(o.verifiedAt).toLocaleString("en-IN") : "—";
  doc.fontSize(9).fillColor("#555");
  doc.text(`Scheduled: ${scheduledAt}    Captured: ${capturedAt}    Verified: ${verifiedAt}`);
  if (o.technologist) doc.text(`Technologist: ${o.technologist}`);
  doc.fillColor("#000").moveDown();

  if (o.imageUrl || o.pacsUrl) {
    doc.fontSize(10).fillColor("#0369a1").text(`Image: ${o.imageUrl ?? o.pacsUrl ?? ""}`, { link: o.imageUrl ?? o.pacsUrl ?? undefined, underline: true }).fillColor("#000");
    doc.moveDown();
  }

  doc.fontSize(12).text("Findings", { underline: true });
  doc.fontSize(11).text(o.findings ?? "Pending");
  doc.moveDown();
  doc.fontSize(12).text("Impression", { underline: true });
  doc.fontSize(11).text(o.impression ?? "Pending");

  doc.moveDown(3);
  doc.fontSize(9).fillColor("#555");
  doc.text("__________________________", 50);
  doc.text(`Radiologist: ${o.radiologist ?? "—"}`, 50);
  doc.text(`Verified by: ${o.verifiedBy ?? "— (pending verification)"} on ${verifiedAt}`, 50);
  doc.fillColor("#000");
  doc.end();
}

router.get("/pdf/radiology-report/:orderId", async (req, res) => {
  await renderRadiologyReportPdf(res, Number(req.params.orderId));
});

export async function renderPrescriptionPdf(res: Response, id: number): Promise<void> {
  const [rx] = await db.select().from(prescriptionsTable).where(eq(prescriptionsTable.id, id));
  if (!rx) { res.status(404).json({ error: "Prescription not found" }); return; }
  const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, rx.patientId));
  const doc = startPdf(res, `prescription-${id}.pdf`);
  doc.fontSize(16).text("PRESCRIPTION (Rx)", { align: "center" }).moveDown();
  if (p) doc.fontSize(11).text(`Patient: ${p.name} (MRN: ${p.uhid})`);
  if (rx.prescribedBy) doc.text(`Prescribing Doctor: ${rx.prescribedBy}`);
  doc.text(`Date: ${new Date(rx.createdAt).toLocaleString("en-IN")}`);
  doc.text(`Status: ${rx.status}`);
  doc.moveDown();
  doc.fontSize(12).text("Medication", { underline: true });
  doc.fontSize(11);
  doc.text(`${rx.drug} — ${rx.dosage}`);
  if (rx.frequency) doc.text(`Frequency: ${rx.frequency}`);
  if (rx.duration) doc.text(`Duration: ${rx.duration}`);
  if (rx.instructions) {
    doc.moveDown();
    doc.fontSize(12).text("Instructions", { underline: true });
    doc.fontSize(11).text(rx.instructions);
  }
  doc.end();
}

router.get("/pdf/prescription/:prescriptionId", async (req, res) => {
  await renderPrescriptionPdf(res, Number(req.params.prescriptionId));
});

export async function renderVaccinationPdf(res: Response, id: number): Promise<void> {
  const [v] = await db.select().from(vaccinationsTable).where(eq(vaccinationsTable.id, id));
  if (!v) { res.status(404).json({ error: "Vaccination record not found" }); return; }
  const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, v.patientId));
  const doc = startPdf(res, `vaccination-${id}.pdf`);
  doc.fontSize(16).text("VACCINATION CERTIFICATE", { align: "center" }).moveDown();
  if (p) doc.fontSize(11).text(`Patient: ${p.name} (MRN: ${p.uhid})`);
  doc.text(`Date Administered: ${new Date(v.administeredAt).toLocaleString("en-IN")}`);
  doc.moveDown();
  doc.fontSize(12).text("Vaccine", { underline: true });
  doc.fontSize(11);
  doc.text(`${v.vaccineName} — Dose ${v.doseNumber}`);
  if (v.batchNumber) doc.text(`Batch No.: ${v.batchNumber}`);
  if (v.administeredBy) doc.text(`Administered by: ${v.administeredBy}`);
  if (v.nextDueDate) doc.text(`Next Due: ${new Date(v.nextDueDate).toLocaleDateString("en-IN")}`);
  doc.end();
}

router.get("/pdf/vaccination/:id", async (req, res) => {
  await renderVaccinationPdf(res, Number(req.params.id));
});

export async function renderVitalPdf(res: Response, id: number): Promise<void> {
  const [v] = await db.select().from(vitalsTable).where(eq(vitalsTable.id, id));
  if (!v) { res.status(404).json({ error: "Vitals record not found" }); return; }
  const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, v.patientId));
  const doc = startPdf(res, `vitals-${id}.pdf`);
  doc.fontSize(16).text("VITALS RECORD", { align: "center" }).moveDown();
  if (p) doc.fontSize(11).text(`Patient: ${p.name} (MRN: ${p.uhid})`);
  doc.text(`Recorded At: ${new Date(v.recordedAt).toLocaleString("en-IN")}`);
  if (v.recordedBy) doc.text(`Recorded By: ${v.recordedBy}`);
  doc.moveDown();
  doc.fontSize(12).text("Measurements", { underline: true });
  doc.fontSize(11);
  const lines: string[] = [];
  if (v.bp) lines.push(`Blood Pressure: ${v.bp} mmHg`);
  if (v.pulse != null) lines.push(`Pulse: ${v.pulse} bpm`);
  if (v.temperature != null) lines.push(`Temperature: ${v.temperature} °C`);
  if (v.spo2 != null) lines.push(`SpO2: ${v.spo2} %`);
  if (v.respiratoryRate != null) lines.push(`Respiratory Rate: ${v.respiratoryRate} /min`);
  if (v.weight != null) lines.push(`Weight: ${v.weight} kg`);
  if (v.height != null) lines.push(`Height: ${v.height} cm`);
  if (lines.length === 0) lines.push("(no measurements recorded)");
  for (const l of lines) doc.text(l);
  doc.end();
}

router.get("/pdf/vitals/:id", async (req, res) => {
  await renderVitalPdf(res, Number(req.params.id));
});

export default router;
