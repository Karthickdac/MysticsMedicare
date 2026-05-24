import { Router, type IRouter } from "express";
import { db, otBookingsTable, patientsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { CreateOtBookingBody } from "@workspace/api-zod";
import { requiredIso } from "../lib/format";
import { sendNotification } from "../lib/notifications";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();

function shape(o: typeof otBookingsTable.$inferSelect, p: typeof patientsTable.$inferSelect) {
  return {
    id: o.id,
    patientId: o.patientId,
    patientName: p.name,
    procedure: o.procedure,
    theatre: o.theatre,
    surgeon: o.surgeon,
    anesthetist: o.anesthetist,
    scheduledAt: requiredIso(o.scheduledAt),
    durationMinutes: o.durationMinutes,
    status: o.status,
    createdAt: requiredIso(o.createdAt),
  };
}

router.get("/ot/bookings", async (_req, res) => {
  const rows = await db
    .select({ o: otBookingsTable, p: patientsTable })
    .from(otBookingsTable)
    .innerJoin(patientsTable, eq(otBookingsTable.patientId, patientsTable.id))
    .orderBy(desc(otBookingsTable.scheduledAt))
    .limit(500);
  res.json(rows.map((r) => shape(r.o, r.p)));
});

router.post("/ot/bookings", requireRole("admin", "doctor", "nurse"), async (req, res) => {
  const parsed = CreateOtBookingBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db
    .insert(otBookingsTable)
    .values({ ...parsed.data, scheduledAt: new Date(parsed.data.scheduledAt) })
    .returning();
  const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, row.patientId));
  await sendNotification({
    eventKey: "ot_scheduled",
    channel: "whatsapp",
    patientId: row.patientId,
    variables: { procedure: row.procedure, scheduledAt: requiredIso(row.scheduledAt) },
  });
  res.status(201).json(shape(row, p!));
});

export default router;
