import { Router, type IRouter } from "express";
import {
  db,
  billsTable,
  patientsTable,
  billPaymentsTable,
  billRefundsTable,
  cashierSessionsTable,
} from "@workspace/db";
import { desc, eq, and, sql } from "drizzle-orm";
import {
  CreateBillBody,
  RecordPaymentBody,
  RecordRefundBody,
  VoidBillBody,
  UpdateBillClaimBody,
} from "@workspace/api-zod";
import { isoDate, num, requiredIso } from "../lib/format";
import { sendNotification } from "../lib/notifications";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------
interface BillItem {
  serviceCode?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount?: number; // line-level absolute amount
  gstRate?: number;  // % e.g. 18, 12, 5, 0
  cgst?: number;
  sgst?: number;
  igst?: number;
  amount: number;    // taxable line total = qty*unitPrice - discount
}

function r2(n: number) { return Math.round(n * 100) / 100; }

function shape(b: typeof billsTable.$inferSelect, pt: typeof patientsTable.$inferSelect) {
  const total = num(b.total);
  const paid = num(b.paidAmount);
  const refunded = num(b.refundedAmount);
  return {
    id: b.id,
    patientId: b.patientId,
    patientName: pt.name,
    billNumber: b.billNumber,
    subtotal: num(b.subtotal),
    discount: num(b.discount),
    cgst: num(b.cgst),
    sgst: num(b.sgst),
    igst: num(b.igst),
    total,
    paidAmount: paid,
    refundedAmount: refunded,
    balance: r2(total - paid + refunded),
    status: b.status,
    gstMode: b.gstMode,
    paymentMethod: b.paymentMethod,
    insuranceProvider: b.insuranceProvider,
    tpa: b.tpa,
    policyNumber: b.policyNumber,
    preAuthCode: b.preAuthCode,
    claimStatus: b.claimStatus,
    claimAmount: num(b.claimAmount),
    notes: b.notes,
    voidedAt: isoDate(b.voidedAt),
    voidReason: b.voidReason,
    items: (b.items as BillItem[]) ?? [],
    createdAt: requiredIso(b.createdAt),
    paidAt: isoDate(b.paidAt),
  };
}

function shapePayment(p: typeof billPaymentsTable.$inferSelect) {
  return {
    id: p.id,
    billId: p.billId,
    receiptNumber: p.receiptNumber,
    amount: num(p.amount),
    mode: p.mode,
    reference: p.reference,
    receivedBy: p.receivedBy,
    cashierSessionId: p.cashierSessionId,
    notes: p.notes,
    receivedAt: requiredIso(p.receivedAt),
  };
}

function shapeRefund(r: typeof billRefundsTable.$inferSelect) {
  return {
    id: r.id,
    billId: r.billId,
    paymentId: r.paymentId,
    amount: num(r.amount),
    mode: r.mode,
    reason: r.reason,
    approvedBy: r.approvedBy,
    refundedAt: requiredIso(r.refundedAt),
  };
}

// Compute per-line GST + bill-level totals. Bill-level discount is
// proportionally distributed across taxable line amounts before GST.
function computeTotals(rawItems: BillItem[], billDiscount: number, gstMode: string) {
  const intra = gstMode !== "inter";
  const items: BillItem[] = rawItems.map((it) => {
    const qty = Number(it.quantity) || 0;
    const price = Number(it.unitPrice) || 0;
    const lineDisc = Number(it.discount) || 0;
    const amount = r2(qty * price - lineDisc);
    return { ...it, quantity: qty, unitPrice: price, discount: lineDisc, amount };
  });
  const grossSubtotal = items.reduce((s, it) => s + it.amount, 0);
  const safeDiscount = Math.min(Math.max(billDiscount, 0), grossSubtotal);
  const taxableSubtotal = r2(grossSubtotal - safeDiscount);
  const scale = grossSubtotal > 0 ? taxableSubtotal / grossSubtotal : 0;

  let cgstSum = 0, sgstSum = 0, igstSum = 0;
  for (const it of items) {
    const rate = (Number(it.gstRate ?? 18) || 0) / 100;
    const taxable = r2(it.amount * scale);
    if (intra) {
      const half = r2(taxable * rate / 2);
      it.cgst = half; it.sgst = half; it.igst = 0;
      cgstSum += half * 2 === taxable * rate ? half : half;
      sgstSum += half;
      cgstSum += 0;
      // simpler accumulator below
    } else {
      const ig = r2(taxable * rate);
      it.cgst = 0; it.sgst = 0; it.igst = ig;
    }
  }
  cgstSum = r2(items.reduce((s, it) => s + (it.cgst ?? 0), 0));
  sgstSum = r2(items.reduce((s, it) => s + (it.sgst ?? 0), 0));
  igstSum = r2(items.reduce((s, it) => s + (it.igst ?? 0), 0));

  const total = r2(taxableSubtotal + cgstSum + sgstSum + igstSum);
  return {
    items,
    subtotal: r2(grossSubtotal),
    discount: r2(safeDiscount),
    cgst: cgstSum,
    sgst: sgstSum,
    igst: igstSum,
    total,
  };
}

