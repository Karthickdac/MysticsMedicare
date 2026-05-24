import bcrypt from "bcryptjs";
import crypto from "crypto";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const SECRET = (() => {
  const s = process.env["SESSION_SECRET"];
  if (s && s.length >= 16) return s;
  if (process.env["NODE_ENV"] === "production") {
    throw new Error("SESSION_SECRET env var is required in production (min 16 chars)");
  }
  return "dev-medicare-hms-secret-change-me-please-only-for-local-dev";
})();
const COOKIE_NAME = "hms_session";
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  if (hash.startsWith("$2")) return bcrypt.compare(plain, hash);
  return plain === hash;
}

function sign(payload: string): string {
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function verify(token: string): string | null {
  const idx = token.lastIndexOf(".");
  if (idx < 0) return null;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { uid: number; exp: number };
    if (data.exp < Date.now()) return null;
    return String(data.uid);
  } catch {
    return null;
  }
}

function signPatient(payload: string): string {
  const sig = crypto.createHmac("sha256", SECRET + ":patient").update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function verifyPatientToken(token: string): number | null {
  const idx = token.lastIndexOf(".");
  if (idx < 0) return null;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = crypto.createHmac("sha256", SECRET + ":patient").update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { pid: number; exp: number };
    if (data.exp < Date.now()) return null;
    return data.pid;
  } catch {
    return null;
  }
}

const PATIENT_COOKIE = "hms_patient_session";

export function issuePatientCookie(res: Response, patientId: number): void {
  const payload = Buffer.from(JSON.stringify({ pid: patientId, exp: Date.now() + MAX_AGE_MS })).toString("base64url");
  res.cookie(PATIENT_COOKIE, signPatient(payload), {
    httpOnly: true, sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    maxAge: MAX_AGE_MS, path: "/",
  });
}

export function clearPatientCookie(res: Response): void {
  res.clearCookie(PATIENT_COOKIE, { path: "/" });
}

export function readPatientId(req: Request): number | null {
  const raw = req.cookies?.[PATIENT_COOKIE];
  if (typeof raw !== "string" || !raw) return null;
  return verifyPatientToken(raw);
}

export const requirePatient: RequestHandler = (req, res, next) => {
  const pid = readPatientId(req);
  if (!pid) {
    res.status(401).json({ error: "Patient session required" });
    return;
  }
  (req as Request & { patientId?: number }).patientId = pid;
  next();
};

export function issueSessionCookie(res: Response, userId: number): void {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + MAX_AGE_MS })).toString("base64url");
  const token = sign(payload);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    maxAge: MAX_AGE_MS,
    path: "/",
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: string;
  staffId: number | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const attachUser: RequestHandler = async (req, _res, next) => {
  const raw = req.cookies?.[COOKIE_NAME];
  if (typeof raw !== "string" || !raw) return next();
  const uid = verify(raw);
  if (!uid) return next();
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, Number(uid)));
  if (u) {
    req.user = { id: u.id, email: u.email, name: u.name, role: u.role, staffId: u.staffId };
  }
  next();
};

const PUBLIC_PATHS = new Set<string>([
  "/auth/login",
  "/auth/logout",
  "/auth/me",
  "/health",
  "/healthz",
  "/portal/login",
  "/portal/logout",
  "/portal/me",
  // Public hospital branding + working hours/holidays. Consumed by both
  // staff (booking) and the patient portal (book + reschedule) so it must
  // be reachable without a staff session.
  "/hospital-settings/public",
]);
const PUBLIC_PREFIXES = ["/storage/public-objects/", "/portal/"];

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (PUBLIC_PATHS.has(req.path) || PUBLIC_PREFIXES.some((p) => req.path.startsWith(p))) return next();
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// Permission-based authorization. Resolves the caller's permissions from
// the rolesTable (cached 60s) with a built-in role fallback. Grants access
// when the user has ANY of the requested permissions. Prefer this over
// requireRole(...) for new routes so custom roles in the matrix actually
// take effect on the server.
export function requirePermission(...perms: string[]): RequestHandler {
  return async (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    try {
      const { getPermissionsForRole } = await import("./permissions");
      const granted = await getPermissionsForRole(req.user.role);
      if (perms.some((p) => granted.has(p))) return next();
      res.status(403).json({ error: `Forbidden — missing permission: ${perms.join(" or ")}` });
    } catch {
      res.status(500).json({ error: "Permission check failed" });
    }
  };
}

export function requireRole(...roles: string[]): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
