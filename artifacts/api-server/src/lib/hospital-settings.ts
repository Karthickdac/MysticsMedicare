import { db, hospitalSettingsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

// Centralized read of the singleton hospital_settings row. Cached in-process
// because every bill insert / appointment booking / PDF render would otherwise
// re-query the same row. TTL is short so admins see their edits reflected
// quickly across the cluster; explicit invalidation on PUT keeps the local
// process tight.

export type HospitalSettingsRow = typeof hospitalSettingsTable.$inferSelect;

type DayCfg = { open?: string; close?: string; closed?: boolean };
export type WorkingHours = Record<string, DayCfg>;
export type Holiday = { date: string; label: string };

const TTL_MS = 30_000;
let cache: { value: HospitalSettingsRow; expiresAt: number } | null = null;

export function invalidateHospitalSettingsCache(): void {
  cache = null;
}

export async function getHospitalSettings(): Promise<HospitalSettingsRow> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.value;
  const [existing] = await db
    .select()
    .from(hospitalSettingsTable)
    .where(eq(hospitalSettingsTable.id, 1));
  if (existing) {
    cache = { value: existing, expiresAt: now + TTL_MS };
    return existing;
  }
  const [created] = await db
    .insert(hospitalSettingsTable)
    .values({
      id: 1,
      name: "MediCare Pro",
      legalName: "Mystics MediCare Pvt Ltd",
      invoicePrefix: "INV",
      receiptPrefix: "RCT",
      primaryColor: "#0ea5e9",
      workingHours: {
        mon: { open: "08:00", close: "20:00" },
        tue: { open: "08:00", close: "20:00" },
        wed: { open: "08:00", close: "20:00" },
        thu: { open: "08:00", close: "20:00" },
        fri: { open: "08:00", close: "20:00" },
        sat: { open: "09:00", close: "14:00" },
        sun: { closed: true },
      },
      holidays: [],
    })
    .returning();
  cache = { value: created, expiresAt: now + TTL_MS };
  return created;
}

function sanitizePrefix(raw: string | null | undefined, fallback: string): string {
  const s = String(raw ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s.slice(0, 6) || fallback;
}

// Bill / receipt number generation. Format: <PREFIX><YYYYMMDD><4-digit seq>.
// Sequence is sourced from the table's max(id)+1 inside the same tx that
// inserts the row, matching the prior hard-coded behaviour.
// Accept anything with an .execute() returning { rows } — works for the
// top-level `db` client and any drizzle transaction handle.
type SqlExecutor = {
  execute: (query: ReturnType<typeof sql>) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

export async function nextBillNumber(tx: SqlExecutor): Promise<string> {
  const settings = await getHospitalSettings();
  const prefix = sanitizePrefix(settings.invoicePrefix, "INV");
  const result = await tx.execute(
    sql`SELECT ${sql.raw(`'${prefix}'`)} || to_char(now(), 'YYYYMMDD') || lpad((coalesce(max(id),0)+1)::text, 4, '0') AS next FROM bills`,
  );
  return String((result.rows[0] as { next: string }).next);
}

export async function nextReceiptNumber(tx: SqlExecutor): Promise<string> {
  const settings = await getHospitalSettings();
  const prefix = sanitizePrefix(settings.receiptPrefix, "RCT");
  const result = await tx.execute(
    sql`SELECT ${sql.raw(`'${prefix}'`)} || to_char(now(),'YYYYMMDD') || lpad((coalesce(max(id),0)+1)::text, 4, '0') AS next FROM bill_payments`,
  );
  return String((result.rows[0] as { next: string }).next);
}

// ---------------------------------------------------------------------------
// Appointment slot validation against working hours & holidays.
// Returns null when valid; an error message string when the slot is rejected.
// ---------------------------------------------------------------------------
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function parseHHMM(s: string | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

// Generate 15-min candidate slots for a given local date based on working
// hours + holidays. Returns either { closed, reason } or a list of HH:MM
// strings the UI can render. Holidays and closed days yield a closed flag so
// the UI can show a friendly message instead of an empty dropdown.
export async function generateSlotsForDate(
  dateStr: string,
  stepMin = 15,
): Promise<{ closed: boolean; reason?: string; slots: string[]; openMin?: number; closeMin?: number }> {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return { closed: true, reason: "Invalid date", slots: [] };
  const when = new Date(`${dateStr}T00:00:00`);
  const settings = await getHospitalSettings();
  const holidays = (settings.holidays as Holiday[] | null) ?? [];
  const holiday = holidays.find((h) => h.date === dateStr);
  if (holiday) {
    return { closed: true, reason: `Closed: ${holiday.label || "holiday"}`, slots: [] };
  }
  const hours = (settings.workingHours as WorkingHours | null) ?? {};
  const cfg = hours[DAY_KEYS[when.getDay()]];
  if (!cfg || cfg.closed) {
    return { closed: true, reason: "Closed on this day", slots: [] };
  }
  const openMin = parseHHMM(cfg.open);
  const closeMin = parseHHMM(cfg.close);
  if (openMin == null || closeMin == null || closeMin <= openMin) {
    return { closed: true, reason: "Working hours not configured", slots: [] };
  }
  const slots: string[] = [];
  for (let t = openMin; t < closeMin; t += stepMin) {
    const hh = String(Math.floor(t / 60)).padStart(2, "0");
    const mm = String(t % 60).padStart(2, "0");
    slots.push(`${hh}:${mm}`);
  }
  return { closed: false, slots, openMin, closeMin };
}

export async function validateAppointmentSlot(when: Date): Promise<string | null> {
  const settings = await getHospitalSettings();
  const holidays = (settings.holidays as Holiday[] | null) ?? [];
  const dateStr = ymd(when);
  const holiday = holidays.find((h) => h.date === dateStr);
  if (holiday) {
    return `Hospital is closed on ${dateStr} (${holiday.label}). Pick another date.`;
  }
  const hours = (settings.workingHours as WorkingHours | null) ?? {};
  const dayKey = DAY_KEYS[when.getDay()];
  const cfg = hours[dayKey];
  if (!cfg || cfg.closed) {
    return `Hospital is closed on ${dayKey.toUpperCase()}. Pick a working day.`;
  }
  const openMin = parseHHMM(cfg.open);
  const closeMin = parseHHMM(cfg.close);
  if (openMin == null || closeMin == null || closeMin <= openMin) {
    // Misconfigured day — fall open rather than blocking bookings.
    return null;
  }
  const slotMin = when.getHours() * 60 + when.getMinutes();
  if (slotMin < openMin || slotMin >= closeMin) {
    const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    return `Slot is outside working hours (${fmt(openMin)}–${fmt(closeMin)} on ${dayKey.toUpperCase()}).`;
  }
  return null;
}

// Public subset returned to any authenticated caller — used by the web shell
// to render branding and by booking UIs to surface working hours / holidays.
// Excludes legalName, PAN, invoice/receipt prefixes, and other admin-only
// configuration that doesn't need to leak to non-admin staff.
export function shapePublic(r: HospitalSettingsRow) {
  return {
    name: r.name,
    logoUrl: r.logoUrl,
    primaryColor: r.primaryColor,
    address: r.address,
    city: r.city,
    state: r.state,
    pincode: r.pincode,
    phone: r.phone,
    email: r.email,
    gstin: r.gstin,
    workingHours: (r.workingHours as Record<string, unknown> | null) ?? {},
    holidays: (r.holidays as Array<{ date: string; label: string }> | null) ?? [],
  };
}
