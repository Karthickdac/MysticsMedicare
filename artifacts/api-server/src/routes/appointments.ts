import { Router, type IRouter } from "express";
import { db, appointmentsTable, patientsTable, staffTable } from "@workspace/db";
import { desc, eq, and, gte, lt, sql } from "drizzle-orm";
import { CreateAppointmentBody, UpdateAppointmentBody } from "@workspace/api-zod";
import { requiredIso } from "../lib/format";
import { sendNotification } from "../lib/notifications";
import { requireRole } from "../lib/auth";
import { hasSlotConflict } from "../lib/slot-conflict";

// Roles allowed to mark a visit as completed / no_show. Reschedule and cancel
// are still open to receptionist/admin. UI hides these actions, but the
// authorization boundary must also live here — never trust the client.
// Role policy for OPD per Task #6:
//   doctor    → full (book, reschedule, cancel, set clinical status)
//   admin     → full
//   receptionist → booking-only (book, reschedule, cancel; no clinical status)
//   nurse     → read + vitals (no appointment mutation)
const BOOKING_ROLES = new Set(["admin", "doctor", "receptionist"]);
const STATUS_ROLES = new Set(["admin", "doctor"]);
const CLINICAL_STATUS = new Set(["completed", "no_show", "in_progress"]);

const router: IRouter = Router();

async function shapeJoin(rows: Array<{ a: typeof appointmentsTable.$inferSelect; p: typeof patientsTable.$inferSelect; s: typeof staffTable.$inferSelect }>) {
  return rows.map((r) => ({
    id: r.a.id,
    patientId: r.a.patientId,
    patientName: r.p.name,
    doctorId: r.a.doctorId,
    doctorName: r.s.name,
    department: r.a.department,
    scheduledAt: requiredIso(r.a.scheduledAt),
    status: r.a.status,
    reason: r.a.reason,
    tokenNumber: r.a.tokenNumber,
    createdAt: requiredIso(r.a.createdAt),
  }));
}

