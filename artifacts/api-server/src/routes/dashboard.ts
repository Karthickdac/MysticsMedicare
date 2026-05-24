import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  patientsTable,
  appointmentsTable,
  bedsTable,
  labOrdersTable,
  prescriptionsTable,
  billsTable,
  encountersTable,
} from "@workspace/db";
import { sql, eq, and, gte, desc } from "drizzle-orm";
import { num, requiredIso } from "../lib/format";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [[{ count: totalPatients }]] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(patientsTable),
  ]);
  const [{ count: todayAppointments }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(appointmentsTable)
    .where(gte(appointmentsTable.scheduledAt, startOfDay));
  const [{ count: occupiedBeds }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bedsTable)
    .where(eq(bedsTable.status, "occupied"));
  const [{ count: totalBeds }] = await db.select({ count: sql<number>`count(*)::int` }).from(bedsTable);
  const [{ count: pendingLabOrders }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(labOrdersTable)
    .where(eq(labOrdersTable.status, "pending"));
  const [{ count: pendingPrescriptions }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(prescriptionsTable)
    .where(eq(prescriptionsTable.status, "pending"));
  const [{ sum: revenueToday }] = await db
    .select({ sum: sql<string>`coalesce(sum(${billsTable.total}), 0)::text` })
    .from(billsTable)
    .where(and(eq(billsTable.status, "paid"), gte(billsTable.paidAt, startOfDay)));
  const [{ sum: revenueMonth }] = await db
    .select({ sum: sql<string>`coalesce(sum(${billsTable.total}), 0)::text` })
    .from(billsTable)
    .where(and(eq(billsTable.status, "paid"), gte(billsTable.paidAt, startOfMonth)));

  res.json({
    totalPatients,
    todayAppointments,
    occupiedBeds,
    totalBeds,
    pendingLabOrders,
    pendingPrescriptions,
    revenueToday: num(revenueToday),
    revenueMonth: num(revenueMonth),
    criticalAlerts: pendingLabOrders + pendingPrescriptions,
  });
});

router.get("/dashboard/activity", async (_req, res) => {
  const recentPatients = await db
    .select()
    .from(patientsTable)
    .orderBy(desc(patientsTable.createdAt))
    .limit(8);
  const recentEncounters = await db
    .select({ e: encountersTable, p: patientsTable })
    .from(encountersTable)
    .innerJoin(patientsTable, eq(encountersTable.patientId, patientsTable.id))
    .orderBy(desc(encountersTable.createdAt))
    .limit(8);
  const recentBills = await db
    .select({ b: billsTable, p: patientsTable })
    .from(billsTable)
    .innerJoin(patientsTable, eq(billsTable.patientId, patientsTable.id))
    .orderBy(desc(billsTable.createdAt))
    .limit(6);

  const items = [
    ...recentPatients.map((p) => ({
      id: p.id,
      type: "patient_registered",
      title: "New patient registered",
      description: `${p.name} (${p.uhid})`,
      patientName: p.name,
      createdAt: requiredIso(p.createdAt),
    })),
    ...recentEncounters.map((r) => ({
      id: r.e.id + 10000,
      type: `encounter_${r.e.type}`,
      title: `${r.e.type.toUpperCase()} encounter`,
      description: r.e.chiefComplaint ?? r.e.diagnosis ?? "Clinical encounter",
      patientName: r.p.name,
      createdAt: requiredIso(r.e.createdAt),
    })),
    ...recentBills.map((r) => ({
      id: r.b.id + 20000,
      type: "bill_created",
      title: `Bill ${r.b.billNumber}`,
      description: `Total ₹${r.b.total}`,
      patientName: r.p.name,
      createdAt: requiredIso(r.b.createdAt),
    })),
  ];
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json(items.slice(0, 20));
});

router.get("/dashboard/charts", async (_req, res) => {
  const last7Days: Array<{ label: string; value: number }> = [];
  const revenue7: Array<{ label: string; value: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - i);
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    const label = day.toLocaleDateString("en-GB", { weekday: "short" });
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(patientsTable)
      .where(and(gte(patientsTable.createdAt, day), sql`${patientsTable.createdAt} < ${next}`));
    const [{ sum }] = await db
      .select({ sum: sql<string>`coalesce(sum(${billsTable.total}), 0)::text` })
      .from(billsTable)
      .where(and(gte(billsTable.createdAt, day), sql`${billsTable.createdAt} < ${next}`));
    last7Days.push({ label, value: count });
    revenue7.push({ label, value: num(sum) });
  }

  const deptRows = await db
    .select({ name: appointmentsTable.department, value: sql<number>`count(*)::int` })
    .from(appointmentsTable)
    .groupBy(appointmentsTable.department);
  const bedRows = await db
    .select({ name: bedsTable.status, value: sql<number>`count(*)::int` })
    .from(bedsTable)
    .groupBy(bedsTable.status);

  res.json({
    patientTrend: last7Days,
    revenueTrend: revenue7,
    departmentBreakdown: deptRows,
    bedOccupancy: bedRows,
  });
});

export default router;
