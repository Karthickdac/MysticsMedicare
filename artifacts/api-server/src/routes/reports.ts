import { Router, type IRouter } from "express";
import { db, billsTable, billPaymentsTable, patientsTable } from "@workspace/db";
import { and, eq, gte, lte, sql, ne, desc } from "drizzle-orm";
import { num, requiredIso } from "../lib/format";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();

function parseDateRange(req: { query: Record<string, unknown> }) {
  const today = new Date(); today.setHours(23, 59, 59, 999);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const from = req.query["from"] ? new Date(String(req.query["from"])) : monthStart;
  const to = req.query["to"] ? new Date(String(req.query["to"])) : today;
  return { from, to };
}

router.get("/reports/collections", requireRole("admin", "accountant", "receptionist"), async (req, res) => {
  const { from, to } = parseDateRange(req);
  const rows = await db
    .select({
      day: sql<string>`to_char(${billPaymentsTable.receivedAt}, 'YYYY-MM-DD')`,
      mode: billPaymentsTable.mode,
      amount: sql<string>`coalesce(sum(${billPaymentsTable.amount}),0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(billPaymentsTable)
    .where(and(gte(billPaymentsTable.receivedAt, from), lte(billPaymentsTable.receivedAt, to)))
    .groupBy(sql`to_char(${billPaymentsTable.receivedAt}, 'YYYY-MM-DD')`, billPaymentsTable.mode)
    .orderBy(sql`to_char(${billPaymentsTable.receivedAt}, 'YYYY-MM-DD') DESC`);
  res.json(rows.map((r) => ({ date: r.day, mode: r.mode, amount: num(r.amount), count: r.count })));
});

router.get("/reports/gstr1", requireRole("admin", "accountant"), async (req, res) => {
  const { from, to } = parseDateRange(req);
  const rows = await db
    .select({ b: billsTable, pt: patientsTable })
    .from(billsTable)
    .innerJoin(patientsTable, eq(billsTable.patientId, patientsTable.id))
    .where(and(gte(billsTable.createdAt, from), lte(billsTable.createdAt, to), ne(billsTable.status, "void")))
    .orderBy(desc(billsTable.createdAt))
    .limit(5000);
  res.json(rows.map(({ b, pt }) => ({
    billNumber: b.billNumber,
    date: requiredIso(b.createdAt).slice(0, 10),
    patientName: pt.name,
    subtotal: num(b.subtotal),
    discount: num(b.discount),
    cgst: num(b.cgst),
    sgst: num(b.sgst),
    igst: num(b.igst),
    total: num(b.total),
    gstMode: b.gstMode,
  })));
});

router.get("/reports/outstanding", requireRole("admin", "accountant", "receptionist"), async (_req, res) => {
  const rows = await db
    .select({ b: billsTable, pt: patientsTable })
    .from(billsTable)
    .innerJoin(patientsTable, eq(billsTable.patientId, patientsTable.id))
    .where(and(ne(billsTable.status, "paid"), ne(billsTable.status, "void"), ne(billsTable.status, "refunded")))
    .orderBy(desc(billsTable.createdAt))
    .limit(2000);
  const now = Date.now();
  res.json(rows.map(({ b, pt }) => {
    const total = num(b.total);
    const paid = num(b.paidAmount);
    const refunded = num(b.refundedAmount);
    const balance = Math.round((total - paid + refunded) * 100) / 100;
    const ageDays = Math.floor((now - new Date(b.createdAt).getTime()) / 86_400_000);
    return {
      billNumber: b.billNumber,
      date: requiredIso(b.createdAt).slice(0, 10),
      patientName: pt.name,
      total,
      paidAmount: paid,
      balance,
      ageDays,
      status: b.status,
    };
  }).filter((r) => r.balance > 0));
});

export default router;
