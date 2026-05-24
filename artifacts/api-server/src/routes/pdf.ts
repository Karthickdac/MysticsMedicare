import { Router, type IRouter, type Response } from "express";
import PDFDocument from "pdfkit";
import { db, patientsTable, billsTable, encountersTable, labOrdersTable, prescriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

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

router.get("/pdf/invoice/:billId", async (req, res) => {
  const id = Number(req.params.billId);
  const [b] = await db.select().from(billsTable).where(eq(billsTable.id, id));
  if (!b) return res.status(404).json({ error: "Bill not found" });
  const [p] = b.patientId ? await db.select().from(patientsTable).where(eq(patientsTable.id, b.patientId)) : [null];
  const doc = startPdf(res, `invoice-${b.billNumber}.pdf`);
  doc.fontSize(16).text("TAX INVOICE", { align: "center" }).moveDown();
  doc.fontSize(11);
  doc.text(`Invoice #: ${b.billNumber}`);
  doc.text(`Date: ${new Date(b.createdAt).toLocaleString("en-IN")}`);
  if (p) {
    doc.text(`Patient: ${p.name}  (MRN: ${p.uhid})`);
    doc.text(`Phone: ${p.phone}`);
  }
  doc.moveDown();
  doc.text(`Subtotal: ₹ ${b.subtotal}`);
  doc.text(`CGST: ₹ ${b.cgst}`);
  doc.text(`SGST: ₹ ${b.sgst}`);
  doc.text(`IGST: ₹ ${b.igst}`);
  doc.fontSize(14).text(`Total: ₹ ${b.total}`, { underline: true });
  doc.fontSize(11).text(`Status: ${b.status.toUpperCase()}`);
  doc.end();
});

router.get("/pdf/discharge-summary/:encounterId", async (req, res) => {
  const id = Number(req.params.encounterId);
  const [e] = await db.select().from(encountersTable).where(eq(encountersTable.id, id));
  if (!e) return res.status(404).json({ error: "Encounter not found" });
  const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, e.patientId));
  const doc = startPdf(res, `discharge-${id}.pdf`);
  doc.fontSize(16).text("DISCHARGE SUMMARY", { align: "center" }).moveDown();
  if (p) {
    doc.fontSize(11).text(`Patient: ${p.name} (MRN: ${p.uhid})`);
    doc.text(`Age/Gender: ${p.dob ? new Date().getFullYear() - new Date(p.dob).getFullYear() : "-"} / ${p.gender}`);
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
  doc.fontSize(12).text("Treatment Plan & Notes", { underline: true });
  doc.fontSize(11).text(e.notes ?? "-");
  doc.end();
});

router.get("/pdf/lab-report/:orderId", async (req, res) => {
  const id = Number(req.params.orderId);
  const [o] = await db.select().from(labOrdersTable).where(eq(labOrdersTable.id, id));
  if (!o) return res.status(404).json({ error: "Lab order not found" });
  const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, o.patientId));
  const doc = startPdf(res, `lab-${id}.pdf`);
  doc.fontSize(16).text("LABORATORY REPORT", { align: "center" }).moveDown();
  if (p) doc.fontSize(11).text(`Patient: ${p.name} (MRN: ${p.uhid})`);
  doc.text(`Order ID: ${o.id}`);
  doc.text(`Test: ${o.testName}`);
  doc.text(`Status: ${o.status}`);
  doc.text(`Ordered: ${new Date(o.createdAt).toLocaleString("en-IN")}`);
  if (o.completedAt) doc.text(`Completed: ${new Date(o.completedAt).toLocaleString("en-IN")}`);
  doc.moveDown();
  doc.fontSize(12).text("Result", { underline: true });
  doc.fontSize(11).text(o.result ?? "Pending");
  if (o.normalRange) doc.text(`Normal Range: ${o.normalRange}`);
  if (o.notes) {
    doc.moveDown();
    doc.fontSize(12).text("Notes", { underline: true });
    doc.fontSize(11).text(o.notes);
  }
  doc.end();
});

router.get("/pdf/prescription/:prescriptionId", async (req, res) => {
  const id = Number(req.params.prescriptionId);
  const [rx] = await db.select().from(prescriptionsTable).where(eq(prescriptionsTable.id, id));
  if (!rx) return res.status(404).json({ error: "Prescription not found" });
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
});

export default router;
