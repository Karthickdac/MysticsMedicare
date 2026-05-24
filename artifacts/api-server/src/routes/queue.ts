import { Router, type IRouter } from "express";
import { db, queueTokensTable, patientsTable } from "@workspace/db";
import { asc, eq, and } from "drizzle-orm";
import { isoDate, requiredIso } from "../lib/format";
import { sendNotification } from "../lib/notifications";

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

router.get("/queue/opd", async (_req, res) => {
  const rows = await db
    .select({ q: queueTokensTable, p: patientsTable })
    .from(queueTokensTable)
    .innerJoin(patientsTable, eq(queueTokensTable.patientId, patientsTable.id))
    .orderBy(asc(queueTokensTable.tokenNumber))
    .limit(200);
  res.json(rows.map((r) => shape(r.q, r.p)));
});

router.post("/queue/opd/next", async (_req, res) => {
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
