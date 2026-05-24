import { Router, type IRouter, type Request } from "express";
import {
  db,
  patientsTable,
  appointmentsTable,
  billsTable,
  billPaymentsTable,
  staffTable,
  labOrdersTable,
  radiologyTable,
  encountersTable,
  prescriptionsTable,
  vaccinationsTable,
  vitalsTable,
  notificationLogTable,
} from "@workspace/db";
import { and, desc, eq, inArray, sql, gte, lte } from "drizzle-orm";
import { hasSlotConflict } from "../lib/slot-conflict";
import { z } from "zod";
import {
  renderLabReportPdf,
  renderRadiologyReportPdf,
  renderInvoicePdf,
  renderReceiptPdf,
  renderPrescriptionPdf,
  renderDischargeSummaryPdf,
  renderVaccinationPdf,
  renderVitalPdf,
} from "./pdf";
import {
  issuePatientCookie,
  clearPatientCookie,
  readPatientId,
  requirePatient,
} from "../lib/auth";
import { num, requiredIso, isoDate } from "../lib/format";
import {
  DEV_OTP_EXPOSED,
  OTP_MAX_ATTEMPTS,
  bumpOtpAttempts,
  checkOtpRateLimits,
  consumeOtp,
  findActiveOtp,
  issueOtp,
  recordPatientAudit,
  verifyOtp,
} from "../lib/portal-otp";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function clientIp(req: Request): string | null {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0]!.trim();
  return req.ip ?? null;
}

function shapeBill(b: typeof billsTable.$inferSelect) {
  const total = num(b.total);
  const paid = num(b.paidAmount);
  const refunded = num(b.refundedAmount);
  return {
    id: b.id,
    billNumber: b.billNumber,
    status: b.status,
    subtotal: num(b.subtotal),
    discount: num(b.discount),
    cgst: num(b.cgst),
    sgst: num(b.sgst),
    igst: num(b.igst),
    total,
    paidAmount: paid,
    refundedAmount: refunded,
    balance: Math.round((total - paid + refunded) * 100) / 100,
    paymentMethod: b.paymentMethod,
    department: b.department,
    items: (b.items as unknown[]) ?? [],
    createdAt: requiredIso(b.createdAt),
    paidAt: isoDate(b.paidAt),
  };
}

// ---------------------------------------------------------------------------
// OTP login (UHID + phone → 6-digit OTP).  Dev fallback exposes the code in
// the response when NODE_ENV != production so demos work without an SMS
// provider; in production the code is only sent via the notifications log.
// ---------------------------------------------------------------------------

const OtpRequestBody = z.object({
  mrn: z.string().trim().min(1),
  phone: z.string().trim().min(1),
});

router.post("/portal/otp/request", async (req, res) => {
  const parsed = OtpRequestBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "mrn and phone required" });
  // Always return a generic success after rate-limit checks: do NOT reveal
  // whether the UHID/phone pair matches an account (account-enumeration
  // protection). Rate-limit decisions are made server-side and silently
  // suppress code issuance — the response shape stays constant so an
  // attacker cannot distinguish "unknown account" from "known account in
  // cooldown / hourly cap reached".
  const [p] = await db
    .select()
    .from(patientsTable)
    .where(and(eq(patientsTable.uhid, parsed.data.mrn), eq(patientsTable.phone, parsed.data.phone)));

  if (!p) {
    // Mimic a small delay so timing doesn't trivially reveal account presence.
    await new Promise((r) => setTimeout(r, 150));
    return res.json({ sent: true });
  }

  const rate = await checkOtpRateLimits(p.id);
  if (rate.cooldownActive || rate.hourlyExceeded) {
    // Silent throttle: do not surface 429 for known accounts because that
    // would leak existence. The legitimate user just won't receive a new
    // SMS; their previously issued code remains valid for its lifetime.
    logger.info(
      { patientId: p.id, cooldown: rate.cooldownActive, hourly: rate.hourlyExceeded },
      "portal OTP request suppressed by rate limit",
    );
    await new Promise((r) => setTimeout(r, 150));
    return res.json({ sent: true });
  }

  const code = await issueOtp(p.id, clientIp(req));
  // Stub SMS dispatch: log to notification_log so admin can audit. In
  // production this would call the SMS provider; here we just record it.
  await db.insert(notificationLogTable).values({
    patientId: p.id,
    eventKey: "portal_otp",
    channel: "sms",
    renderedBody: `Your Mystics MediCare portal login code is ${code}. It expires in 10 minutes.`,
    recipientPhone: p.phone,
    status: "sent",
    providerRef: `otp-stub-${Date.now()}`,
  });
  logger.info({ patientId: p.id }, "portal OTP issued");

  // Dev fallback: surface the code so demos work without SMS. NEVER do this
  // in production — guarded by NODE_ENV.
  if (DEV_OTP_EXPOSED) {
    return res.json({ sent: true, devCode: code });
  }
  return res.json({ sent: true });
});