function recomputeStatus(total: number, paid: number, refunded: number, currentStatus: string): string {
  if (currentStatus === "void") return "void";
  const net = r2(paid - refunded);
  // Fully refunded (paid then all refunded) takes precedence over the unpaid bucket
  if (paid > 0 && refunded >= paid - 0.005) return "refunded";
  if (net <= 0) return "unpaid";
  if (net + 0.005 < total) return "partial";
  return "paid";
}

// ---------------------------------------------------------------------------
// Bills CRUD
// ---------------------------------------------------------------------------
router.get("/bills", requireRole("admin", "accountant", "receptionist", "cashier", "doctor"), async (req, res) => {
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

router.post("/bills", requireRole("admin", "accountant", "receptionist", "cashier"), async (req, res) => {
  const parsed = CreateBillBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const gstMode = parsed.data.gstMode ?? "intra";
  const billDiscount = Number(parsed.data.discount ?? 0);
  const totals = computeTotals(parsed.data.items as BillItem[], billDiscount, gstMode);

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
      subtotal: totals.subtotal.toFixed(2),
      discount: totals.discount.toFixed(2),
      cgst: totals.cgst.toFixed(2),
      sgst: totals.sgst.toFixed(2),
      igst: totals.igst.toFixed(2),
      total: totals.total.toFixed(2),
      gstMode,
      insuranceProvider: parsed.data.insuranceProvider,
      tpa: parsed.data.tpa,
      policyNumber: parsed.data.policyNumber,
      preAuthCode: parsed.data.preAuthCode,
      notes: parsed.data.notes,
      items: totals.items,
    })
    .returning();
  const [pt] = await db.select().from(patientsTable).where(eq(patientsTable.id, row.patientId));
  await sendNotification({
    eventKey: "bill_generated",
    channel: "both",
    patientId: row.patientId,
    variables: { billNumber: row.billNumber, total: totals.total.toFixed(2) },
  });
  res.status(201).json(shape(row, pt!));
});

