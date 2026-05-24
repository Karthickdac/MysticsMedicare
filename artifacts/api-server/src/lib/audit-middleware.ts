import type { RequestHandler } from "express";
import { db, auditLogTable } from "@workspace/db";
import { logger } from "./logger";

const SKIP_PREFIXES = [
  "/auth/",
  "/portal/",
  "/healthz",
  "/health",
  "/storage/",
  "/dashboard",
  "/audit",
  "/notifications/log",
];

function entityFromPath(path: string): { entity: string; entityId: number | null } {
  const parts = path.replace(/^\/+/, "").split("/");
  const entity = parts[0] ?? "unknown";
  for (const p of parts.slice(1).reverse()) {
    const n = Number(p);
    if (Number.isFinite(n) && n > 0) return { entity, entityId: n };
  }
  return { entity, entityId: null };
}

export const auditMiddleware: RequestHandler = (req, res, next) => {
  const m = req.method;
  if (m !== "POST" && m !== "PATCH" && m !== "PUT" && m !== "DELETE") return next();
  if (SKIP_PREFIXES.some((p) => req.path.startsWith(p))) return next();

  res.on("finish", () => {
    if (res.statusCode >= 400) return;
    const user = req.user;
    if (!user) return;
    const { entity, entityId } = entityFromPath(req.path);
    const insert: typeof auditLogTable.$inferInsert = {
      userId: user.id,
      userName: user.name,
      action: m,
      entity,
      entityId,
      ipAddress: req.ip ?? null,
      details: `${m} ${req.path}`,
    };
    db.insert(auditLogTable).values(insert).catch((err) => {
      logger.error({ err }, "audit log write failed");
    });
  });
  next();
};