const OtpVerifyBody = z.object({
  mrn: z.string().trim().min(1),
  code: z.string().trim().regex(/^\d{4,8}$/, "Invalid code"),
});

router.post("/portal/otp/verify", async (req, res) => {
  const parsed = OtpVerifyBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
  const [p] = await db
    .select()
    .from(patientsTable)
    .where(eq(patientsTable.uhid, parsed.data.mrn));
  if (!p) {
    await new Promise((r) => setTimeout(r, 150));
    return res.status(401).json({ error: "Invalid code" });
  }
  const active = await findActiveOtp(p.id);
  if (!active) return res.status(401).json({ error: "Code expired — request a new one" });
  if (active.attempts >= OTP_MAX_ATTEMPTS) {
    return res.status(429).json({ error: "Too many wrong attempts — request a new code" });
  }
  const ok = await verifyOtp(parsed.data.code, active.codeHash);
  if (!ok) {
    await bumpOtpAttempts(active.id);
    return res.status(401).json({ error: "Invalid code" });
  }
  await consumeOtp(active.id);
  issuePatientCookie(res, p.id);
  res.json({ id: p.id, name: p.name, mrn: p.uhid, phone: p.phone });
});

// Legacy direct UHID+phone login. Kept active only in non-production so the
// existing demo seed and tests continue to work; the OTP flow is the path
// shipped to real patients.
router.post("/portal/login", async (req, res) => {
  if (!DEV_OTP_EXPOSED) {
    return res.status(404).json({ error: "Use /portal/otp/request" });
  }
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
  res.json({
    id: p.id,
    name: p.name,
    mrn: p.uhid,
    phone: p.phone,
    dob: p.dob,
    gender: p.gender,
    email: p.email,
    address: p.address,
    bloodGroup: p.bloodGroup,
    allergies: p.allergies,
    emergencyContact: p.emergencyContact,
    insuranceProvider: p.insuranceProvider,
    insuranceNumber: p.insuranceNumber,
  });
});

