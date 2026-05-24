import { Router, type IRouter } from "express";
import { db, auditLogTable } from "@workspace/db";
import { desc, eq, and, gte, lte, ilike, or, type SQL } from "drizzle-orm";
import { requiredIso } from "../lib/format";
import { requirePermission } from "../lib/auth";

const router: IRouter = Router();

router.get("/audit", requirePermission("admin.audit"), async (req, res) => {
  const conds: SQL[] = [];
  if (req.query.userId) conds.push(eq(auditLogTable.userId, Number(req.query.userId)));
  if (req.query.entity) conds.push(eq(auditLogTable.entity, String(req.query.entity)));
  if (req.query.action) conds.push(eq(auditLogTable.action, String(req.query.action)));
  if (req.query.fromDate) {
    const d = new Date(String(req.query.fromDate));
    if (!isNaN(d.getTime())) {
      d.setHours(0, 0, 0, 0);
      conds.push(gte(auditLogTable.createdAt, d));
    }
  }
  if (req.query.toDate) {
    const d = new Date(String(req.query.toDate));
    if (!isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999);
      conds.push(lte(auditLogTable.createdAt, d));
    }
  }
  if (req.query.q) {
    const q = `%${String(req.query.q)}%`;
    const search = or(
      ilike(auditLogTable.userName, q),
      ilike(auditLogTable.entity, q),
      ilike(auditLogTable.details, q),
    );
    if (search) conds.push(search);
  }

  // Pagination — clamp to keep CSV exports of "last N" sane. The frontend
  // detects "no more pages" when rows.length < limit, so we never need to
  // return a total count.
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 1000);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const rows = await db
    .select()
    .from(auditLogTable)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(auditLogTable.createdAt))
    .limit(limit)
    .offset(offset);

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
