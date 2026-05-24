import { and, eq, gte, lt, ne } from "drizzle-orm";
import { appointmentsTable, db } from "@workspace/db";

export const SLOT_MINUTES = 15;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Shared slot-conflict check used by BOTH the staff and patient-portal booking
// routes so the same `[lo, hi)` half-open window and status-exclusion policy
// applies regardless of caller. Cancelled and no_show appointments are ignored
// so freeing a slot makes it bookable again. `ignoreId` lets reschedules exempt
// the appointment currently being moved.
export async function hasSlotConflict(
  tx: Tx,
  doctorId: number,
  scheduledAt: Date,
  ignoreId?: number,
): Promise<boolean> {
  const lo = new Date(scheduledAt.getTime() - SLOT_MINUTES * 60_000);
  const hi = new Date(scheduledAt.getTime() + SLOT_MINUTES * 60_000);
  const conds = [
    eq(appointmentsTable.doctorId, doctorId),
    gte(appointmentsTable.scheduledAt, lo),
    lt(appointmentsTable.scheduledAt, hi),
    ne(appointmentsTable.status, "cancelled"),
    ne(appointmentsTable.status, "no_show"),
  ];
  if (ignoreId) conds.push(ne(appointmentsTable.id, ignoreId));
  const rows = await tx
    .select({ id: appointmentsTable.id })
    .from(appointmentsTable)
    .where(and(...conds))
    .limit(1);
  return rows.length > 0;
}
