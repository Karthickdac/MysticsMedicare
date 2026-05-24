import { Router, type IRouter } from "express";
import { db, cashierSessionsTable, billPaymentsTable, billRefundsTable } from "@workspace/db";
import { and, desc, eq, gte, lte, sql, inArray } from "drizzle-orm";
import { OpenCashierSessionBody, CloseCashierSessionBody } from "@workspace/api-zod";
import { isoDate, num, requiredIso } from "../lib/format";
import { requirePermission } from "../lib/auth";

const router: IRouter = Router();

interface CollectionByMode { mode: string; amount: number; count: number }

async function shape(s: typeof cashierSessionsTable.$inferSelect) {
  const range = [s.openedAt, s.closedAt ?? new Date()] as const;
  const rows = await db
    .select({
      mode: billPaymentsTable.mode,
      amount: sql<string>`coalesce(sum(${billPaymentsTable.amount}),0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(billPaymentsTable)
    .where(
      and(
        eq(billPaymentsTable.cashierSessionId, s.id),
        gte(billPaymentsTable.receivedAt, range[0]),
        lte(billPaymentsTable.receivedAt, range[1]),
      ),
    )
    .groupBy(billPaymentsTable.mode);
  const collectionsByMode: CollectionByMode[] = rows.map((r) => ({
    mode: r.mode, amount: num(r.amount), count: r.count,
  }));
  // refunds attributable to payments collected in this session
  const sessionPaymentIds = (
    await db.select({ id: billPaymentsTable.id }).from(billPaymentsTable).where(eq(billPaymentsTable.cashierSessionId, s.id))
  ).map((r) => r.id);
  let refundsTotal = 0;
  if (sessionPaymentIds.length > 0) {
    // Only cash refunds reduce the drawer's expected cash; card/UPI/insurance
    // refunds settle through other channels and must not affect cash variance.
    const [{ t }] = (
      await db.execute<{ t: string }>(
        sql`SELECT coalesce(sum(amount),0)::text AS t FROM bill_refunds WHERE mode = 'cash' AND payment_id IN ${sql.raw(`(${sessionPaymentIds.join(",")})`)}`,
      )
    ).rows;
    refundsTotal = num(t);
  }
  return {
    id: s.id,
    cashierUserId: s.cashierUserId,
    cashierName: s.cashierName,
    openingCash: num(s.openingCash),
    closingCash: s.closingCash == null ? null : num(s.closingCash),
    expectedCash: s.expectedCash == null ? null : num(s.expectedCash),
    variance: s.variance == null ? null : num(s.variance),
    status: s.status,
    notes: s.notes,
    openedAt: requiredIso(s.openedAt),
    closedAt: isoDate(s.closedAt),
    collectionsByMode,
    refundsTotal,
  };
}

router.get("/cashier/sessions", requirePermission("billing.collect", "billing.read"), async (req, res) => {
  const conds = [] as ReturnType<typeof eq>[];
  if (req.query.status) conds.push(eq(cashierSessionsTable.status, String(req.query.status)));
  const rows = await db
    .select()
    .from(cashierSessionsTable)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(cashierSessionsTable.openedAt))
    .limit(100);
  const out = await Promise.all(rows.map(shape));
  res.json(out);
});

router.get("/cashier/sessions/:id", requirePermission("billing.collect", "billing.read"), async (req, res) => {
  const id = Number(req.params.id);
  const [s] = await db.select().from(cashierSessionsTable).where(eq(cashierSessionsTable.id, id));
  if (!s) return res.status(404).json({ error: "Not found" });
  res.json(await shape(s));
});

router.post("/cashier/sessions", requirePermission("billing.collect"), async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Login required" });
  const parsed = OpenCashierSessionBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [existing] = await db
    .select()
    .from(cashierSessionsTable)
    .where(and(eq(cashierSessionsTable.cashierUserId, req.user.id), eq(cashierSessionsTable.status, "open")))
    .limit(1);
  if (existing) return res.status(409).json({ error: "An open session already exists" });
  try {
    const [row] = await db
      .insert(cashierSessionsTable)
      .values({
        cashierUserId: req.user.id,
        cashierName: req.user.name,
        openingCash: Number(parsed.data.openingCash).toFixed(2),
        notes: parsed.data.notes,
      })
      .returning();
    res.status(201).json(await shape(row));
  } catch (e) {
    // Partial-unique index `cashier_sessions_one_open_per_user` enforces the
    // single-open-drawer invariant at the DB layer; a concurrent open request
    // that loses the race surfaces here as a unique-violation.
    const code = (e as { code?: string }).code;
    if (code === "23505") return res.status(409).json({ error: "An open session already exists" });
    throw e;
  }
});

router.post("/cashier/sessions/:id/close", requirePermission("billing.collect"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = CloseCashierSessionBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  if (!req.user) return res.status(401).json({ error: "Login required" });

  // Whole close happens in one transaction:
  //   1. Lock the session row (FOR UPDATE) and re-verify it is still open.
  //      This blocks concurrent payments (which also FOR UPDATE the open
  //      session) from inserting after we have computed expected cash.
  //   2. Compute cashIn/cashOut from rows already committed.
  //   3. UPDATE ... WHERE id=? AND status='open' so two concurrent closes
  //      cannot both write closing figures.
  try {
    const closed = await db.transaction(async (tx) => {
      const sRows = await tx.execute<typeof cashierSessionsTable.$inferSelect>(
        sql`SELECT * FROM cashier_sessions WHERE id = ${id} FOR UPDATE`,
      );
      const s = sRows.rows[0];
      if (!s) throw new HttpError(404, "Not found");
      if (s.status !== "open") throw new HttpError(409, "Session already closed");
      const isOverseer = req.user!.role === "admin" || req.user!.role === "accountant";
      if (!isOverseer && s.cashierUserId !== req.user!.id) {
        throw new HttpError(403, "Only the session owner can close this drawer");
      }
      const [cashIn] = await tx
        .select({ sum: sql<string>`coalesce(sum(${billPaymentsTable.amount}),0)` })
        .from(billPaymentsTable)
        .where(and(eq(billPaymentsTable.cashierSessionId, id), eq(billPaymentsTable.mode, "cash")));
      const paymentIds = (
        await tx.select({ id: billPaymentsTable.id }).from(billPaymentsTable).where(eq(billPaymentsTable.cashierSessionId, id))
      ).map((r) => r.id);
      let cashOut = 0;
      if (paymentIds.length > 0) {
        const refunds = await tx
          .select({ amount: billRefundsTable.amount, mode: billRefundsTable.mode })
          .from(billRefundsTable)
          .where(inArray(billRefundsTable.paymentId, paymentIds));
        cashOut = refunds.filter((r) => r.mode === "cash").reduce((s2, r) => s2 + num(r.amount), 0);
      }
      const expected = num(s.openingCash) + num(cashIn.sum) - cashOut;
      const closing = Number(parsed.data.closingCash);
      const variance = Math.round((closing - expected) * 100) / 100;
      const updated = await tx
        .update(cashierSessionsTable)
        .set({
          status: "closed",
          closingCash: closing.toFixed(2),
          expectedCash: expected.toFixed(2),
          variance: variance.toFixed(2),
          notes: parsed.data.notes ?? s.notes,
          closedAt: new Date(),
        })
        .where(and(eq(cashierSessionsTable.id, id), eq(cashierSessionsTable.status, "open")))
        .returning();
      if (updated.length === 0) throw new HttpError(409, "Session already closed");
      return updated[0];
    });
    res.json(await shape(closed));
  } catch (e) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export default router;