// ---------------------------------------------------------------------------
// Home dashboard aggregate — one round-trip for the landing page.
// ---------------------------------------------------------------------------
router.get("/portal/home", requirePatient, async (req, res) => {
  const pid = (req as Request & { patientId: number }).patientId;
  const now = new Date();

  const [me] = await db.select().from(patientsTable).where(eq(patientsTable.id, pid));
  if (!me) return res.status(404).json({ error: "Patient not found" });

  const upcomingAppts = await db
    .select({ a: appointmentsTable, s: staffTable })
    .from(appointmentsTable)
    .leftJoin(staffTable, eq(appointmentsTable.doctorId, staffTable.id))
    .where(
      and(
        eq(appointmentsTable.patientId, pid),
        gte(appointmentsTable.scheduledAt, now),
        inArray(appointmentsTable.status, ["scheduled", "confirmed"]),
      ),
    )
    .orderBy(appointmentsTable.scheduledAt)
    .limit(5);

  const recentEncounters = await db
    .select({ e: encountersTable, s: staffTable })
    .from(encountersTable)
    .leftJoin(staffTable, eq(encountersTable.doctorId, staffTable.id))
    .where(eq(encountersTable.patientId, pid))
    .orderBy(desc(encountersTable.startedAt))
    .limit(5);

  const pendingBillsRows = await db
    .select()
    .from(billsTable)
    .where(and(eq(billsTable.patientId, pid), inArray(billsTable.status, ["unpaid", "partial"])))
    .orderBy(desc(billsTable.createdAt))
    .limit(10);

  const recentLabs = await db
    .select()
    .from(labOrdersTable)
    .where(
      and(eq(labOrdersTable.patientId, pid), inArray(labOrdersTable.status, ["verified", "dispatched"])),
    )
    .orderBy(desc(labOrdersTable.createdAt))
    .limit(3);

  const recentRads = await db
    .select()
    .from(radiologyTable)
    .where(
      and(eq(radiologyTable.patientId, pid), inArray(radiologyTable.status, ["verified", "dispatched"])),
    )
    .orderBy(desc(radiologyTable.createdAt))
    .limit(3);

  const unreadNotifs = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(notificationLogTable)
    .where(eq(notificationLogTable.patientId, pid));

  res.json({
    me: {
      id: me.id,
      name: me.name,
      mrn: me.uhid,
      phone: me.phone,
      email: me.email,
      gender: me.gender,
      dob: me.dob,
    },
    upcomingAppointments: upcomingAppts.map(({ a, s }) => ({
      id: a.id,
      scheduledAt: requiredIso(a.scheduledAt),
      department: a.department,
      doctorName: s?.name ?? null,
      status: a.status,
      reason: a.reason,
    })),
    recentEncounters: recentEncounters.map(({ e, s }) => ({
      id: e.id,
      type: e.type,
      startedAt: requiredIso(e.startedAt),
      doctorName: s?.name ?? null,
      diagnosis: e.diagnosis,
      status: e.status,
    })),
    pendingBills: pendingBillsRows.map(shapeBill),
    recentReports: [
      ...recentLabs.map((l) => ({ kind: "lab" as const, id: l.id, name: l.testName, at: requiredIso(l.createdAt), pdfUrl: `/api/portal/lab-reports/${l.id}/pdf` })),
      ...recentRads.map((r) => ({ kind: "radiology" as const, id: r.id, name: `${r.modality} ${r.bodyPart}`, at: requiredIso(r.createdAt), pdfUrl: `/api/portal/radiology-reports/${r.id}/pdf` })),
    ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5),
    notificationCount: unreadNotifs[0]?.c ?? 0,
  });
});

router.get("/portal/appointments", requirePatient, async (req, res) => {
  const pid = (req as Request & { patientId: number }).patientId;
  const rows = await db
    .select({ a: appointmentsTable, s: staffTable })
    .from(appointmentsTable)
    .leftJoin(staffTable, eq(appointmentsTable.doctorId, staffTable.id))
    .where(eq(appointmentsTable.patientId, pid))
    .orderBy(desc(appointmentsTable.scheduledAt))
    .limit(200);
  res.json(
    rows.map(({ a, s }) => ({
      id: a.id,
      scheduledAt: requiredIso(a.scheduledAt),
      department: a.department,
      status: a.status,
      doctorId: a.doctorId,
      doctorName: s?.name ?? null,
      reason: a.reason,
      tokenNumber: a.tokenNumber,
      createdAt: requiredIso(a.createdAt),
    })),
  );
});

// Doctor directory restricted to fields the portal needs for booking.
router.get("/portal/doctors", requirePatient, async (_req, res) => {
  const rows = await db
    .select()
    .from(staffTable)
    .where(and(eq(staffTable.role, "doctor"), eq(staffTable.status, "active")))
    .orderBy(staffTable.name);
  res.json(
    rows.map((s) => ({
      id: s.id,
      name: s.name,
      department: s.department,
      specialization: s.specialization,
    })),
  );
});

