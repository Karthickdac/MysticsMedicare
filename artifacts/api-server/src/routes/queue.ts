import { Router, type IRouter } from "express";
import { db, queueTokensTable, patientsTable } from "@workspace/db";
import { asc, eq, and } from "drizzle-orm";
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

router.get("/queue/opd", async (_req, res) => {
  const rows = await db
    .select({ q: queueTokensTable, p: patientsTable })
    .from(queueTokensTable)
    .innerJoin(patientsTable, eq(queueTokensTable.patientId, patientsTable.id))
    .orderBy(asc(queueTokensTable.tokenNumber))
    .limit(200);
  res.json(rows.map((r) => shape(r.q, r.p)));
});

router.post("/queue/opd/next", requireRole("admin", "doctor", "nurse", "receptionist"), async (_req, res) => {
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
    channel: "sms",
    patientId: row.patientId,
    variables: { tokenNumber: row.tokenNumber, department: row.department },
  });
  res.json(shape(row, p!));
});

export default router;