router.get("/bills/:id", requireRole("admin", "accountant", "receptionist", "cashier", "doctor"), async (req, res) => {
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

router.get("/bills/:id/full", requireRole("admin", "accountant", "receptionist", "cashier", "doctor"), async (req, res) => {
  const id = Number(req.params.id);
  const [r] = await db
    .select({ b: billsTable, pt: patientsTable })
    .from(billsTable)
    .innerJoin(patientsTable, eq(billsTable.patientId, patientsTable.id))
    .where(eq(billsTable.id, id))
    .limit(1);
  if (!r) return res.status(404).json({ error: "Not found" });
  const payments = await db
    .select()
    .from(billPaymentsTable)
    .where(eq(billPaymentsTable.billId, id))
    .orderBy(desc(billPaymentsTable.receivedAt));
  const refunds = await db
    .select()
    .from(billRefundsTable)
    .where(eq(billRefundsTable.billId, id))
    .orderBy(desc(billRefundsTable.refundedAt));
  res.json({
    bill: shape(r.b, r.pt),
    payments: payments.map(shapePayment),
    refunds: refunds.map(shapeRefund),
  });
});

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
router.get("/bills/:id/payments", requireRole("admin", "accountant", "receptionist", "cashier", "doctor"), async (req, res) => {
  const id = Number(req.params.id);
  const rows = await db
    .select()
    .from(billPaymentsTable)
    .where(eq(billPaymentsTable.billId, id))
    .orderBy(desc(billPaymentsTable.receivedAt));
  res.json(rows.map(shapePayment));
});

router.post("/bills/:id/payments", requireRole("admin", "accountant", "receptionist", "cashier"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = RecordPaymentBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, id));
  if (!bill) return res.status(404).json({ error: "Bill not found" });
  if (bill.status === "void") return res.status(409).json({ error: "Bill is voided" });
  const total = num(bill.total);
  const alreadyPaid = num(bill.paidAmount);
  const refunded = num(bill.refundedAmount);
  const balance = r2(total - alreadyPaid + refunded);
  const amount = Number(parsed.data.amount);
  if (!(amount > 0)) return res.status(400).json({ error: "Amount must be positive" });
  if (amount > balance + 0.01) {
    return res.status(400).json({ error: `Amount exceeds outstanding balance ₹${balance.toFixed(2)}` });
  }

  // find user's open cashier session (cash payments only) for reconciliation
  let openSession: number | null = null;
  if (parsed.data.mode === "cash" && req.user) {
    const [s] = await db
      .select()
      .from(cashierSessionsTable)
      .where(and(eq(cashierSessionsTable.cashierUserId, req.user.id), eq(cashierSessionsTable.status, "open")))
      .limit(1);
    if (s) openSession = s.id;
  }

  const [{ next }] = (
    await db.execute<{ next: string }>(
      sql`SELECT 'RCP' || to_char(now(),'YYYYMMDD') || lpad((coalesce(max(id),0)+1)::text, 4, '0') AS next FROM bill_payments`,
    )
  ).rows;

  const [payment] = await db
    .insert(billPaymentsTable)
    .values({
      billId: id,
      receiptNumber: next,
      amount: amount.toFixed(2),
      mode: parsed.data.mode,
      reference: parsed.data.reference,
      receivedBy: req.user?.name ?? null,
      cashierSessionId: openSession,
      notes: parsed.data.notes,
    })
    .returning();

  const newPaid = r2(alreadyPaid + amount);
  const newStatus = recomputeStatus(total, newPaid, refunded, bill.status);
  await db
    .update(billsTable)
    .set({
      paidAmount: newPaid.toFixed(2),
      status: newStatus,
      paymentMethod: parsed.data.mode,
      paidAt: newStatus === "paid" ? new Date() : bill.paidAt,
    })
    .where(eq(billsTable.id, id));

  if (newStatus === "paid") {
    await sendNotification({
      eventKey: "bill_paid",
      channel: "both",
      patientId: bill.patientId,
      variables: { billNumber: bill.billNumber, total: total.toFixed(2) },
    });
  }
  res.status(201).json(shapePayment(payment));
});

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------
router.post("/bills/:id/refunds", requireRole("admin", "accountant", "cashier"), async (req, res) => {
  // Body parsed below; we also verify that any cited paymentId belongs to this same bill
  // before inserting the refund row — preventing cross-bill misattribution.
  const id = Number(req.params.id);
  const parsed = RecordRefundBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, id));
  if (!bill) return res.status(404).json({ error: "Bill not found" });
  const paid = num(bill.paidAmount);
  const refunded = num(bill.refundedAmount);
  const refundable = r2(paid - refunded);
  const amount = Number(parsed.data.amount);
  if (!(amount > 0)) return res.status(400).json({ error: "Amount must be positive" });
  if (amount > refundable + 0.01) {
    return res.status(400).json({ error: `Amount exceeds refundable balance ₹${refundable.toFixed(2)}` });
  }
  // If the caller cites a payment, verify it actually belongs to this bill so refunds
  // can never be mis-attributed across bills (would corrupt cashier reconciliation).
  if (parsed.data.paymentId != null) {
    const [linked] = await db
      .select({ billId: billPaymentsTable.billId })
      .from(billPaymentsTable)
      .where(eq(billPaymentsTable.id, parsed.data.paymentId));
    if (!linked || linked.billId !== id) {
      return res.status(400).json({ error: "Payment does not belong to this bill" });
    }
  }
  const [refund] = await db
    .insert(billRefundsTable)
    .values({
      billId: id,
      paymentId: parsed.data.paymentId ?? null,
      amount: amount.toFixed(2),
      mode: parsed.data.mode,
      reason: parsed.data.reason,
      approvedBy: req.user?.name ?? null,
    })
    .returning();
  const newRefunded = r2(refunded + amount);
  const newStatus = recomputeStatus(num(bill.total), paid, newRefunded, bill.status);
  await db
    .update(billsTable)
    .set({ refundedAmount: newRefunded.toFixed(2), status: newStatus })
    .where(eq(billsTable.id, id));
  res.status(201).json(shapeRefund(refund));
});

