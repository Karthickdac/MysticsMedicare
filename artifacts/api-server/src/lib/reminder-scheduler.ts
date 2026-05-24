import { db, appointmentsTable, notificationLogTable } from "@workspace/db";
import { and, eq, gte, lte } from "drizzle-orm";
import { sendNotification } from "./notifications";
import { logger } from "./logger";

const TICK_MS = 15 * 60 * 1000;
const WINDOW_MS = TICK_MS;

async function tick() {
  try {
    const now = Date.now();
    const target = new Date(now + 24 * 60 * 60 * 1000);
    const windowEnd = new Date(target.getTime() + WINDOW_MS);
    const due = await db
      .select()
      .from(appointmentsTable)
      .where(
        and(
          gte(appointmentsTable.scheduledAt, target),
          lte(appointmentsTable.scheduledAt, windowEnd),
          eq(appointmentsTable.status, "scheduled"),
        ),
      );
    for (const appt of due) {
      const tag = `appt:${appt.id}`;
      const already = await db
        .select({ id: notificationLogTable.id })
        .from(notificationLogTable)
        .where(
          and(
            eq(notificationLogTable.eventKey, "appointment_reminder"),
            eq(notificationLogTable.patientId, appt.patientId),
            eq(notificationLogTable.providerRef, tag),
          ),
        )
        .limit(1);
      if (already.length > 0) continue;
      await sendNotification({
        eventKey: "appointment_reminder",
        channel: "both",
        patientId: appt.patientId,
        providerRef: tag,
        variables: {
          appointmentId: appt.id,
          scheduledAt: appt.scheduledAt.toISOString(),
          department: appt.department ?? "",
        },
      });
    }
    if (due.length > 0) logger.info({ count: due.length }, "Sent appointment reminders");
  } catch (err) {
    logger.error({ err }, "reminder scheduler tick failed");
  }
}

export function startReminderScheduler(): void {
  if (process.env["DISABLE_REMINDER_SCHEDULER"] === "1") return;
  setInterval(tick, TICK_MS).unref();
  logger.info({ intervalMinutes: TICK_MS / 60000 }, "Appointment reminder scheduler started");
}
