import { Router, type IRouter } from "express";
import {
  db,
  billsTable,
  encountersTable,
  admissionsTable,
  staffTable,
} from "@workspace/db";
import { and, gte, lte, sql, desc, eq, ne, isNotNull } from "drizzle-orm";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();

function parseRange(req: Parameters<typeof router.get>[1] extends never ? never : never, qFrom?: unknown, qTo?: unknown): { from: Date; to: Date } {
  // Defaults: last 30 days inclusive.
  const now = new Date();
  const defaultTo = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const defaultFrom = new Date(defaultTo);
  defaultFrom.setDate(defaultFrom.getDate() - 29);
  defaultFrom.setHours(0, 0, 0, 0);
  let from = defaultFrom;
  let to = defaultTo;
  if (typeof qFrom === "string" && qFrom) {
    const d = new Date(qFrom);
    if (!isNaN(d.getTime())) { d.setHours(0, 0, 0, 0); from = d; }
  }
  if (typeof qTo === "string" && qTo) {
    const d = new Date(qTo);
    if (!isNaN(d.getTime())) { d.setHours(23, 59, 59, 999); to = d; }
  }
  if (from > to) [from, to] = [to, from];
  // Hard-cap the window to 92 days to prevent unbounded fanout in the
  // per-day occupancy subquery and to keep CSV exports usable.
  const MAX_DAYS = 92;
  const spanDays = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
  if (spanDays > MAX_DAYS) {
    from = new Date(to);
    from.setDate(from.getDate() - (MAX_DAYS - 1));
    from.setHours(0, 0, 0, 0);
  }
  return { from, to };
}

