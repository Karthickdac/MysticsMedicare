import { db, rosterShiftsTable, staffTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";

// Minute-of-day intervals for each roster shift band. Mirrors the labels the
// admin roster UI exposes (Morning 08:00–16:00, Evening 16:00–24:00,
// Night 00:00–08:00). OnCall covers the full day.
const SHIFT_INTERVALS: Record<string, [number, number]> = {
  Morning: [8 * 60, 16 * 60],
  Evening: [16 * 60, 24 * 60],
  Night: [0, 8 * 60],
  OnCall: [0, 24 * 60],
};

export type DoctorAvailability = {
  /** True when the doctor cannot be booked at all on this date. */
  closed: boolean;
  /** Human-readable reason when closed (or null when bookable). */
  reason: string | null;
  /** Merged on-duty windows expressed as [startMin, endMin) of local day. */
  intervals: Array<[number, number]>;
  /** True when the doctor has no roster at all — caller should fall back to hospital hours. */
  unrostered: boolean;
};

function mergeIntervals(intervals: Array<[number, number]>): Array<[number, number]> {
  if (intervals.length === 0) return [];
  const sorted = intervals.slice().sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [[sorted[0]![0], sorted[0]![1]]];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i]!;
    const last = merged[merged.length - 1]!;
    if (cur[0] <= last[1]) last[1] = Math.max(last[1], cur[1]);
    else merged.push([cur[0], cur[1]]);
  }
  return merged;
}

function honorific(name: string | null | undefined): string {
  if (!name) return "The doctor";
  return /^dr\.?\s/i.test(name) ? name : `Dr. ${name}`;
}

/**
 * Look up a doctor's on-duty windows for a specific calendar date based on
 * their roster shifts. Booking flows use this to refuse / hide slots that
 * fall outside the roster.
 *
 * Fallback rule: a doctor with **no roster entries at all** is treated as
 * "unrostered" — the caller falls back to hospital hours so a freshly-added
 * doctor isn't accidentally unbookable. A doctor who has *some* roster
 * entries but none on the queried date is genuinely off-duty.
 */
export async function getDoctorAvailability(
  doctorId: number,
  dateStr: string,
): Promise<DoctorAvailability> {
  const [doc] = await db
    .select({ id: staffTable.id, name: staffTable.name })
    .from(staffTable)
    .where(eq(staffTable.id, doctorId));
  const docLabel = honorific(doc?.name);

  const shifts = await db
    .select({ shift: rosterShiftsTable.shift })
    .from(rosterShiftsTable)
    .where(
      and(eq(rosterShiftsTable.staffId, doctorId), eq(rosterShiftsTable.date, dateStr)),
    );

  if (shifts.some((s) => s.shift === "Leave")) {
    return { closed: true, reason: `${docLabel} is on leave that day.`, intervals: [], unrostered: false };
  }

  if (shifts.length === 0) {
    // Distinguish "doctor has no roster configured at all" from "doctor is off
    // duty on this specific date". The former falls back to hospital hours;
    // the latter is unavailable.
    const [anyShift] = await db
      .select({ id: rosterShiftsTable.id })
      .from(rosterShiftsTable)
      .where(eq(rosterShiftsTable.staffId, doctorId))
      .limit(1);
    if (!anyShift) {
      return { closed: false, reason: null, intervals: [[0, 24 * 60]], unrostered: true };
    }
    return { closed: true, reason: `${docLabel} is off duty that day.`, intervals: [], unrostered: false };
  }

  const intervals: Array<[number, number]> = [];
  for (const s of shifts) {
    const range = SHIFT_INTERVALS[s.shift];
    if (range) intervals.push([range[0], range[1]]);
  }
  // Unknown shift labels — treat as full-day available rather than blocking.
  if (intervals.length === 0) {
    return { closed: false, reason: null, intervals: [[0, 24 * 60]], unrostered: false };
  }
  return { closed: false, reason: null, intervals: mergeIntervals(intervals), unrostered: false };
}

export function minuteOfDayInInterval(
  intervals: Array<[number, number]>,
  minOfDay: number,
): boolean {
  return intervals.some(([s, e]) => minOfDay >= s && minOfDay < e);
}

/** Format a minute-of-day as HH:MM. */
function fmt(m: number): string {
  const h = Math.floor(m / 60);
  return `${String(h === 24 ? 0 : h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Build a human-readable summary of on-duty windows, e.g. "08:00–16:00, 18:00–22:00". */
export function describeIntervals(intervals: Array<[number, number]>): string {
  return intervals.map(([s, e]) => `${fmt(s)}–${fmt(e)}`).join(", ");
}

/**
 * Batched variant for listing screens (e.g. /portal/doctors?date=). Resolves
 * availability for many doctors in just two queries instead of ~3 per doctor.
 * `doctors` carries the names already so we don't re-fetch them.
 */
export async function getDoctorAvailabilityMap(
  doctors: Array<{ id: number; name: string | null }>,
  dateStr: string,
): Promise<Map<number, DoctorAvailability>> {
  const out = new Map<number, DoctorAvailability>();
  if (doctors.length === 0) return out;
  const ids = doctors.map((d) => d.id);

  // Shifts on the target date, grouped by staff id.
  const dateShifts = await db
    .select({ staffId: rosterShiftsTable.staffId, shift: rosterShiftsTable.shift })
    .from(rosterShiftsTable)
    .where(
      and(inArray(rosterShiftsTable.staffId, ids), eq(rosterShiftsTable.date, dateStr)),
    );
  const byDoctor = new Map<number, string[]>();
  for (const r of dateShifts) {
    const arr = byDoctor.get(r.staffId) ?? [];
    arr.push(r.shift);
    byDoctor.set(r.staffId, arr);
  }

  // Doctors who have *any* roster entry — used for the unrostered fallback.
  const anyRosterRows = await db
    .select({ staffId: rosterShiftsTable.staffId })
    .from(rosterShiftsTable)
    .where(inArray(rosterShiftsTable.staffId, ids));
  const hasAnyRoster = new Set(anyRosterRows.map((r) => r.staffId));

  for (const d of doctors) {
    const label = honorific(d.name);
    const shifts = byDoctor.get(d.id) ?? [];
    if (shifts.includes("Leave")) {
      out.set(d.id, { closed: true, reason: `${label} is on leave that day.`, intervals: [], unrostered: false });
      continue;
    }
    if (shifts.length === 0) {
      if (!hasAnyRoster.has(d.id)) {
        out.set(d.id, { closed: false, reason: null, intervals: [[0, 24 * 60]], unrostered: true });
      } else {
        out.set(d.id, { closed: true, reason: `${label} is off duty that day.`, intervals: [], unrostered: false });
      }
      continue;
    }
    const intervals: Array<[number, number]> = [];
    for (const s of shifts) {
      const range = SHIFT_INTERVALS[s];
      if (range) intervals.push([range[0], range[1]]);
    }
    if (intervals.length === 0) {
      out.set(d.id, { closed: false, reason: null, intervals: [[0, 24 * 60]], unrostered: false });
    } else {
      out.set(d.id, { closed: false, reason: null, intervals: mergeIntervals(intervals), unrostered: false });
    }
  }
  return out;
}