// Existing booked slots for a doctor on a given date (so the UI can grey out
// 15-min windows already taken). The conflict check itself still happens
// server-side at insert time inside an advisory-lock transaction.
router.get("/portal/doctors/:id/slots", requirePatient, async (req, res) => {
  const doctorId = Number(req.params.id);
  const dateStr = String(req.query["date"] ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return res.status(400).json({ error: "date=YYYY-MM-DD required" });
  }
  const dayStart = new Date(`${dateStr}T00:00:00`);
  const dayEnd = new Date(`${dateStr}T23:59:59.999`);
  const taken = await db
    .select({ at: appointmentsTable.scheduledAt })
    .from(appointmentsTable)
    .where(
      and(
        eq(appointmentsTable.doctorId, doctorId),
        gte(appointmentsTable.scheduledAt, dayStart),
        lte(appointmentsTable.scheduledAt, dayEnd),
        inArray(appointmentsTable.status, ["scheduled", "confirmed", "completed"]),
      ),
    );
  res.json({ taken: taken.map((t) => requiredIso(t.at)) });
});

const BookAppointmentBody = z.object({
  doctorId: z.number().int().positive(),
  department: z.string().min(1),
  scheduledAt: z.string().min(1),
  reason: z.string().max(500).optional(),
});

router.post("/portal/appointments", requirePatient, async (req, res) => {
  const pid = (req as Request & { patientId: number }).patientId;
  const parsed = BookAppointmentBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const when = new Date(parsed.data.scheduledAt);
  if (isNaN(when.getTime())) return res.status(400).json({ error: "Invalid scheduledAt" });
  if (when.getTime() < Date.now() - 60 * 1000) {
    return res.status(400).json({ error: "Cannot book in the past" });
  }
  // Same advisory-lock + conflict-check pattern as the staff route so portal
  // and staff bookings can't both win the same 15-min slot.
  try {
    const row = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${parsed.data.doctorId})`);
      if (await hasSlotConflict(tx, parsed.data.doctorId, when)) {
        throw new Error("__SLOT_CONFLICT__");
      }
      const [inserted] = await tx
        .insert(appointmentsTable)
        .values({
          patientId: pid,
          doctorId: parsed.data.doctorId,
          department: parsed.data.department,
          scheduledAt: when,
          reason: parsed.data.reason,
        })
        .returning();
      return inserted!;
    });
    await recordPatientAudit({
      patientId: pid,
      action: "appointment.book",
      before: null,
      after: { appointmentId: row.id, doctorId: row.doctorId, scheduledAt: requiredIso(row.scheduledAt) },
      ipAddress: clientIp(req),
      userAgent: req.headers["user-agent"] ?? null,
    });
    res.status(201).json({ id: row.id, scheduledAt: requiredIso(row.scheduledAt), status: row.status });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "__SLOT_CONFLICT__") {
      return res.status(409).json({ error: "That slot is no longer available" });
    }
    throw e;
  }
});

router.post("/portal/appointments/:id/cancel", requirePatient, async (req, res) => {
  const pid = (req as Request & { patientId: number }).patientId;
  const id = Number(req.params.id);
  const [existing] = await db.select().from(appointmentsTable).where(eq(appointmentsTable.id, id));
  if (!existing || existing.patientId !== pid) return res.status(404).json({ error: "Not found" });
  if (existing.status !== "scheduled" && existing.status !== "confirmed") {
    return res.status(409).json({ error: `Cannot cancel an appointment that is already ${existing.status}` });
  }
  const [row] = await db
    .update(appointmentsTable)
    .set({ status: "cancelled" })
    .where(eq(appointmentsTable.id, id))
    .returning();
  await recordPatientAudit({
    patientId: pid,
    action: "appointment.cancel",
    before: { status: existing.status, scheduledAt: requiredIso(existing.scheduledAt) },
    after: { status: "cancelled" },
    ipAddress: clientIp(req),
    userAgent: req.headers["user-agent"] ?? null,
  });
  res.json({ id: row!.id, status: row!.status });
});

const RescheduleBody = z.object({ scheduledAt: z.string().min(1) });

router.post("/portal/appointments/:id/reschedule", requirePatient, async (req, res) => {
  const pid = (req as Request & { patientId: number }).patientId;
  const id = Number(req.params.id);
  const parsed = RescheduleBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const when = new Date(parsed.data.scheduledAt);
  if (isNaN(when.getTime()) || when.getTime() < Date.now() - 60 * 1000) {
    return res.status(400).json({ error: "Invalid new slot" });
  }
  const [existing] = await db.select().from(appointmentsTable).where(eq(appointmentsTable.id, id));
  if (!existing || existing.patientId !== pid) return res.status(404).json({ error: "Not found" });
  if (existing.status !== "scheduled" && existing.status !== "confirmed") {
    return res.status(409).json({ error: `Cannot reschedule appointment with status ${existing.status}` });
  }
  try {
    const row = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${existing.doctorId})`);
      if (await hasSlotConflict(tx, existing.doctorId, when, id)) {
        throw new Error("__SLOT_CONFLICT__");
      }
      const [updated] = await tx
        .update(appointmentsTable)
        .set({ scheduledAt: when })
        .where(eq(appointmentsTable.id, id))
        .returning();
      return updated!;
    });
    await recordPatientAudit({
      patientId: pid,
      action: "appointment.reschedule",
      before: { scheduledAt: requiredIso(existing.scheduledAt) },
      after: { scheduledAt: requiredIso(row.scheduledAt) },
      ipAddress: clientIp(req),
      userAgent: req.headers["user-agent"] ?? null,
    });
    res.json({ id: row.id, scheduledAt: requiredIso(row.scheduledAt), status: row.status });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "__SLOT_CONFLICT__") {
      return res.status(409).json({ error: "That slot is no longer available" });
    }
    throw e;
  }
});

