import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db, patientOtpTable, patientAuditLogTable } from "@workspace/db";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
export const OTP_HOURLY_LIMIT = 5;

export const DEV_OTP_EXPOSED = process.env["NODE_ENV"] !== "production";

export function generateOtpCode(): string {
  // 6-digit, zero-padded. Buffer-based crypto.randomInt avoids modulo bias.
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function hashOtp(code: string): Promise<string> {
  return bcrypt.hash(code, 8);
}

export async function verifyOtp(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash);
}

export interface OtpRateState {
  cooldownActive: boolean;
  hourlyExceeded: boolean;
  cooldownSecondsRemaining: number;
}

export async function checkOtpRateLimits(patientId: number): Promise<OtpRateState> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await db
    .select({ id: patientOtpTable.id, createdAt: patientOtpTable.createdAt })
    .from(patientOtpTable)
    .where(and(eq(patientOtpTable.patientId, patientId), gte(patientOtpTable.createdAt, oneHourAgo)))
    .orderBy(desc(patientOtpTable.createdAt));
  if (recent.length === 0) {
    return { cooldownActive: false, hourlyExceeded: false, cooldownSecondsRemaining: 0 };
  }
  const last = recent[0]!;
  const ageMs = Date.now() - last.createdAt.getTime();
  return {
    cooldownActive: ageMs < OTP_RESEND_COOLDOWN_MS,
    hourlyExceeded: recent.length >= OTP_HOURLY_LIMIT,
    cooldownSecondsRemaining: Math.max(0, Math.ceil((OTP_RESEND_COOLDOWN_MS - ageMs) / 1000)),
  };
}

export async function issueOtp(patientId: number, ipAddress: string | null): Promise<string> {
  const code = generateOtpCode();
  const codeHash = await hashOtp(code);
  await db.insert(patientOtpTable).values({
    patientId,
    codeHash,
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
    ipAddress,
  });
  return code;
}

export interface OtpClaim {
  id: number;
  patientId: number;
  expiresAt: Date;
  attempts: number;
  codeHash: string;
}

export async function findActiveOtp(patientId: number): Promise<OtpClaim | null> {
  const [row] = await db
    .select()
    .from(patientOtpTable)
    .where(
      and(
        eq(patientOtpTable.patientId, patientId),
        isNull(patientOtpTable.consumedAt),
        gte(patientOtpTable.expiresAt, sql`NOW()`),
      ),
    )
    .orderBy(desc(patientOtpTable.createdAt))
    .limit(1);
  return row ?? null;
}

export async function bumpOtpAttempts(id: number): Promise<void> {
  await db
    .update(patientOtpTable)
    .set({ attempts: sql`${patientOtpTable.attempts} + 1` })
    .where(eq(patientOtpTable.id, id));
}

export async function consumeOtp(id: number): Promise<void> {
  await db
    .update(patientOtpTable)
    .set({ consumedAt: new Date() })
    .where(eq(patientOtpTable.id, id));
}

export interface PatientAuditEntry {
  patientId: number;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export async function recordPatientAudit(entry: PatientAuditEntry): Promise<void> {
  await db.insert(patientAuditLogTable).values(entry);
}