// ---------------------------------------------------------------------------
// Void (admin only)
// ---------------------------------------------------------------------------
router.post("/bills/:id/void", requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = VoidBillBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, id));
  if (!bill) return res.status(404).json({ error: "Bill not found" });
  if (num(bill.paidAmount) > num(bill.refundedAmount)) {
    return res.status(409).json({ error: "Refund remaining payments before voiding" });
  }
  const [updated] = await db
    .update(billsTable)
    .set({
      status: "void",
      voidedAt: new Date(),
      voidReason: parsed.data.reason,
      voidedBy: req.user?.name ?? null,
    })
    .where(eq(billsTable.id, id))
    .returning();
  const [pt] = await db.select().from(patientsTable).where(eq(patientsTable.id, updated.patientId));
  res.json(shape(updated, pt!));
});

// ---------------------------------------------------------------------------
// Insurance claim update
// ---------------------------------------------------------------------------
router.post("/bills/:id/claim", requireRole("admin", "accountant", "receptionist", "cashier"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = UpdateBillClaimBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const patch: Partial<typeof billsTable.$inferInsert> = {
    claimStatus: parsed.data.claimStatus,
  };
  if (parsed.data.claimAmount != null) patch.claimAmount = Number(parsed.data.claimAmount).toFixed(2);
  if (parsed.data.tpa != null) patch.tpa = parsed.data.tpa;
  if (parsed.data.policyNumber != null) patch.policyNumber = parsed.data.policyNumber;
  if (parsed.data.preAuthCode != null) patch.preAuthCode = parsed.data.preAuthCode;
  const [updated] = await db.update(billsTable).set(patch).where(eq(billsTable.id, id)).returning();
  if (!updated) return res.status(404).json({ error: "Bill not found" });
  const [pt] = await db.select().from(patientsTable).where(eq(patientsTable.id, updated.patientId));
  res.json(shape(updated, pt!));
});

// ---------------------------------------------------------------------------
// Back-compat: /pay marks the entire outstanding balance paid in cash.
// New code should use POST /bills/:id/payments instead.
// ---------------------------------------------------------------------------
router.post("/bills/:id/pay", requireRole("admin", "accountant", "receptionist", "cashier"), async (req, res) => {
  const id = Number(req.params.id);
  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, id));
  if (!bill) return res.status(404).json({ error: "Not found" });
  if (bill.status === "void") return res.status(409).json({ error: "Bill is voided" });
  const total = num(bill.total);
  const paid = num(bill.paidAmount);
  const refunded = num(bill.refundedAmount);
  const balance = r2(total - paid + refunded);
  if (balance > 0) {
    const mode = (req.body?.paymentMethod as string | undefined) ?? "cash";
    const [{ next }] = (
      await db.execute<{ next: string }>(
        sql`SELECT 'RCP' || to_char(now(),'YYYYMMDD') || lpad((coalesce(max(id),0)+1)::text, 4, '0') AS next FROM bill_payments`,
      )
    ).rows;
    await db.insert(billPaymentsTable).values({
      billId: id,
      receiptNumber: next,
      amount: balance.toFixed(2),
      mode,
      receivedBy: req.user?.name ?? null,
    });
    await db
      .update(billsTable)
      .set({
        status: "paid",
        paidAmount: r2(paid + balance).toFixed(2),
        paymentMethod: mode,
        paidAt: new Date(),
      })
      .where(eq(billsTable.id, id));
  }
  const [row] = await db.select().from(billsTable).where(eq(billsTable.id, id));
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
