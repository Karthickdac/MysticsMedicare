import { db, rolesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const KNOWN_PERMISSIONS = [
  "patient.read", "patient.write", "patient.delete",
  "appointment.read", "appointment.write", "appointment.cancel",
  "encounter.read", "encounter.write",
  "lab.read", "lab.order", "lab.result", "lab.verify",
  "radiology.read", "radiology.order", "radiology.report", "radiology.verify",
  "prescription.read", "prescription.write", "prescription.dispense",
  "pharmacy.read", "pharmacy.sell", "pharmacy.purchase", "pharmacy.grn",
  "billing.read", "billing.create", "billing.collect", "billing.refund", "billing.void", "billing.claim",
  "ipd.admit", "ipd.discharge", "ipd.nursing", "ipd.rounds",
  "ot.read", "ot.book", "ot.complete",
  "inventory.read", "inventory.write",
  "vaccination.read", "vaccination.write",
  "consent.read", "consent.write",
  "vitals.read", "vitals.write",
  "videos.read", "videos.upload",
  "roster.read", "roster.write",
  "staff.read", "staff.write",
  "reports.read", "reports.export",
  "admin.settings", "admin.roles", "admin.audit", "admin.notifications",
] as const;

export type Permission = (typeof KNOWN_PERMISSIONS)[number];

export const BUILTIN_ROLE_DEFS: Array<{ name: string; description: string; permissions: string[] }> = [
  { name: "admin", description: "Full system access", permissions: [...KNOWN_PERMISSIONS] },
  { name: "doctor", description: "Physician — clinical workflows", permissions: [
    "patient.read","patient.write","appointment.read","appointment.write","appointment.cancel",
    "encounter.read","encounter.write","lab.read","lab.order","lab.result","lab.verify",
    "radiology.read","radiology.order","radiology.report","radiology.verify",
    "prescription.read","prescription.write","vitals.read","vitals.write",
    "ipd.admit","ipd.discharge","ipd.rounds","ot.read","ot.book","ot.complete",
    "vaccination.read","vaccination.write","consent.read","consent.write","videos.read","videos.upload",
    "roster.read","reports.read","staff.read",
  ]},
  { name: "nurse", description: "Nursing — vitals, MAR, rounds", permissions: [
    "patient.read","encounter.read","vitals.read","vitals.write","ipd.nursing","ipd.rounds",
    "ipd.discharge","ot.read","ot.complete","vaccination.read","vaccination.write",
    "pharmacy.read","prescription.read","prescription.dispense","roster.read","staff.read",
  ]},
  { name: "receptionist", description: "Front desk — appointments, registration", permissions: [
    "patient.read","patient.write","appointment.read","appointment.write","appointment.cancel",
    "encounter.read","billing.read","billing.create","ipd.admit","roster.read","staff.read",
  ]},
  { name: "accountant", description: "Finance — bills, reports, GST", permissions: [
    "billing.read","billing.create","billing.collect","billing.refund","billing.void","billing.claim",
    "reports.read","reports.export","staff.read",
  ]},
  { name: "cashier", description: "Front-desk collections", permissions: [
    "billing.read","billing.create","billing.collect","patient.read","staff.read",
  ]},
  { name: "pharmacist", description: "Pharmacy dispense + purchase", permissions: [
    "pharmacy.read","pharmacy.sell","pharmacy.purchase","pharmacy.grn",
    "prescription.read","prescription.dispense","inventory.read","inventory.write","staff.read",
  ]},
  { name: "lab_tech", description: "Lab sample collection + result entry", permissions: [
    "lab.read","lab.result","patient.read","staff.read",
  ]},
  { name: "radiologist", description: "Radiology reporting", permissions: [
    "radiology.read","radiology.report","radiology.verify","patient.read","staff.read",
  ]},
];

const BUILTIN_PERMS: Record<string, Set<string>> = Object.fromEntries(
  BUILTIN_ROLE_DEFS.map((r) => [r.name, new Set(r.permissions)]),
);

interface CacheEntry { perms: Set<string>; expiresAt: number; }
const cache = new Map<string, CacheEntry>();
const TTL_MS = 60_000;

export async function getPermissionsForRole(roleName: string): Promise<Set<string>> {
  const now = Date.now();
  const hit = cache.get(roleName);
  if (hit && hit.expiresAt > now) return hit.perms;
  try {
    const [row] = await db.select().from(rolesTable).where(eq(rolesTable.name, roleName));
    if (row) {
      const perms = new Set((row.permissions as string[]) ?? []);
      cache.set(roleName, { perms, expiresAt: now + TTL_MS });
      return perms;
    }
  } catch {
    // DB unavailable — fall through to builtin defaults so a transient DB
    // hiccup never opens the door, only closes it to non-builtin grants.
  }
  const builtin = BUILTIN_PERMS[roleName] ?? new Set<string>();
  cache.set(roleName, { perms: builtin, expiresAt: now + TTL_MS });
  return builtin;
}

export function invalidateRolePermissionsCache(name?: string): void {
  if (name) cache.delete(name);
  else cache.clear();
}
