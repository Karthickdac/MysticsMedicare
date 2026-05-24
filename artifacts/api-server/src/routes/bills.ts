import { Router, type IRouter } from "express";
import { db, billsTable, patientsTable } from "@workspace/db";
import { desc, eq, and, sql } from "drizzle-orm";
import { CreateBillBody } from "@workspace/api-zod";
import { isoDate, num, requiredIso } from "../lib/format";
import { sendNotification } from "../lib/notifications";

const router: IRouter = Router();

interface BillItem { description: string; quantity: number; unitPrice: number; amount: number }

function shape(b: typeof billsTable.$inferSelect, pt: typeof patientsTable.$inferSelect) {
  return {
    id: b.id,
    patientId: b.patientId,
    patientName: pt.name,
    billNumber: b.billNumber,
    subtotal: num(b.subtotal),
    cgst: num(b.cgst),
    sgst: num(b.sgst),
    igst: num(b.igst),
    total: num(b.total),
    status: b.status,
    paymentMethod: b.paymentMethod,
    insuranceProvider: b.insuranceProvider,
    items: (b.items as BillItem[]) ?? [],
    createdAt: requiredIso(b.createdAt),
    paidAt: isoDate(b.paidAt),
  };
}

router.get("/bills", async (req, res) => {
  const conds = [] as ReturnType<typeof eq>[];
  if (req.query.patientId) conds.push(eq(billsTable.patientId, Number(req.query.patientId)));
  if (req.query.status) conds.push(eq(billsTable.status, String(req.query.status)));
  const rows = await db
    .select({ b: billsTable, pt: patientsTable })
    .from(billsTable)
    .innerJoin(patientsTable, eq(billsTable.patientId, patientsTable.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(billsTable.createdAt))
    .limit(500);
  res.json(rows.map((r) => shape(r.b, r.pt)));
});

import { requireRole } from "../lib/auth";
router.post("/bills", requireRole("admin", "accountant", "receptionist"), async (req, res) => {
  const parsed = CreateBillBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const items = (parsed.data.items as BillItem[]).map((it) => ({
    ...it,
    amount: Number((it.quantity * it.unitPrice).toFixed(2)),
  }));
  const subtotal = items.reduce((s, it) => s + it.amount, 0);
  const intraState = (parsed.data.gstMode ?? "intra") === "intra";
  const cgst = intraState ? subtotal * 0.09 : 0;
  const sgst = intraState ? subtotal * 0.09 : 0;
  const igst = intraState ? 0 : subtotal * 0.18;
  const total = subtotal + cgst + sgst + igst;
  const [{ next }] = (
    await db.execute<{ next: string }>(
      sql`SELECT 'INV' || to_char(now(), 'YYYYMMDD') || lpad((coalesce(max(id),0)+1)::text, 4, '0') AS next FROM bills`,
    )
  ).rows;
  const [row] = await db
    .insert(billsTable)
    .values({
      patientId: parsed.data.patientId,
      billNumber: next,
      subtotal: subtotal.toFixed(2),
      cgst: cgst.toFixed(2),
      sgst: sgst.toFixed(2),
      igst: igst.toFixed(2),
      total: total.toFixed(2),
      insuranceProvider: parsed.data.insuranceProvider,
      items: items,
    })
    .returning();
  const [pt] = await db.select().from(patientsTable).where(eq(patientsTable.id, row.patientId));
  await sendNotification({
    eventKey: "bill_generated",
    channel: "both",
    patientId: row.patientId,
    variables: { billNumber: row.billNumber, total: total.toFixed(2) },
  });
  res.status(201).json(shape(row, pt!));
});

router.get("/bills/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [r] = await db
    .select({ b: billsTable, pt: patientsTable })
    .from(billsTable)
    .innerJoin(patientsTable, eq(billsTable.patientId, patientsTable.id))
    .where(eq(billsTable.id, id))
    .limit(1);
  if (!r) return res.status(404).json({ error: "Not found" });
  res.json(shape(r.b, r.pt));
});

router.post("/bills/:id/pay", requireRole("admin", "accountant", "receptionist"), async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db
    .update(billsTable)
    .set({ status: "paid", paidAt: new Date(), paymentMethod: req.body?.paymentMethod ?? "cash" })
    .where(eq(billsTable.id, id))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  const [pt] = await db.select().from(patientsTable).where(eq(patientsTable.id, row.patientId));
  await sendNotification({
    eventKey: "bill_paid",
    channel: "both",
    patientId: row.patientId,
    variables: { billNumber: row.billNumber, total: row.total },
  });
  res.json(shape(row, pt!));
});

export default router;
