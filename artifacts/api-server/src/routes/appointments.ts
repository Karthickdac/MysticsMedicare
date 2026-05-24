import { Router, type IRouter } from "express";
import { db, appointmentsTable, patientsTable, staffTable } from "@workspace/db";
import { desc, eq, and, gte, lt } from "drizzle-orm";
import { CreateAppointmentBody, UpdateAppointmentBody } from "@workspace/api-zod";
import { requiredIso } from "../lib/format";
import { sendNotification } from "../lib/notifications";
import { requireRole } from "../lib/auth";

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

router.post("/appointments", requireRole("admin", "doctor", "nurse", "receptionist"), async (req, res) => {
  const parsed = CreateAppointmentBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db
    .insert(appointmentsTable)
    .values({
      patientId: parsed.data.patientId,
      doctorId: parsed.data.doctorId,
      department: parsed.data.department,
      scheduledAt: new Date(parsed.data.scheduledAt),
      reason: parsed.data.reason,
    })
    .returning();
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

router.patch("/appointments/:id", requireRole("admin", "doctor", "nurse", "receptionist"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = UpdateAppointmentBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const data: Partial<typeof appointmentsTable.$inferInsert> = {};
  if (parsed.data.status) data.status = parsed.data.status;
  if (parsed.data.reason !== undefined) data.reason = parsed.data.reason;
  if (parsed.data.scheduledAt) data.scheduledAt = new Date(parsed.data.scheduledAt);
  const [row] = await db.update(appointmentsTable).set(data).where(eq(appointmentsTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, row.patientId));
  const [s] = await db.select().from(staffTable).where(eq(staffTable.id, row.doctorId));
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
