import { Router, type IRouter } from "express";
import { db, queueTokensTable, patientsTable } from "@workspace/db";
import { asc, eq, and, gte } from "drizzle-orm";
import { isoDate, requiredIso } from "../lib/format";
import { sendNotification } from "../lib/notifications";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();

function shape(q: typeof queueTokensTable.$inferSelect, p: typeof patientsTable.$inferSelect) {
  return {
    id: q.id,
    tokenNumber: q.tokenNumber,
    patientId: q.patientId,
    patientName: p.name,
    department: q.department,
    doctorName: q.doctorName,
    status: q.status,
    createdAt: requiredIso(q.createdAt),
    calledAt: isoDate(q.calledAt),
  };
}

router.post("/queue/opd/check-in", requireRole("admin", "receptionist", "nurse"), async (req, res) => {
  const patientId = Number(req.body?.patientId);
  const department = String(req.body?.department ?? "OPD");
  const doctorName = req.body?.doctorName ? String(req.body.doctorName) : null;
  if (!patientId) return res.status(400).json({ error: "patientId required" });
  const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, patientId));
  if (!p) return res.status(404).json({ error: "Patient not found" });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const existing = await db.select().from(queueTokensTable).where(eq(queueTokensTable.department, department));
  const todays = existing.filter((t) => t.createdAt >= today);
  const tokenNumber = (todays.reduce((m, t) => Math.max(m, t.tokenNumber), 0)) + 1;
  const [row] = await db.insert(queueTokensTable).values({
    tokenNumber, patientId, department, doctorName, status: "waiting",
  }).returning();
  res.status(201).json(shape(row, p));
});

router.get("/queue/opd/:id/position", async (req, res) => {
  const id = Number(req.params.id);
  const [target] = await db.select().from(queueTokensTable).where(eq(queueTokensTable.id, id));
  if (!target) return res.status(404).json({ error: "Token not found" });
  const waiting = await db
    .select()
    .from(queueTokensTable)
    .where(and(eq(queueTokensTable.status, "waiting"), eq(queueTokensTable.department, target.department)))
    .orderBy(asc(queueTokensTable.tokenNumber));
  const ahead = waiting.filter((t) => t.tokenNumber < target.tokenNumber).length;
  res.json({ tokenId: id, tokenNumber: target.tokenNumber, status: target.status, ahead, position: ahead + 1, totalWaiting: waiting.length });
});

router.get("/queue/opd", async (req, res) => {
  const where = req.query.department
    ? eq(queueTokensTable.department, String(req.query.department))
    : undefined;
  const rows = await db
    .select({ q: queueTokensTable, p: patientsTable })
    .from(queueTokensTable)
    .innerJoin(patientsTable, eq(queueTokensTable.patientId, patientsTable.id))
    .where(where)
    .orderBy(asc(queueTokensTable.tokenNumber))
    .limit(200);
  res.json(rows.map((r) => shape(r.q, r.p)));
});

// Aggregate live queue stats: per-department average wait (called - createdAt
// over today's served tokens) and per-doctor counters of waiting/served. Used
// by the OPD board KPI strip — kept as a separate endpoint so the queue list
// stays cheap to poll.
router.get("/queue/opd/stats", async (_req, res) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todays = await db
    .select()
    .from(queueTokensTable)
    .where(gte(queueTokensTable.createdAt, today));

  const byDept: Record<string, { waiting: number; called: number; completed: number; avgWaitSeconds: number | null }> = {};
  const byDoctor: Record<string, { waiting: number; servedToday: number }> = {};
  for (const t of todays) {
    const dept = (byDept[t.department] ??= { waiting: 0, called: 0, completed: 0, avgWaitSeconds: null });
    if (t.status === "waiting") dept.waiting++;
    else if (t.status === "called") dept.called++;
    else if (t.status === "completed") dept.completed++;
    const doctor = (byDoctor[t.doctorName ?? "Unassigned"] ??= { waiting: 0, servedToday: 0 });
    if (t.status === "waiting") doctor.waiting++;
    else if (t.status === "called" || t.status === "completed") doctor.servedToday++;
  }
  // Average wait per department from tokens that were actually called today.
  for (const dept of Object.keys(byDept)) {
    const called = todays.filter((t) => t.department === dept && t.calledAt);
    if (called.length) {
      const totalMs = called.reduce((s, t) => s + (t.calledAt!.getTime() - t.createdAt.getTime()), 0);
      byDept[dept]!.avgWaitSeconds = Math.round(totalMs / called.length / 1000);
    }
  }
  res.json({
    departments: Object.entries(byDept).map(([department, v]) => ({ department, ...v })),
    doctors: Object.entries(byDoctor).map(([doctorName, v]) => ({ doctorName, ...v })),
  });
});

router.post("/queue/opd/next", requireRole("admin", "doctor"), async (_req, res) => {
  const [next] = await db
    .select()
    .from(queueTokensTable)
    .where(eq(queueTokensTable.status, "waiting"))
    .orderBy(asc(queueTokensTable.tokenNumber))
    .limit(1);
  if (!next) return res.status(404).json({ error: "Queue empty" });
  const [row] = await db
    .update(queueTokensTable)
    .set({ status: "called", calledAt: new Date() })
    .where(and(eq(queueTokensTable.id, next.id)))
    .returning();
  const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, row.patientId));
  await sendNotification({
    eventKey: "opd_queue_called",
    channel: "both",
    patientId: row.patientId,
    variables: { tokenNumber: row.tokenNumber, department: row.department },
  });
  res.json(shape(row, p!));
});

// Per-token actions used by the live OPD board:
//   call     → call this specific token (out-of-order ok), notify patient
//   recall   → re-call (no status change; just re-notify)
//   skip     → mark as no_show (skipped), advance
//   complete → close out a called token after consultation
// All four are POST /queue/opd/:id/{action}. Each returns the updated token
// in the same QueueToken shape as GET /queue/opd.
// Per Task #6 role policy: token actions (call/recall/skip/complete) drive the
// consultation flow, so they are restricted to admin + doctor. Receptionists
// remain limited to /queue/opd/check-in; nurses are read-only.
router.post("/queue/opd/:id/:action", requireRole("admin", "doctor"), async (req, res) => {
  const id = Number(req.params.id);
  const action = String(req.params.action);
  if (!["call", "recall", "skip", "complete"].includes(action)) {
    return res.status(400).json({ error: "Unknown action" });
  }
  const [existing] = await db.select().from(queueTokensTable).where(eq(queueTokensTable.id, id));
  if (!existing) return res.status(404).json({ error: "Token not found" });

  const patch: Partial<typeof queueTokensTable.$inferInsert> = {};
  let notify = false;
  switch (action) {
    case "call":
      patch.status = "called";
      patch.calledAt = new Date();
      notify = true;
      break;
    case "recall":
      notify = true;
      break;
    case "skip":
      patch.status = "skipped";
      break;
    case "complete":
      patch.status = "completed";
      break;
  }
  const [row] = Object.keys(patch).length
    ? await db.update(queueTokensTable).set(patch).where(eq(queueTokensTable.id, id)).returning()
    : [existing];
  const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, row.patientId));
  if (notify) {
    await sendNotification({
      eventKey: "opd_queue_called",
      channel: "both",
      patientId: row.patientId,
      variables: { tokenNumber: row.tokenNumber, department: row.department },
    });
  }
  res.json(shape(row, p!));
});

export default router;
