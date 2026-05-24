import { Router, type IRouter } from "express";
import { db, auditLogTable } from "@workspace/db";
import { desc, eq, and } from "drizzle-orm";
import { requiredIso } from "../lib/format";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();

router.get("/audit", requireRole("admin"), async (req, res) => {
  const conds = [] as ReturnType<typeof eq>[];
  if (req.query.userId) conds.push(eq(auditLogTable.userId, Number(req.query.userId)));
  if (req.query.entity) conds.push(eq(auditLogTable.entity, String(req.query.entity)));
  const rows = await db
    .select()
    .from(auditLogTable)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(auditLogTable.createdAt))
    .limit(500);
  res.json(
    rows.map((a) => ({
      id: a.id,
      userId: a.userId,
      userName: a.userName,
      action: a.action,
      entity: a.entity,
      entityId: a.entityId,
      ipAddress: a.ipAddress,
      details: a.details,
      createdAt: requiredIso(a.createdAt),
    })),
  );
});

export default router;
