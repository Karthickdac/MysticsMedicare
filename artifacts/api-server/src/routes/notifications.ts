import { Router, type IRouter } from "express";
import { db, notificationTemplatesTable, notificationLogTable, patientsTable } from "@workspace/db";
import { desc, eq, and } from "drizzle-orm";
import {
  CreateNotificationTemplateBody,
  UpdateNotificationTemplateBody,
  PreviewNotificationTemplateBody,
  SendNotificationBody,
} from "@workspace/api-zod";
import { requiredIso } from "../lib/format";
import { NOTIFICATION_EVENTS, renderTemplate, sendNotification } from "../lib/notifications";
import { requirePermission } from "../lib/auth";

const router: IRouter = Router();
const adminOnly = requirePermission("admin.notifications");

function shapeTemplate(t: typeof notificationTemplatesTable.$inferSelect) {
  return {
    id: t.id,
    eventKey: t.eventKey,
    channel: t.channel,
    language: t.language,
    subject: t.subject,
    bodyTemplate: t.bodyTemplate,
    variables: (t.variables as string[]) ?? [],
    isActive: t.isActive,
    createdAt: requiredIso(t.createdAt),
    updatedAt: requiredIso(t.updatedAt),
  };
}

function shapeLog(l: typeof notificationLogTable.$inferSelect, p?: typeof patientsTable.$inferSelect | null) {
  return {
    id: l.id,
    patientId: l.patientId,
    patientName: p?.name ?? null,
    eventKey: l.eventKey,
    channel: l.channel,
    templateId: l.templateId,
    renderedBody: l.renderedBody,
    recipientPhone: l.recipientPhone,
    status: l.status,
    providerRef: l.providerRef,
    errorMessage: l.errorMessage,
    sentAt: requiredIso(l.sentAt),
  };
}

router.get("/notifications/templates", adminOnly, async (req, res) => {
  const conds = [] as ReturnType<typeof eq>[];
  if (req.query.eventKey) conds.push(eq(notificationTemplatesTable.eventKey, String(req.query.eventKey)));
  if (req.query.channel) conds.push(eq(notificationTemplatesTable.channel, String(req.query.channel)));
  const rows = await db
    .select()
    .from(notificationTemplatesTable)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(notificationTemplatesTable.eventKey, notificationTemplatesTable.channel);
  res.json(rows.map(shapeTemplate));
});

router.post("/notifications/templates", adminOnly, async (req, res) => {
  const parsed = CreateNotificationTemplateBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db
    .insert(notificationTemplatesTable)
    .values({
      eventKey: parsed.data.eventKey,
      channel: parsed.data.channel,
      language: parsed.data.language,
      subject: parsed.data.subject,
      bodyTemplate: parsed.data.bodyTemplate,
      variables: parsed.data.variables ?? [],
      isActive: parsed.data.isActive ?? true,
    })
    .returning();
  res.status(201).json(shapeTemplate(row));
});

router.get("/notifications/templates/:id", adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db.select().from(notificationTemplatesTable).where(eq(notificationTemplatesTable.id, id));
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(shapeTemplate(row));
});

router.patch("/notifications/templates/:id", adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const parsed = UpdateNotificationTemplateBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db
    .update(notificationTemplatesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(notificationTemplatesTable.id, id))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(shapeTemplate(row));
});

router.delete("/notifications/templates/:id", adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(notificationTemplatesTable).where(eq(notificationTemplatesTable.id, id));
  res.status(204).send();
});

async function previewHandler(req: import("express").Request, res: import("express").Response) {
  const parsed = PreviewNotificationTemplateBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  res.json({ rendered: renderTemplate(parsed.data.bodyTemplate, parsed.data.variables) });
}
router.post("/notifications/templates/preview", adminOnly, previewHandler);
router.post("/notifications/test-template", adminOnly, previewHandler);

router.post("/notifications/send", adminOnly, async (req, res) => {
  const parsed = SendNotificationBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const log = await sendNotification(parsed.data);
  const [p] = log.patientId ? await db.select().from(patientsTable).where(eq(patientsTable.id, log.patientId)) : [null];
  res.status(201).json(shapeLog(log, p));
});

router.get("/notifications/log", adminOnly, async (req, res) => {
  const { gte, lte } = await import("drizzle-orm");
  const conds = [] as unknown[];
  if (req.query.patientId) conds.push(eq(notificationLogTable.patientId, Number(req.query.patientId)));
  if (req.query.eventKey) conds.push(eq(notificationLogTable.eventKey, String(req.query.eventKey)));
  if (req.query.channel) conds.push(eq(notificationLogTable.channel, String(req.query.channel)));
  if (req.query.status) conds.push(eq(notificationLogTable.status, String(req.query.status)));
  if (req.query.from) conds.push(gte(notificationLogTable.sentAt, new Date(String(req.query.from))));
  if (req.query.to) conds.push(lte(notificationLogTable.sentAt, new Date(String(req.query.to))));
  const limit = Math.min(Number(req.query.limit ?? 100) || 100, 500);
  const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0);
  const rows = await db
    .select({ l: notificationLogTable, p: patientsTable })
    .from(notificationLogTable)
    .leftJoin(patientsTable, eq(notificationLogTable.patientId, patientsTable.id))
    .where(conds.length ? and(...(conds as Parameters<typeof and>)) : undefined)
    .orderBy(desc(notificationLogTable.sentAt))
    .limit(limit)
    .offset(offset);
  res.json(rows.map((r) => shapeLog(r.l, r.p)));
});

router.get("/notifications/log/:id", adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const [r] = await db
    .select({ l: notificationLogTable, p: patientsTable })
    .from(notificationLogTable)
    .leftJoin(patientsTable, eq(notificationLogTable.patientId, patientsTable.id))
    .where(eq(notificationLogTable.id, id));
  if (!r) return res.status(404).json({ error: "Not found" });
  res.json(shapeLog(r.l, r.p));
});

router.get("/notifications/events", (_req, res) => {
  res.json(NOTIFICATION_EVENTS);
});

export default router;