// ---------------------------------------------------------------------------
// Records browser
// ---------------------------------------------------------------------------
router.get("/portal/encounters", requirePatient, async (req, res) => {
  const pid = (req as Request & { patientId: number }).patientId;
  const rows = await db
    .select({ e: encountersTable, s: staffTable })
    .from(encountersTable)
    .leftJoin(staffTable, eq(encountersTable.doctorId, staffTable.id))
    .where(eq(encountersTable.patientId, pid))
    .orderBy(desc(encountersTable.startedAt))
    .limit(200);
  res.json(
    rows.map(({ e, s }) => ({
      id: e.id,
      type: e.type,
      status: e.status,
      doctorName: s?.name ?? null,
      chiefComplaint: e.chiefComplaint,
      diagnosis: e.diagnosis,
      notes: e.notes,
      startedAt: requiredIso(e.startedAt),
      endedAt: isoDate(e.endedAt),
      dischargePdfUrl: e.status === "discharged" ? `/api/portal/encounters/${e.id}/discharge.pdf` : null,
    })),
  );
});

router.get("/portal/encounters/:id/discharge.pdf", requirePatient, async (req, res) => {
  const pid = (req as Request & { patientId: number }).patientId;
  const id = Number(req.params.id);
  const [e] = await db.select().from(encountersTable).where(eq(encountersTable.id, id));
  if (!e || e.patientId !== pid) return res.status(404).json({ error: "Not found" });
  if (e.status !== "discharged") return res.status(403).json({ error: "Encounter not yet discharged" });
  await renderDischargeSummaryPdf(res, id);
});

router.get("/portal/prescriptions", requirePatient, async (req, res) => {
  const pid = (req as Request & { patientId: number }).patientId;
  const rows = await db
    .select()
    .from(prescriptionsTable)
    .where(eq(prescriptionsTable.patientId, pid))
    .orderBy(desc(prescriptionsTable.createdAt))
    .limit(200);
  res.json(
    rows.map((p) => ({
      id: p.id,
      drug: p.drug,
      dosage: p.dosage,
      frequency: p.frequency,
      duration: p.duration,
      instructions: p.instructions,
      status: p.status,
      prescribedBy: p.prescribedBy,
      createdAt: requiredIso(p.createdAt),
      dispensedAt: isoDate(p.dispensedAt),
      pdfUrl: `/api/portal/prescriptions/${p.id}/pdf`,
    })),
  );
});

router.get("/portal/prescriptions/:id/pdf", requirePatient, async (req, res) => {
  const pid = (req as Request & { patientId: number }).patientId;
  const id = Number(req.params.id);
  const [p] = await db.select().from(prescriptionsTable).where(eq(prescriptionsTable.id, id));
  if (!p || p.patientId !== pid) return res.status(404).json({ error: "Not found" });
  await renderPrescriptionPdf(res, id);
});