router.get("/appointments", async (req, res) => {
  const conds = [] as ReturnType<typeof eq>[];
  if (req.query.patientId) conds.push(eq(appointmentsTable.patientId, Number(req.query.patientId)));
  if (req.query.doctorId) conds.push(eq(appointmentsTable.doctorId, Number(req.query.doctorId)));
  if (req.query.department) conds.push(eq(appointmentsTable.department, String(req.query.department)));
  if (req.query.status) conds.push(eq(appointmentsTable.status, String(req.query.status)));
  if (req.query.date) {
    const d = new Date(String(req.query.date));
    d.setHours(0, 0, 0, 0);
    const n = new Date(d);
    n.setDate(n.getDate() + 1);
    conds.push(gte(appointmentsTable.scheduledAt, d));
    conds.push(lt(appointmentsTable.scheduledAt, n));
  }
  const rows = await db
    .select({ a: appointmentsTable, p: patientsTable, s: staffTable })
    .from(appointmentsTable)
    .innerJoin(patientsTable, eq(appointmentsTable.patientId, patientsTable.id))
    .innerJoin(staffTable, eq(appointmentsTable.doctorId, staffTable.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(appointmentsTable.scheduledAt))
    .limit(500);
  res.json(await shapeJoin(rows));
});

router.post("/appointments", requireRole("admin", "doctor", "receptionist"), async (req, res) => {
  const parsed = CreateAppointmentBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const when = new Date(parsed.data.scheduledAt);
  // Serialize concurrent bookings for the same doctor via a transaction-scoped
  // advisory lock so the conflict-check + insert is atomic. Without this two
  // requests can both pass the check and both insert into the same 15-min slot.
  let row: typeof appointmentsTable.$inferSelect | undefined;
  try {
    row = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${parsed.data.doctorId})`);
      if (await hasSlotConflict(tx, parsed.data.doctorId, when)) {
        throw new Error("__SLOT_CONFLICT__");
      }
      const [inserted] = await tx
        .insert(appointmentsTable)
        .values({
          patientId: parsed.data.patientId,
          doctorId: parsed.data.doctorId,
          department: parsed.data.department,
          scheduledAt: when,
          reason: parsed.data.reason,
        })
        .returning();
      return inserted;
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "__SLOT_CONFLICT__") {
      return res.status(409).json({ error: "Doctor already has an appointment within 15 minutes of this slot" });
    }
    throw e;
  }
  if (!row) return res.status(500).json({ error: "Insert failed" });
  const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, row.patientId));
  const [s] = await db.select().from(staffTable).where(eq(staffTable.id, row.doctorId));
  await sendNotification({
    eventKey: "appointment_booked",
    channel: "both",
    patientId: row.patientId,
    variables: { doctorName: s?.name, department: row.department, scheduledAt: requiredIso(row.scheduledAt) },
  });
  const [shaped] = await shapeJoin([{ a: row, p: p!, s: s! }]);
  res.status(201).json(shaped);
});

router.post("/appointments/:id/remind", async (req, res) => {
  const id = Number(req.params.id);
  const [r] = await db
    .select({ a: appointmentsTable, p: patientsTable, s: staffTable })
    .from(appointmentsTable)
    .innerJoin(patientsTable, eq(appointmentsTable.patientId, patientsTable.id))
    .innerJoin(staffTable, eq(appointmentsTable.doctorId, staffTable.id))
    .where(eq(appointmentsTable.id, id))
    .limit(1);
  if (!r) return res.status(404).json({ error: "Not found" });
  await sendNotification({
    eventKey: "appointment_reminder",
    channel: "both",
    patientId: r.a.patientId,
    variables: { patientName: r.p.name, doctorName: r.s.name, scheduledAt: requiredIso(r.a.scheduledAt) },
  });
  res.json({ ok: true });
});

router.patch("/appointments/:id", requireRole("admin", "doctor", "receptionist"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = UpdateAppointmentBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [existing] = await db.select().from(appointmentsTable).where(eq(appointmentsTable.id, id));
  if (!existing) return res.status(404).json({ error: "Not found" });

  // Restrict clinical-only status transitions at the API boundary. Receptionists
  // can reschedule or cancel, but only admin/doctor can mark completed/no_show.
  if (parsed.data.status && CLINICAL_STATUS.has(parsed.data.status)) {
    const userRole = (req as { user?: { role?: string } }).user?.role;
    if (!userRole || !STATUS_ROLES.has(userRole)) {
      return res.status(403).json({ error: `Only doctors can set status "${parsed.data.status}"` });
    }
  }

  const data: Partial<typeof appointmentsTable.$inferInsert> = {};
  if (parsed.data.status) data.status = parsed.data.status;
  if (parsed.data.reason !== undefined) data.reason = parsed.data.reason;

  let row: typeof appointmentsTable.$inferSelect | undefined;
  try {
    row = await db.transaction(async (tx) => {
      if (parsed.data.scheduledAt) {
        const when = new Date(parsed.data.scheduledAt);
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${existing.doctorId})`);
        if (await hasSlotConflict(tx, existing.doctorId, when, id)) {
          throw new Error("__SLOT_CONFLICT__");
        }
        data.scheduledAt = when;
      }
      const [updated] = await tx.update(appointmentsTable).set(data).where(eq(appointmentsTable.id, id)).returning();
      return updated;
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "__SLOT_CONFLICT__") {
      return res.status(409).json({ error: "Doctor already has an appointment within 15 minutes of this slot" });
    }
    throw e;
  }
  if (!row) return res.status(404).json({ error: "Not found" });
  const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, row.patientId));
  const [s] = await db.select().from(staffTable).where(eq(staffTable.id, row.doctorId));

  // Side-effects: notify on reschedule / cancellation / no-show. Completion
  // does not fire a patient SMS (avoids spam after the visit).
  const rescheduled = !!parsed.data.scheduledAt && existing.scheduledAt.getTime() !== row.scheduledAt.getTime();
  const statusChanged = !!parsed.data.status && existing.status !== row.status;
  if (rescheduled) {
    await sendNotification({
      eventKey: "appointment_rescheduled",
      channel: "both",
      patientId: row.patientId,
      variables: { patientName: p?.name, doctorName: s?.name, scheduledAt: requiredIso(row.scheduledAt) },
    });
  } else if (statusChanged && row.status === "cancelled") {
    await sendNotification({
      eventKey: "appointment_cancelled",
      channel: "both",
      patientId: row.patientId,
      variables: { patientName: p?.name, scheduledAt: requiredIso(row.scheduledAt) },
    });
  } else if (statusChanged && row.status === "no_show") {
    await sendNotification({
      eventKey: "appointment_no_show",
      channel: "sms",
      patientId: row.patientId,
      variables: { patientName: p?.name, scheduledAt: requiredIso(row.scheduledAt) },
    });
  }

  const [shaped] = await shapeJoin([{ a: row, p: p!, s: s! }]);
  res.json(shaped);
});

router.delete("/appointments/:id", requireRole("admin", "doctor", "receptionist"), async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db.update(appointmentsTable).set({ status: "cancelled" }).where(eq(appointmentsTable.id, id)).returning();
  if (row) {
    await sendNotification({
      eventKey: "appointment_cancelled",
      channel: "both",
      patientId: row.patientId,
      variables: { scheduledAt: requiredIso(row.scheduledAt) },
    });
  }
  res.status(204).send();
});

export default router;
