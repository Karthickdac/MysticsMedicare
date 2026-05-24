import { Router, type IRouter } from "express";
import { db, videoRecordingsTable, patientsTable } from "@workspace/db";
import { desc, eq, and } from "drizzle-orm";
import { CreateVideoBody } from "@workspace/api-zod";
import { num, requiredIso } from "../lib/format";
import { requireRole } from "../lib/auth";
import { ObjectStorageService } from "../lib/objectStorage";
import { setObjectAclPolicy } from "../lib/objectAcl";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

function shape(v: typeof videoRecordingsTable.$inferSelect, p: typeof patientsTable.$inferSelect) {
  return {
    id: v.id,
    patientId: v.patientId,
    patientName: p.name,
    encounterId: v.encounterId,
    encounterType: v.encounterType,
    title: v.title,
    description: v.description,
    fileUrl: v.fileUrl,
    mimeType: v.mimeType,
    durationSeconds: num(v.durationSeconds),
    fileSize: v.fileSize,
    recordedBy: v.recordedBy,
    thumbnailUrl: v.thumbnailUrl,
    createdAt: requiredIso(v.createdAt),
  };
}

router.get("/videos", async (req, res) => {
  const conds = [] as ReturnType<typeof eq>[];
  if (req.query.patientId) conds.push(eq(videoRecordingsTable.patientId, Number(req.query.patientId)));
  if (req.query.encounterId) conds.push(eq(videoRecordingsTable.encounterId, Number(req.query.encounterId)));
  if (req.query.type) conds.push(eq(videoRecordingsTable.encounterType, String(req.query.type)));
  const rows = await db
    .select({ v: videoRecordingsTable, p: patientsTable })
    .from(videoRecordingsTable)
    .innerJoin(patientsTable, eq(videoRecordingsTable.patientId, patientsTable.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(videoRecordingsTable.createdAt))
    .limit(500);
  res.json(rows.map((r) => shape(r.v, r.p)));
});

router.post("/videos", requireRole("admin", "doctor", "nurse"), async (req, res) => {
  const parsed = CreateVideoBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db
    .insert(videoRecordingsTable)
    .values({ ...parsed.data, durationSeconds: parsed.data.durationSeconds.toString() })
    .returning();
  const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, row.patientId));
  res.status(201).json(shape(row, p!));
});

router.get("/videos/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [r] = await db
    .select({ v: videoRecordingsTable, p: patientsTable })
    .from(videoRecordingsTable)
    .innerJoin(patientsTable, eq(videoRecordingsTable.patientId, patientsTable.id))
    .where(eq(videoRecordingsTable.id, id))
    .limit(1);
  if (!r) return res.status(404).json({ error: "Not found" });
  res.json(shape(r.v, r.p));
});

router.delete("/videos/:id", requireRole("admin", "doctor"), async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(videoRecordingsTable).where(eq(videoRecordingsTable.id, id));
  res.status(204).send();
});

router.post(
  "/videos/upload-url",
  requireRole("admin", "doctor", "nurse"),
  async (req, res) => {
    const contentType = typeof req.body?.contentType === "string" ? req.body.contentType : "video/webm";
    if (!contentType.startsWith("video/")) {
      return res.status(400).json({ error: "contentType must be a video/* mime type" });
    }
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    res.json({ uploadURL, objectPath, method: "PUT", contentType });
  },
);

router.post(
  "/videos/upload-finalize",
  requireRole("admin", "doctor", "nurse"),
  async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const objectPath = typeof req.body?.objectPath === "string" ? req.body.objectPath : null;
      if (!objectPath) return res.status(400).json({ error: "objectPath required" });
      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
      await setObjectAclPolicy(objectFile, { owner: String(req.user.id), visibility: "private" });
      res.json({ ok: true, objectPath });
    } catch (error) {
      req.log.error({ err: error }, "Error finalizing video upload");
      res.status(500).json({ error: "Failed to finalize video upload" });
    }
  },
);

export default router;