router.get("/portal/vaccinations", requirePatient, async (req, res) => {
  const pid = (req as Request & { patientId: number }).patientId;
  const rows = await db
    .select()
    .from(vaccinationsTable)
    .where(eq(vaccinationsTable.patientId, pid))
    .orderBy(desc(vaccinationsTable.administeredAt))
    .limit(200);
  res.json(
    rows.map((v) => ({
      id: v.id,
      vaccineName: v.vaccineName,
      doseNumber: v.doseNumber,
      batchNumber: v.batchNumber,
      administeredBy: v.administeredBy,
      administeredAt: requiredIso(v.administeredAt),
      nextDueDate: v.nextDueDate ?? null,
    })),
  );
});

router.get("/portal/vaccinations/:id/pdf", requirePatient, async (req, res) => {
  const pid = (req as Request & { patientId: number }).patientId;
  const id = Number(req.params.id);
  const [v] = await db.select().from(vaccinationsTable).where(eq(vaccinationsTable.id, id));
  if (!v || v.patientId !== pid) return res.status(404).json({ error: "Not found" });
  await renderVaccinationPdf(res, id);
});

router.get("/portal/vitals/:id/pdf", requirePatient, async (req, res) => {
  const pid = (req as Request & { patientId: number }).patientId;
  const id = Number(req.params.id);
  const [v] = await db.select().from(vitalsTable).where(eq(vitalsTable.id, id));
  if (!v || v.patientId !== pid) return res.status(404).json({ error: "Not found" });
  await renderVitalPdf(res, id);
});

router.get("/portal/vitals", requirePatient, async (req, res) => {
  const pid = (req as Request & { patientId: number }).patientId;
  const rows = await db
    .select()
    .from(vitalsTable)
    .where(eq(vitalsTable.patientId, pid))
    .orderBy(desc(vitalsTable.recordedAt))
    .limit(100);
  res.json(
    rows.map((v) => ({
      id: v.id,
      bp: v.bp,
      pulse: v.pulse,
      temperature: v.temperature != null ? Number(v.temperature) : null,
      spo2: v.spo2,
      respiratoryRate: v.respiratoryRate,
      weight: v.weight != null ? Number(v.weight) : null,
      height: v.height != null ? Number(v.height) : null,
      recordedBy: v.recordedBy,
      recordedAt: requiredIso(v.recordedAt),
    })),
  );
});

// ---------------------------------------------------------------------------
// Bills
// ---------------------------------------------------------------------------
router.get("/portal/bills", requirePatient, async (req, res) => {
  const pid = (req as Request & { patientId: number }).patientId;
  const rows = await db
    .select()
    .from(billsTable)
    .where(eq(billsTable.patientId, pid))
    .orderBy(desc(billsTable.createdAt))
    .limit(200);
  res.json(rows.map(shapeBill));
});

router.get("/portal/bills/:id", requirePatient, async (req, res) => {
  const pid = (req as Request & { patientId: number }).patientId;
  const id = Number(req.params.id);
  const [b] = await db.select().from(billsTable).where(eq(billsTable.id, id));
  if (!b || b.patientId !== pid) return res.status(404).json({ error: "Not found" });
  const payments = await db
    .select()
    .from(billPaymentsTable)
    .where(eq(billPaymentsTable.billId, id))
    .orderBy(desc(billPaymentsTable.receivedAt));
  res.json({
    bill: shapeBill(b),
    payments: payments.map((p) => ({
      id: p.id,
      receiptNumber: p.receiptNumber,
      amount: num(p.amount),
      mode: p.mode,
      reference: p.reference,
      receivedAt: requiredIso(p.receivedAt),
      receiptPdfUrl: `/api/portal/payments/${p.id}/receipt.pdf`,
    })),
  });
});

router.get("/portal/bills/:id/invoice.pdf", requirePatient, async (req, res) => {
  const pid = (req as Request & { patientId: number }).patientId;
  const id = Number(req.params.id);
  const [b] = await db.select().from(billsTable).where(eq(billsTable.id, id));
  if (!b || b.patientId !== pid) return res.status(404).json({ error: "Not found" });
  await renderInvoicePdf(res, id);
});