router.get("/admin/reports/overview", requireRole("admin", "accountant"), async (req, res) => {
  const { from, to } = parseRange(undefined as never, req.query.from, req.query.to);

  // OPD volume — outpatient encounters per day.
  const opdRows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${encountersTable.startedAt}), 'YYYY-MM-DD')`,
      cnt: sql<number>`count(*)::int`,
    })
    .from(encountersTable)
    .where(and(
      eq(encountersTable.type, "OPD"),
      gte(encountersTable.startedAt, from),
      lte(encountersTable.startedAt, to),
    ))
    .groupBy(sql`date_trunc('day', ${encountersTable.startedAt})`)
    .orderBy(sql`date_trunc('day', ${encountersTable.startedAt})`);

  // IPD census — admitted/discharged per day + occupied snapshot + avg LOS.
  const admittedRows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${admissionsTable.admittedAt}), 'YYYY-MM-DD')`,
      cnt: sql<number>`count(*)::int`,
    })
    .from(admissionsTable)
    .where(and(
      gte(admissionsTable.admittedAt, from),
      lte(admissionsTable.admittedAt, to),
    ))
    .groupBy(sql`date_trunc('day', ${admissionsTable.admittedAt})`);

  const dischargedRows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${admissionsTable.dischargedAt}), 'YYYY-MM-DD')`,
      cnt: sql<number>`count(*)::int`,
      losAvg: sql<number>`coalesce(avg(extract(epoch from (${admissionsTable.dischargedAt} - ${admissionsTable.admittedAt}))/86400.0), 0)::float`,
    })
    .from(admissionsTable)
    .where(and(
      isNotNull(admissionsTable.dischargedAt),
      gte(admissionsTable.dischargedAt, from),
      lte(admissionsTable.dischargedAt, to),
    ))
    .groupBy(sql`date_trunc('day', ${admissionsTable.dischargedAt})`);

  // For each day in range compute occupied = admissions admitted on/before that day
  // AND (discharged is null OR discharged > day end). Heavy query; we approximate
  // by running one COUNT per day via lateral. For the (≤92 day default range)
  // this stays cheap enough.
  const days: string[] = [];
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }
  const occupiedByDay = new Map<string, number>();
  if (days.length > 0) {
    const occRows = await db.execute<{ day: string; cnt: number }>(sql`
      WITH d AS (SELECT unnest(${sql.raw(`ARRAY[${days.map((x) => `'${x}'::date`).join(",")}]`)}) AS day)
      SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
             (SELECT count(*)::int FROM admissions a
                WHERE a.admitted_at::date <= d.day
                  AND (a.discharged_at IS NULL OR a.discharged_at::date > d.day)) AS cnt
      FROM d ORDER BY d.day
    `);
    for (const r of occRows.rows) occupiedByDay.set(r.day, Number(r.cnt));
  }
  const admittedByDay = new Map(admittedRows.map((r) => [r.day, Number(r.cnt)]));
  const dischargedByDay = new Map(dischargedRows.map((r) => [r.day, { cnt: Number(r.cnt), avgLos: Number(r.losAvg) }]));
  const ipdCensus = days.map((day) => ({
    date: day,
    admitted: admittedByDay.get(day) ?? 0,
    discharged: dischargedByDay.get(day)?.cnt ?? 0,
    occupied: occupiedByDay.get(day) ?? 0,
    avgLos: Number((dischargedByDay.get(day)?.avgLos ?? 0).toFixed(2)),
  }));

  // Revenue & GST — bills created in window (excludes voided).
  const revenueRows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${billsTable.createdAt}), 'YYYY-MM-DD')`,
      subtotal: sql<string>`coalesce(sum(${billsTable.subtotal}), 0)`,
      discount: sql<string>`coalesce(sum(${billsTable.discount}), 0)`,
      tax: sql<string>`coalesce(sum(${billsTable.cgst} + ${billsTable.sgst} + ${billsTable.igst}), 0)`,
      total: sql<string>`coalesce(sum(${billsTable.total}), 0)`,
      collected: sql<string>`coalesce(sum(${billsTable.paidAmount} - ${billsTable.refundedAmount}), 0)`,
    })
    .from(billsTable)
    .where(and(
      ne(billsTable.status, "void"),
      gte(billsTable.createdAt, from),
      lte(billsTable.createdAt, to),
    ))
    .groupBy(sql`date_trunc('day', ${billsTable.createdAt})`)
    .orderBy(sql`date_trunc('day', ${billsTable.createdAt})`);

  const revenueByDay = revenueRows.map((r) => ({
    date: r.day,
    gross: Number(r.subtotal),
    discount: Number(r.discount),
    tax: Number(r.tax),
    net: Number(r.total),
    collected: Number(r.collected),
  }));

  // Top doctors by encounters + revenue (revenue = sum of bills where doctorId matches).
  const topDoctorsRows = await db
    .select({
      doctorId: encountersTable.doctorId,
      name: staffTable.name,
      encounters: sql<number>`count(*)::int`,
    })
    .from(encountersTable)
    .innerJoin(staffTable, eq(staffTable.id, encountersTable.doctorId))
    .where(and(
      gte(encountersTable.startedAt, from),
      lte(encountersTable.startedAt, to),
    ))
    .groupBy(encountersTable.doctorId, staffTable.name)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  const docRevenueRows = await db
    .select({
      doctorId: billsTable.doctorId,
      revenue: sql<string>`coalesce(sum(${billsTable.total}), 0)`,
    })
    .from(billsTable)
    .where(and(
      ne(billsTable.status, "void"),
      isNotNull(billsTable.doctorId),
      gte(billsTable.createdAt, from),
      lte(billsTable.createdAt, to),
    ))
    .groupBy(billsTable.doctorId);
  const revByDoc = new Map(docRevenueRows.map((r) => [r.doctorId, Number(r.revenue)]));
  const topDoctors = topDoctorsRows.map((r) => ({
    doctorId: r.doctorId,
    name: r.name,
    encounters: r.encounters,
    revenue: Number(revByDoc.get(r.doctorId) ?? 0),
  }));

  // Top services — unwind items jsonb and aggregate by item.name.
  const topServicesRows = await db.execute<{ name: string; count: number; revenue: string }>(sql`
    SELECT (item->>'name') AS name,
           count(*)::int AS count,
           coalesce(sum( (item->>'amount')::numeric ), 0) AS revenue
    FROM bills b, jsonb_array_elements(b.items) AS item
    WHERE b.status <> 'void'
      AND b.created_at >= ${from}
      AND b.created_at <= ${to}
      AND (item ? 'name')
    GROUP BY (item->>'name')
    ORDER BY count DESC
    LIMIT 10
  `);
  const topServices = topServicesRows.rows.map((r) => ({
    name: r.name ?? "Unknown",
    count: Number(r.count),
    revenue: Number(r.revenue ?? 0),
  }));

  // GST summary
  const [gstAgg] = await db
    .select({
      taxableValue: sql<string>`coalesce(sum(${billsTable.subtotal} - ${billsTable.discount}), 0)`,
      cgst: sql<string>`coalesce(sum(${billsTable.cgst}), 0)`,
      sgst: sql<string>`coalesce(sum(${billsTable.sgst}), 0)`,
      igst: sql<string>`coalesce(sum(${billsTable.igst}), 0)`,
    })
    .from(billsTable)
    .where(and(
      ne(billsTable.status, "void"),
      gte(billsTable.createdAt, from),
      lte(billsTable.createdAt, to),
    ));
  const gstSummary = {
    taxableValue: Number(gstAgg?.taxableValue ?? 0),
    cgst: Number(gstAgg?.cgst ?? 0),
    sgst: Number(gstAgg?.sgst ?? 0),
    igst: Number(gstAgg?.igst ?? 0),
    totalTax: Number(gstAgg?.cgst ?? 0) + Number(gstAgg?.sgst ?? 0) + Number(gstAgg?.igst ?? 0),
  };

  const opdVolume = opdRows.map((r) => ({ date: r.day, count: Number(r.cnt) }));

  res.json({ opdVolume, ipdCensus, revenueByDay, topDoctors, topServices, gstSummary });
});

export default router;
