import { Router, type IRouter, type Request } from "express";
import { db, patientsTable, appointmentsTable, billsTable, staffTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
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

export default router;