router.get("/portal/payments/:id/receipt.pdf", requirePatient, async (req, res) => {
  const pid = (req as Request & { patientId: number }).patientId;
  const id = Number(req.params.id);
  const [p] = await db
    .select({ p: billPaymentsTable, b: billsTable })
    .from(billPaymentsTable)
    .innerJoin(billsTable, eq(billPaymentsTable.billId, billsTable.id))
    .where(eq(billPaymentsTable.id, id));
  if (!p || p.b.patientId !== pid) return res.status(404).json({ error: "Not found" });
  await renderReceiptPdf(res, id);
});

// Online payment stub. Patient may pay outstanding balance via upi/card/
// netbanking — cash and cheque are deliberately rejected (those need an
// in-person cashier session). Atomic against concurrent staff payments via
// the same SELECT FOR UPDATE pattern the staff payment route uses.
const PortalPayBody = z.object({
  amount: z.number().positive().optional(),
  mode: z.enum(["upi", "card", "netbanking"]),
  reference: z.string().max(120).optional(),
});

function r2(n: number) {
  return Math.round(n * 100) / 100;
}
function recomputeBillStatus(total: number, paid: number, refunded: number, current: string): string {
  if (current === "void") return "void";
  const balance = r2(total - paid + refunded);
  if (balance <= 0.005) return "paid";
  if (paid > 0.005) return "partial";
  return "unpaid";
}

router.post("/portal/bills/:id/pay", requirePatient, async (req, res) => {
  const pid = (req as Request & { patientId: number }).patientId;
  const id = Number(req.params.id);
  const parsed = PortalPayBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

  try {
    const result = await db.transaction(async (tx) => {
      const lockedRows = await tx.execute<typeof billsTable.$inferSelect>(
        sql`SELECT * FROM bills WHERE id = ${id} AND patient_id = ${pid} FOR UPDATE`,
      );
      const bill = lockedRows.rows[0];
      if (!bill) throw new Error("__NOT_FOUND__");
      if (bill.status === "void") throw new Error("__VOIDED__");
      const total = num(bill.total);
      const paid = num(bill.paidAmount);
      const refunded = num(bill.refundedAmount);
      const balance = r2(total - paid + refunded);
      if (balance <= 0.005) throw new Error("__ALREADY_PAID__");
      const amount = parsed.data.amount ? r2(Number(parsed.data.amount)) : balance;
      if (amount > balance + 0.005) throw new Error("__OVERPAY__");
      const [{ next }] = (
        await tx.execute<{ next: string }>(
          sql`SELECT 'RCP' || to_char(now(),'YYYYMMDD') || lpad((coalesce(max(id),0)+1)::text, 4, '0') AS next FROM bill_payments`,
        )
      ).rows;
      const [payment] = await tx
        .insert(billPaymentsTable)
        .values({
          billId: id,
          receiptNumber: next!,
          amount: amount.toFixed(2),
          mode: parsed.data.mode,
          reference: parsed.data.reference ?? `portal-${Date.now()}`,
          receivedBy: "patient-portal",
          notes: "Online payment via patient portal",
        })
        .returning();
      const newPaid = r2(paid + amount);
      const newStatus = recomputeBillStatus(total, newPaid, refunded, bill.status);
      await tx
        .update(billsTable)
        .set({
          paidAmount: newPaid.toFixed(2),
          status: newStatus,
          paymentMethod: parsed.data.mode,
          paidAt: newStatus === "paid" ? new Date() : bill.paidAt,
        })
        .where(eq(billsTable.id, id));
      return { payment: payment!, newStatus, balanceAfter: r2(balance - amount) };
    });
    await recordPatientAudit({
      patientId: pid,
      action: "bill.pay",
      before: null,
      after: { billId: id, paymentId: result.payment.id, amount: num(result.payment.amount), mode: result.payment.mode },
      ipAddress: clientIp(req),
      userAgent: req.headers["user-agent"] ?? null,
    });
    res.status(201).json({
      paymentId: result.payment.id,
      receiptNumber: result.payment.receiptNumber,
      amount: num(result.payment.amount),
      newStatus: result.newStatus,
      balanceAfter: result.balanceAfter,
      receiptPdfUrl: `/api/portal/payments/${result.payment.id}/receipt.pdf`,
    });
  } catch (e: unknown) {
    if (e instanceof Error) {
      if (e.message === "__NOT_FOUND__") return res.status(404).json({ error: "Bill not found" });
      if (e.message === "__VOIDED__") return res.status(409).json({ error: "Bill is voided" });
      if (e.message === "__ALREADY_PAID__") return res.status(409).json({ error: "Bill already paid" });
      if (e.message === "__OVERPAY__") return res.status(400).json({ error: "Amount exceeds outstanding balance" });
    }
    throw e;
  }
});

