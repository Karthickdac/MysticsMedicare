import type { InferSelectModel } from "drizzle-orm";
import type * as schema from "@workspace/db";

export function isoDate(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return typeof d === "string" ? d : d.toISOString();
}

export function requiredIso(d: Date | string): string {
  return typeof d === "string" ? d : d.toISOString();
}

export function ageFromDob(dob: string | Date): number {
  const d = typeof dob === "string" ? new Date(dob) : dob;
  const ms = Date.now() - d.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24 * 365.25));
}

export function num(n: string | number | null | undefined): number {
  if (n === null || n === undefined) return 0;
  return typeof n === "number" ? n : parseFloat(n);
}

export function dateOnly(d: string | Date | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

export type Patient = InferSelectModel<typeof schema.patientsTable>;
