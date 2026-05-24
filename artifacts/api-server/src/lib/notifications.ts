import { db } from "@workspace/db";
import {
  notificationTemplatesTable,
  notificationLogTable,
  patientsTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { logger } from "./logger";

export const NOTIFICATION_EVENTS: Array<{
  key: string;
  label: string;
  description: string;
  defaultVariables: string[];
}> = [
  { key: "appointment_booked", label: "Appointment Booked", description: "Sent when a new appointment is created", defaultVariables: ["patientName", "doctorName", "department", "scheduledAt"] },
  { key: "appointment_reminder", label: "Appointment Reminder", description: "Sent before scheduled appointment", defaultVariables: ["patientName", "doctorName", "scheduledAt"] },
  { key: "appointment_cancelled", label: "Appointment Cancelled", description: "Sent on cancellation", defaultVariables: ["patientName", "doctorName", "scheduledAt"] },
  { key: "opd_queue_called", label: "OPD Queue Called", description: "Sent when patient token is called", defaultVariables: ["patientName", "tokenNumber", "department"] },
  { key: "lab_result_ready", label: "Lab Result Ready", description: "Sent when lab result is recorded", defaultVariables: ["patientName", "testName"] },
  { key: "prescription_ready", label: "Prescription Ready", description: "Sent when prescription is dispensed", defaultVariables: ["patientName", "drug"] },
  { key: "bill_generated", label: "Bill Generated", description: "Sent when a new bill is created", defaultVariables: ["patientName", "billNumber", "total"] },
  { key: "bill_paid", label: "Bill Paid", description: "Sent when bill is marked paid", defaultVariables: ["patientName", "billNumber", "total"] },
  { key: "ipd_admission", label: "IPD Admission", description: "Sent on admission", defaultVariables: ["patientName", "bedCode", "ward"] },
  { key: "ipd_discharge", label: "IPD Discharge", description: "Sent on discharge", defaultVariables: ["patientName", "bedCode"] },
  { key: "vaccination_reminder", label: "Vaccination Reminder", description: "Sent before next dose due", defaultVariables: ["patientName", "vaccineName", "nextDueDate"] },
  { key: "ot_scheduled", label: "OT Scheduled", description: "Sent when surgery is scheduled", defaultVariables: ["patientName", "procedure", "scheduledAt"] },
  { key: "checkup_due", label: "Health Checkup Due", description: "Sent when health checkup is due", defaultVariables: ["patientName", "packageName"] },
  { key: "medication_scheduled", label: "Medication Scheduled", description: "Sent when medication is scheduled", defaultVariables: ["patientName", "drug", "scheduledAt"] },
  { key: "medication_reminder", label: "Medication Reminder", description: "Sent before each dose", defaultVariables: ["patientName", "drug", "doseTime"] },
  { key: "consent_request", label: "Consent Request", description: "Sent when patient consent is required", defaultVariables: ["patientName", "consentType"] },
  { key: "discharge_summary_ready", label: "Discharge Summary Ready", description: "Sent when discharge summary PDF is ready", defaultVariables: ["patientName", "summaryUrl"] },
];

export function renderTemplate(body: string, vars: Record<string, string | number | null | undefined>): string {
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const v = vars[key];
    return v === null || v === undefined ? "" : String(v);
  });
}

export interface SendNotificationOpts {
  eventKey: string;
  channel: string;
  patientId: number;
  staffId?: number | null;
  recipientPhone?: string;
  providerRef?: string | null;
  variables: Record<string, string | number | null | undefined>;
}

async function dispatchOne(opts: SendNotificationOpts, channel: "whatsapp" | "sms", phone: string, patientName: string | undefined) {
  const [template] = await db
    .select()
    .from(notificationTemplatesTable)
    .where(
      and(
        eq(notificationTemplatesTable.eventKey, opts.eventKey),
        inArray(notificationTemplatesTable.channel, [channel, "both"]),
        eq(notificationTemplatesTable.isActive, true),
      ),
    )
    .limit(1);

  const merged = { patientName, ...opts.variables };
  const rendered = template
    ? renderTemplate(template.bodyTemplate, merged)
    : `[${opts.eventKey}] ${JSON.stringify(merged)}`;

  const status = template ? "sent" : "failed";
  const errorMessage = template ? null : "no active template for event/channel";

  const [logEntry] = await db
    .insert(notificationLogTable)
    .values({
      patientId: opts.patientId,
      staffId: opts.staffId ?? null,
      eventKey: opts.eventKey,
      channel,
      templateId: template?.id,
      renderedBody: rendered,
      recipientPhone: phone,
      status,
      errorMessage,
      providerRef: opts.providerRef ?? (template ? `stub-${Date.now()}` : null),
    })
    .returning();

  logger.info(
    { eventKey: opts.eventKey, channel, patientId: opts.patientId, status },
    "notification dispatched (stub provider)",
  );
  return logEntry;
}

export async function sendNotification(opts: SendNotificationOpts) {
  let phone = opts.recipientPhone ?? "";
  let patientName: string | undefined = typeof opts.variables.patientName === "string" ? opts.variables.patientName : undefined;
  if (!phone || !patientName) {
    const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, opts.patientId)).limit(1);
    if (p) {
      phone = phone || p.phone;
      patientName = patientName ?? p.name;
    }
  }

  const channels: Array<"whatsapp" | "sms"> = opts.channel === "both"
    ? ["whatsapp", "sms"]
    : opts.channel === "sms" ? ["sms"] : ["whatsapp"];

  let last;
  for (const ch of channels) {
    last = await dispatchOne(opts, ch, phone, patientName);
  }
  return last!;
}