// ---------------------------------------------------------------------------
// Profile editor + notifications inbox
// ---------------------------------------------------------------------------
const ProfileEditBody = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  bloodGroup: z.string().max(10).nullable().optional(),
  allergies: z.string().max(500).nullable().optional(),
  emergencyContact: z.string().max(120).nullable().optional(),
  insuranceProvider: z.string().max(120).nullable().optional(),
  insuranceNumber: z.string().max(60).nullable().optional(),
});

router.patch("/portal/profile", requirePatient, async (req, res) => {
  const pid = (req as Request & { patientId: number }).patientId;
  const parsed = ProfileEditBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const update = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== undefined),
  );
  if (Object.keys(update).length === 0) return res.status(400).json({ error: "No fields to update" });

  const [existing] = await db.select().from(patientsTable).where(eq(patientsTable.id, pid));
  if (!existing) return res.status(404).json({ error: "Patient not found" });
  const beforeSnapshot: Record<string, unknown> = {};
  const afterSnapshot: Record<string, unknown> = {};
  for (const key of Object.keys(update)) {
    beforeSnapshot[key] = (existing as Record<string, unknown>)[key] ?? null;
    afterSnapshot[key] = (update as Record<string, unknown>)[key];
  }
  const [row] = await db.update(patientsTable).set(update).where(eq(patientsTable.id, pid)).returning();
  await recordPatientAudit({
    patientId: pid,
    action: "profile.update",
    before: beforeSnapshot,
    after: afterSnapshot,
    ipAddress: clientIp(req),
    userAgent: req.headers["user-agent"] ?? null,
  });
  res.json({
    id: row!.id,
    name: row!.name,
    mrn: row!.uhid,
    phone: row!.phone,
    email: row!.email,
    address: row!.address,
    bloodGroup: row!.bloodGroup,
    allergies: row!.allergies,
    emergencyContact: row!.emergencyContact,
    insuranceProvider: row!.insuranceProvider,
    insuranceNumber: row!.insuranceNumber,
  });
});

router.get("/portal/notifications", requirePatient, async (req, res) => {
  const pid = (req as Request & { patientId: number }).patientId;
  const rows = await db
    .select()
    .from(notificationLogTable)
    .where(eq(notificationLogTable.patientId, pid))
    .orderBy(desc(notificationLogTable.sentAt))
    .limit(100);
  res.json(
    rows.map((n) => ({
      id: n.id,
      eventKey: n.eventKey,
      channel: n.channel,
      renderedBody: n.renderedBody,
      status: n.status,
      sentAt: requiredIso(n.sentAt),
    })),
  );
});

// ---------------------------------------------------------------------------
// Lab + Radiology (existing — kept here so patient PDFs remain portal-scoped)
// ---------------------------------------------------------------------------
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
      reportPdfUrl: `/api/portal/lab-reports/${l.id}/pdf`,
      dispatchedAt: l.dispatchedAt ? l.dispatchedAt.toISOString() : null,
      dispatchedVia: l.dispatchedVia,
      patientAcknowledgedAt: l.patientAcknowledgedAt ? l.patientAcknowledgedAt.toISOString() : null,
      createdAt: l.createdAt.toISOString(),
      completedAt: l.completedAt ? l.completedAt.toISOString() : null,
    })),
  );
});

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
