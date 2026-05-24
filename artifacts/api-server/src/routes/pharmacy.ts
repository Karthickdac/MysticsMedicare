import { Router, type IRouter } from "express";
import {
  db,
  drugsTable,
  prescriptionsTable,
  patientsTable,
  billsTable,
  pharmacySuppliersTable,
  pharmacyBatchesTable,
  pharmacyPurchaseOrdersTable,
  pharmacyPurchaseOrderItemsTable,
  pharmacyGrnsTable,
  pharmacyGrnItemsTable,
  pharmacySalesTable,
  pharmacySaleItemsTable,
  pharmacyReturnsTable,
  pharmacyReturnItemsTable,
} from "@workspace/db";
import { desc, asc, eq, and, sql, gt, lte, gte, sum, inArray } from "drizzle-orm";
import {
  CreatePharmacySaleBody,
  CreateSupplierBody,
  CreatePurchaseOrderBody,
  CreateGrnBody,
  ReturnPharmacySaleBody,
} from "@workspace/api-zod";
import { dateOnly, isoDate, num, requiredIso } from "../lib/format";
import { sendNotification } from "../lib/notifications";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();

// Small typed throw for transaction-scoped early returns (mirrors bills.ts).
class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
function r2(n: number) { return Math.round(n * 100) / 100; }

// ---------------------------------------------------------------------------
// Shapers
// ---------------------------------------------------------------------------
function shapeSupplier(s: typeof pharmacySuppliersTable.$inferSelect) {
  return {
    id: s.id, name: s.name, gstin: s.gstin, contactPerson: s.contactPerson,
    phone: s.phone, email: s.email, address: s.address,
    createdAt: requiredIso(s.createdAt),
  };
}

function shapeBatch(b: typeof pharmacyBatchesTable.$inferSelect, drugName: string) {
  const exp = new Date(b.expiry);
  const days = Math.floor((exp.getTime() - Date.now()) / 86400000);
  return {
    id: b.id, drugId: b.drugId, drugName,
    batchNo: b.batchNo,
    expiry: dateOnly(b.expiry)!,
    qtyOnHand: b.qtyOnHand,
    costPerUnit: num(b.costPerUnit),
    mrp: num(b.mrp),
    location: b.location,
    daysToExpiry: days,
    receivedAt: requiredIso(b.receivedAt),
  };
}

function shapePo(
  po: typeof pharmacyPurchaseOrdersTable.$inferSelect,
  supplierName: string,
  items: Array<{ id: number; drugId: number; drugName: string; qty: number; costPerUnit: number }>,
) {
  return {
    id: po.id, poNumber: po.poNumber,
    supplierId: po.supplierId, supplierName,
    status: po.status, notes: po.notes,
    expectedAmount: num(po.expectedAmount),
    createdBy: po.createdBy,
    createdAt: requiredIso(po.createdAt),
    placedAt: isoDate(po.placedAt),
    items,
  };
}

function shapeGrn(
  g: typeof pharmacyGrnsTable.$inferSelect,
  supplierName: string,
  items: Array<{ id: number; drugId: number; drugName: string; batchId: number | null; batchNo: string; expiry: string; qty: number; costPerUnit: number; mrp: number }>,
) {
  return {
    id: g.id, grnNumber: g.grnNumber,
    supplierId: g.supplierId, supplierName, poId: g.poId,
    invoiceNumber: g.invoiceNumber, invoiceDate: dateOnly(g.invoiceDate),
    landedCost: num(g.landedCost),
    notes: g.notes, receivedBy: g.receivedBy,
    receivedAt: requiredIso(g.receivedAt),
    items,
  };
}

interface SaleItemRow { id: number; drugId: number; drugName: string; batchId: number; batchNo: string; qty: number; qtyReturned: number; unitPrice: number; discount: number; gstRate: number; amount: number; }
function shapeSale(
  s: typeof pharmacySalesTable.$inferSelect,
  patientName: string | null,
  billNumber: string | null,
  items: SaleItemRow[],
) {
  return {
    id: s.id, saleNumber: s.saleNumber, kind: s.kind,
    patientId: s.patientId, patientName,
    prescriptionId: s.prescriptionId,
    billId: s.billId, billNumber,
    walkInName: s.walkInName, walkInPhone: s.walkInPhone,
    status: s.status, total: num(s.total),
    dispensedBy: s.dispensedBy,
    dispensedAt: requiredIso(s.dispensedAt),
    items,
  };
}

// ---------------------------------------------------------------------------
// Legacy: dispense queue (kept for backward compat with existing UI hooks)
// ---------------------------------------------------------------------------
router.get("/pharmacy/queue", requireRole("admin", "pharmacist", "doctor", "nurse"), async (_req, res) => {
  const rows = await db
    .select({ p: prescriptionsTable, pt: patientsTable })
    .from(prescriptionsTable)
    .innerJoin(patientsTable, eq(prescriptionsTable.patientId, patientsTable.id))
    .where(eq(prescriptionsTable.status, "pending"))
    .orderBy(desc(prescriptionsTable.createdAt))
    .limit(200);
  res.json(
    rows.map((r) => ({
      id: r.p.id,
      patientId: r.p.patientId,
      patientName: r.pt.name,
      encounterId: r.p.encounterId,
      drug: r.p.drug,
      dosage: r.p.dosage,
      frequency: r.p.frequency,
      duration: r.p.duration,
      instructions: r.p.instructions,
      status: r.p.status,
      prescribedBy: r.p.prescribedBy,
      createdAt: requiredIso(r.p.createdAt),
      dispensedAt: isoDate(r.p.dispensedAt),
    })),
  );
});

// Deprecated and hardened: the legacy endpoint used to flip Rx -> dispensed
// without decrementing stock or posting a bill, which would silently bypass
// inventory + accounting if any client still hit it. It now refuses and
// directs callers to POST /pharmacy/sales (transactional flow).
router.post("/prescriptions/:id/dispense", requireRole("admin", "pharmacist"), async (_req, res) => {
  res.status(410).json({
    error: "This endpoint is deprecated. POST /pharmacy/sales with kind=\"rx\" and prescriptionId to dispense (it decrements stock and posts the bill atomically).",
  });
});

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------
router.get("/pharmacy/suppliers", requireRole("admin", "pharmacist", "accountant"), async (_req, res) => {
  const rows = await db.select().from(pharmacySuppliersTable).orderBy(asc(pharmacySuppliersTable.name));
  res.json(rows.map(shapeSupplier));
});

router.post("/pharmacy/suppliers", requireRole("admin", "pharmacist"), async (req, res) => {
  const parsed = CreateSupplierBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const [row] = await db.insert(pharmacySuppliersTable).values(parsed.data).returning();
  res.status(201).json(shapeSupplier(row));
});

// ---------------------------------------------------------------------------
// Batches & alerts
// ---------------------------------------------------------------------------
router.get("/pharmacy/drugs/:id/batches", requireRole("admin", "pharmacist", "doctor", "nurse"), async (req, res) => {
  const drugId = Number(req.params.id);
  const rows = await db
    .select({ b: pharmacyBatchesTable, drugName: drugsTable.name })
    .from(pharmacyBatchesTable)
    .innerJoin(drugsTable, eq(pharmacyBatchesTable.drugId, drugsTable.id))
    .where(eq(pharmacyBatchesTable.drugId, drugId))
    .orderBy(asc(pharmacyBatchesTable.expiry));
  res.json(rows.map((r) => shapeBatch(r.b, r.drugName)));
});

router.get("/pharmacy/batches", requireRole("admin", "pharmacist", "accountant"), async (req, res) => {
  const nearDays = req.query.nearExpiryDays ? Number(req.query.nearExpiryDays) : null;
  let query = db
    .select({ b: pharmacyBatchesTable, drugName: drugsTable.name })
    .from(pharmacyBatchesTable)
    .innerJoin(drugsTable, eq(pharmacyBatchesTable.drugId, drugsTable.id))
    .orderBy(asc(pharmacyBatchesTable.expiry))
    .$dynamic();
  if (nearDays != null) {
    const cutoff = new Date(Date.now() + nearDays * 86400000).toISOString().slice(0, 10);
    query = query.where(and(gt(pharmacyBatchesTable.qtyOnHand, 0), lte(pharmacyBatchesTable.expiry, cutoff)));
  }
  const rows = await query.limit(500);
  res.json(rows.map((r) => shapeBatch(r.b, r.drugName)));
});

router.get("/pharmacy/alerts", requireRole("admin", "pharmacist"), async (_req, res) => {
  // Low stock: aggregate qtyOnHand by drug, compare to reorderLevel.
  const stockRows = await db
    .select({
      drugId: drugsTable.id,
      drugName: drugsTable.name,
      reorderLevel: drugsTable.reorderLevel,
      totalQty: sql<number>`coalesce(sum(${pharmacyBatchesTable.qtyOnHand}), 0)::int`,
    })
    .from(drugsTable)
    .leftJoin(pharmacyBatchesTable, eq(pharmacyBatchesTable.drugId, drugsTable.id))
    .groupBy(drugsTable.id, drugsTable.name, drugsTable.reorderLevel);
  const lowStock = stockRows
    .filter((r) => r.totalQty <= r.reorderLevel)
    .map((r) => ({ drugId: r.drugId, drugName: r.drugName, totalQty: Number(r.totalQty), reorderLevel: r.reorderLevel }));

  const cutoff = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  const nearRows = await db
    .select({ b: pharmacyBatchesTable, drugName: drugsTable.name })
    .from(pharmacyBatchesTable)
    .innerJoin(drugsTable, eq(pharmacyBatchesTable.drugId, drugsTable.id))
    .where(and(gt(pharmacyBatchesTable.qtyOnHand, 0), lte(pharmacyBatchesTable.expiry, cutoff)))
    .orderBy(asc(pharmacyBatchesTable.expiry))
    .limit(100);
  res.json({ lowStock, nearExpiry: nearRows.map((r) => shapeBatch(r.b, r.drugName)) });
});

// ---------------------------------------------------------------------------
// Purchase orders
// ---------------------------------------------------------------------------
async function loadPoItems(poIds: number[], executor: typeof db = db) {
  if (poIds.length === 0) return new Map<number, Array<{ id: number; drugId: number; drugName: string; qty: number; costPerUnit: number }>>();
  const rows = await executor
    .select({
      id: pharmacyPurchaseOrderItemsTable.id,
      poId: pharmacyPurchaseOrderItemsTable.poId,
      drugId: pharmacyPurchaseOrderItemsTable.drugId,
      drugName: drugsTable.name,
      qty: pharmacyPurchaseOrderItemsTable.qty,
      costPerUnit: pharmacyPurchaseOrderItemsTable.costPerUnit,
    })
    .from(pharmacyPurchaseOrderItemsTable)
    .innerJoin(drugsTable, eq(pharmacyPurchaseOrderItemsTable.drugId, drugsTable.id))
    .where(inArray(pharmacyPurchaseOrderItemsTable.poId, poIds));
  const map = new Map<number, Array<{ id: number; drugId: number; drugName: string; qty: number; costPerUnit: number }>>();
  for (const r of rows) {
    const list = map.get(r.poId) ?? [];
    list.push({ id: r.id, drugId: r.drugId, drugName: r.drugName, qty: r.qty, costPerUnit: num(r.costPerUnit) });
    map.set(r.poId, list);
  }
  return map;
}

router.get("/pharmacy/purchase-orders", requireRole("admin", "pharmacist", "accountant"), async (_req, res) => {
  const rows = await db
    .select({ po: pharmacyPurchaseOrdersTable, supplierName: pharmacySuppliersTable.name })
    .from(pharmacyPurchaseOrdersTable)
    .innerJoin(pharmacySuppliersTable, eq(pharmacyPurchaseOrdersTable.supplierId, pharmacySuppliersTable.id))
    .orderBy(desc(pharmacyPurchaseOrdersTable.createdAt))
    .limit(200);
  const items = await loadPoItems(rows.map((r) => r.po.id));
  res.json(rows.map((r) => shapePo(r.po, r.supplierName, items.get(r.po.id) ?? [])));
});

router.get("/pharmacy/purchase-orders/:id", requireRole("admin", "pharmacist", "accountant"), async (req, res) => {
  const id = Number(req.params.id);
  const [r] = await db
    .select({ po: pharmacyPurchaseOrdersTable, supplierName: pharmacySuppliersTable.name })
    .from(pharmacyPurchaseOrdersTable)
    .innerJoin(pharmacySuppliersTable, eq(pharmacyPurchaseOrdersTable.supplierId, pharmacySuppliersTable.id))
    .where(eq(pharmacyPurchaseOrdersTable.id, id))
    .limit(1);
  if (!r) return res.status(404).json({ error: "Not found" });
  const items = await loadPoItems([id]);
  res.json(shapePo(r.po, r.supplierName, items.get(id) ?? []));
});

router.post("/pharmacy/purchase-orders", requireRole("admin", "pharmacist"), async (req, res) => {
  const parsed = CreatePurchaseOrderBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const items = parsed.data.items;
  if (items.length === 0) return res.status(400).json({ error: "At least one item is required" });
  for (const it of items) {
    if (!Number.isFinite(it.qty) || it.qty <= 0 || !Number.isInteger(it.qty)) return res.status(400).json({ error: "qty must be a positive integer" });
    if (!Number.isFinite(Number(it.costPerUnit)) || Number(it.costPerUnit) < 0) return res.status(400).json({ error: "costPerUnit must be >= 0" });
  }
  const expected = r2(items.reduce((s, it) => s + Number(it.qty) * Number(it.costPerUnit), 0));
  try {
    const result = await db.transaction(async (tx) => {
      const [{ next }] = (
        await tx.execute<{ next: string }>(
          sql`SELECT 'PO' || to_char(now(),'YYYYMMDD') || lpad((coalesce(max(id),0)+1)::text, 4, '0') AS next FROM pharmacy_purchase_orders`,
        )
      ).rows;
      const [po] = await tx.insert(pharmacyPurchaseOrdersTable).values({
        poNumber: next,
        supplierId: parsed.data.supplierId,
        notes: parsed.data.notes ?? null,
        status: "placed",
        placedAt: new Date(),
        expectedAmount: expected.toFixed(2),
        createdBy: req.user?.name ?? null,
      }).returning();
      await tx.insert(pharmacyPurchaseOrderItemsTable).values(
        items.map((it) => ({
          poId: po.id, drugId: it.drugId,
          qty: it.qty, costPerUnit: String(it.costPerUnit),
        })),
      );
      const [{ name: supplierName }] = await tx
        .select({ name: pharmacySuppliersTable.name })
        .from(pharmacySuppliersTable)
        .where(eq(pharmacySuppliersTable.id, po.supplierId));
      const itemMap = await loadPoItems([po.id], tx as unknown as typeof db);
      return shapePo(po, supplierName, itemMap.get(po.id) ?? []);
    });
    res.status(201).json(result);
  } catch (e) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

// ---------------------------------------------------------------------------
// GRN: receive stock, create batches, update PO status
// ---------------------------------------------------------------------------
async function loadGrnItems(grnIds: number[], executor: typeof db = db) {
  if (grnIds.length === 0) return new Map<number, Array<{ id: number; drugId: number; drugName: string; batchId: number | null; batchNo: string; expiry: string; qty: number; costPerUnit: number; mrp: number }>>();
  const rows = await executor
    .select({
      id: pharmacyGrnItemsTable.id, grnId: pharmacyGrnItemsTable.grnId,
      drugId: pharmacyGrnItemsTable.drugId, drugName: drugsTable.name,
      batchId: pharmacyGrnItemsTable.batchId, batchNo: pharmacyGrnItemsTable.batchNo,
      expiry: pharmacyGrnItemsTable.expiry, qty: pharmacyGrnItemsTable.qty,
      costPerUnit: pharmacyGrnItemsTable.costPerUnit, mrp: pharmacyGrnItemsTable.mrp,
    })
    .from(pharmacyGrnItemsTable)
    .innerJoin(drugsTable, eq(pharmacyGrnItemsTable.drugId, drugsTable.id))
    .where(inArray(pharmacyGrnItemsTable.grnId, grnIds));
  const map = new Map<number, Array<{ id: number; drugId: number; drugName: string; batchId: number | null; batchNo: string; expiry: string; qty: number; costPerUnit: number; mrp: number }>>();
  for (const r of rows) {
    const list = map.get(r.grnId) ?? [];
    list.push({
      id: r.id, drugId: r.drugId, drugName: r.drugName,
      batchId: r.batchId, batchNo: r.batchNo,
      expiry: dateOnly(r.expiry)!,
      qty: r.qty,
      costPerUnit: num(r.costPerUnit), mrp: num(r.mrp),
    });
    map.set(r.grnId, list);
  }
  return map;
}

router.get("/pharmacy/grns", requireRole("admin", "pharmacist", "accountant"), async (_req, res) => {
  const rows = await db
    .select({ g: pharmacyGrnsTable, supplierName: pharmacySuppliersTable.name })
    .from(pharmacyGrnsTable)
    .innerJoin(pharmacySuppliersTable, eq(pharmacyGrnsTable.supplierId, pharmacySuppliersTable.id))
    .orderBy(desc(pharmacyGrnsTable.receivedAt))
    .limit(200);
  const items = await loadGrnItems(rows.map((r) => r.g.id));
  res.json(rows.map((r) => shapeGrn(r.g, r.supplierName, items.get(r.g.id) ?? [])));
});

router.post("/pharmacy/grns", requireRole("admin", "pharmacist"), async (req, res) => {
  const parsed = CreateGrnBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const items = parsed.data.items;
  if (items.length === 0) return res.status(400).json({ error: "At least one item is required" });
  for (const it of items) {
    if (!Number.isFinite(it.qty) || it.qty <= 0 || !Number.isInteger(it.qty)) return res.status(400).json({ error: "qty must be a positive integer" });
    if (!Number.isFinite(Number(it.costPerUnit)) || Number(it.costPerUnit) < 0) return res.status(400).json({ error: "costPerUnit must be >= 0" });
    if (!Number.isFinite(Number(it.mrp)) || Number(it.mrp) < 0) return res.status(400).json({ error: "mrp must be >= 0" });
    if (!it.batchNo?.trim()) return res.status(400).json({ error: "batchNo required" });
    if (!it.expiry) return res.status(400).json({ error: "expiry required" });
  }
  const landed = r2(items.reduce((s, it) => s + Number(it.qty) * Number(it.costPerUnit), 0));

  try {
    const result = await db.transaction(async (tx) => {
      const [{ next }] = (
        await tx.execute<{ next: string }>(
          sql`SELECT 'GRN' || to_char(now(),'YYYYMMDD') || lpad((coalesce(max(id),0)+1)::text, 4, '0') AS next FROM pharmacy_grns`,
        )
      ).rows;
      const [grn] = await tx.insert(pharmacyGrnsTable).values({
        grnNumber: next,
        supplierId: parsed.data.supplierId,
        poId: parsed.data.poId ?? null,
        invoiceNumber: parsed.data.invoiceNumber ?? null,
        invoiceDate: parsed.data.invoiceDate ?? null,
        landedCost: landed.toFixed(2),
        notes: parsed.data.notes ?? null,
        receivedBy: req.user?.name ?? null,
      }).returning();

      // Each line creates its own batch (lot-tracked); also update drug MRP to
      // latest received so OTC pricing stays current. Sum into existing batch
      // if same drug+batchNo+expiry already exists.
      for (const it of items) {
        const [existing] = await tx
          .select()
          .from(pharmacyBatchesTable)
          .where(and(
            eq(pharmacyBatchesTable.drugId, it.drugId),
            eq(pharmacyBatchesTable.batchNo, it.batchNo),
            eq(pharmacyBatchesTable.expiry, it.expiry),
          ))
          .for("update")
          .limit(1);

        let batchId: number;
        if (existing) {
          const [upd] = await tx
            .update(pharmacyBatchesTable)
            .set({
              qtyOnHand: existing.qtyOnHand + it.qty,
              costPerUnit: String(it.costPerUnit),
              mrp: String(it.mrp),
              location: it.location ?? existing.location,
            })
            .where(eq(pharmacyBatchesTable.id, existing.id))
            .returning({ id: pharmacyBatchesTable.id });
          batchId = upd.id;
        } else {
          const [created] = await tx.insert(pharmacyBatchesTable).values({
            drugId: it.drugId, batchNo: it.batchNo, expiry: it.expiry,
            qtyOnHand: it.qty,
            costPerUnit: String(it.costPerUnit),
            mrp: String(it.mrp),
            location: it.location ?? null,
            grnId: grn.id,
          }).returning({ id: pharmacyBatchesTable.id });
          batchId = created.id;
        }

        await tx.insert(pharmacyGrnItemsTable).values({
          grnId: grn.id, drugId: it.drugId, batchId,
          batchNo: it.batchNo, expiry: it.expiry, qty: it.qty,
          costPerUnit: String(it.costPerUnit), mrp: String(it.mrp),
        });

        // Refresh drug MRP to latest received so formulary stays in sync.
        await tx.update(drugsTable).set({ mrp: String(it.mrp) }).where(eq(drugsTable.id, it.drugId));
      }

      if (parsed.data.poId) {
        await tx.update(pharmacyPurchaseOrdersTable)
          .set({ status: "received" })
          .where(eq(pharmacyPurchaseOrdersTable.id, parsed.data.poId));
      }

      const [{ name: supplierName }] = await tx
        .select({ name: pharmacySuppliersTable.name })
        .from(pharmacySuppliersTable)
        .where(eq(pharmacySuppliersTable.id, grn.supplierId));
      const map = await loadGrnItems([grn.id], tx as unknown as typeof db);
      return shapeGrn(grn, supplierName, map.get(grn.id) ?? []);
    });
    res.status(201).json(result);
  } catch (e) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

// ---------------------------------------------------------------------------
// Sales (Rx dispense + OTC) — decrements batches + creates Bill atomically
// ---------------------------------------------------------------------------
async function loadSaleItems(saleIds: number[], executor: typeof db = db): Promise<Map<number, SaleItemRow[]>> {
  const map = new Map<number, SaleItemRow[]>();
  if (saleIds.length === 0) return map;
  const rows = await executor
    .select({
      id: pharmacySaleItemsTable.id, saleId: pharmacySaleItemsTable.saleId,
      drugId: pharmacySaleItemsTable.drugId, drugName: drugsTable.name,
      batchId: pharmacySaleItemsTable.batchId, batchNo: pharmacyBatchesTable.batchNo,
      qty: pharmacySaleItemsTable.qty, qtyReturned: pharmacySaleItemsTable.qtyReturned,
      unitPrice: pharmacySaleItemsTable.unitPrice, discount: pharmacySaleItemsTable.discount,
      gstRate: pharmacySaleItemsTable.gstRate, amount: pharmacySaleItemsTable.amount,
    })
    .from(pharmacySaleItemsTable)
    .innerJoin(drugsTable, eq(pharmacySaleItemsTable.drugId, drugsTable.id))
    .innerJoin(pharmacyBatchesTable, eq(pharmacySaleItemsTable.batchId, pharmacyBatchesTable.id))
    .where(inArray(pharmacySaleItemsTable.saleId, saleIds));
  for (const r of rows) {
    const list = map.get(r.saleId) ?? [];
    list.push({
      id: r.id, drugId: r.drugId, drugName: r.drugName,
      batchId: r.batchId, batchNo: r.batchNo,
      qty: r.qty, qtyReturned: r.qtyReturned,
      unitPrice: num(r.unitPrice), discount: num(r.discount),
      gstRate: num(r.gstRate), amount: num(r.amount),
    });
    map.set(r.saleId, list);
  }
  return map;
}

router.get("/pharmacy/sales", requireRole("admin", "pharmacist", "accountant", "cashier"), async (req, res) => {
  const conds: ReturnType<typeof eq>[] = [];
  if (req.query.kind) conds.push(eq(pharmacySalesTable.kind, String(req.query.kind)));
  if (req.query.from) conds.push(gte(pharmacySalesTable.dispensedAt, new Date(String(req.query.from))));
  if (req.query.to) conds.push(lte(pharmacySalesTable.dispensedAt, new Date(String(req.query.to))));
  const rows = await db
    .select({
      s: pharmacySalesTable,
      patientName: patientsTable.name,
      billNumber: billsTable.billNumber,
    })
    .from(pharmacySalesTable)
    .leftJoin(patientsTable, eq(pharmacySalesTable.patientId, patientsTable.id))
    .leftJoin(billsTable, eq(pharmacySalesTable.billId, billsTable.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(pharmacySalesTable.dispensedAt))
    .limit(500);
  const items = await loadSaleItems(rows.map((r) => r.s.id));
  res.json(rows.map((r) => shapeSale(r.s, r.patientName, r.billNumber, items.get(r.s.id) ?? [])));
});

router.get("/pharmacy/sales/:id", requireRole("admin", "pharmacist", "accountant", "cashier"), async (req, res) => {
  const id = Number(req.params.id);
  const [r] = await db
    .select({
      s: pharmacySalesTable,
      patientName: patientsTable.name,
      billNumber: billsTable.billNumber,
    })
    .from(pharmacySalesTable)
    .leftJoin(patientsTable, eq(pharmacySalesTable.patientId, patientsTable.id))
    .leftJoin(billsTable, eq(pharmacySalesTable.billId, billsTable.id))
    .where(eq(pharmacySalesTable.id, id))
    .limit(1);
  if (!r) return res.status(404).json({ error: "Not found" });
  const map = await loadSaleItems([id]);
  res.json(shapeSale(r.s, r.patientName, r.billNumber, map.get(id) ?? []));
});

router.post("/pharmacy/sales", requireRole("admin", "pharmacist"), async (req, res) => {
  const parsed = CreatePharmacySaleBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const { kind, patientId, prescriptionId, walkInName, walkInPhone, items } = parsed.data;
  if (items.length === 0) return res.status(400).json({ error: "No items" });
  if (kind === "rx" && !patientId) return res.status(400).json({ error: "patientId required for Rx" });
  if (kind === "rx" && !prescriptionId) return res.status(400).json({ error: "prescriptionId required for Rx" });
  // Defensive bounds — schema accepts plain numbers; reject anything that
  // could corrupt stock or accounting before opening the transaction.
  for (const it of items) {
    if (!Number.isFinite(it.qty) || it.qty <= 0 || !Number.isInteger(it.qty)) {
      return res.status(400).json({ error: "Each item.qty must be a positive integer" });
    }
    const disc = Number(it.discount ?? 0);
    if (!Number.isFinite(disc) || disc < 0) {
      return res.status(400).json({ error: "Item discount must be >= 0" });
    }
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Lock all batches FOR UPDATE up-front (ordered by id to avoid deadlocks),
      // then validate qty and decrement.
      const batchIds = [...new Set(items.map((it) => it.batchId))].sort((a, b) => a - b);
      const batches = await tx
        .select()
        .from(pharmacyBatchesTable)
        .where(inArray(pharmacyBatchesTable.id, batchIds))
        .for("update");
      const batchMap = new Map(batches.map((b) => [b.id, b]));

      // Load drugs for GST/HSN — only once.
      const drugIds = [...new Set(items.map((it) => it.drugId))];
      const drugs = await tx.select().from(drugsTable).where(inArray(drugsTable.id, drugIds));
      const drugMap = new Map(drugs.map((d) => [d.id, d]));

      // Aggregate qty per batch (a single sale may list the same batch twice).
      const want = new Map<number, number>();
      for (const it of items) want.set(it.batchId, (want.get(it.batchId) ?? 0) + it.qty);
      for (const [bid, q] of want) {
        const b = batchMap.get(bid);
        if (!b) throw new HttpError(400, `Batch ${bid} not found`);
        if (b.qtyOnHand < q) throw new HttpError(400, `Insufficient stock for batch ${b.batchNo}: have ${b.qtyOnHand}, need ${q}`);
      }

      // FEFO enforcement: caller may split a drug across multiple batches, but
      // earlier-expiry batches must be exhausted before any later batch is
      // touched. Compute the canonical greedy allocation per drug and require
      // the caller's per-batch quantities to match it exactly. Prevents
      // clients from bypassing the UI's FEFO sort and leaving near-expiry
      // stock to rot, while still permitting legitimate multi-batch lines.
      const drugIdsUsed = [...new Set(items.map((it) => it.drugId))];
      const allBatchesForDrugs = await tx
        .select()
        .from(pharmacyBatchesTable)
        .where(and(inArray(pharmacyBatchesTable.drugId, drugIdsUsed), gt(pharmacyBatchesTable.qtyOnHand, 0)));
      const batchesByDrug = new Map<number, typeof allBatchesForDrugs>();
      for (const b of allBatchesForDrugs) {
        const arr = batchesByDrug.get(b.drugId) ?? [];
        arr.push(b);
        batchesByDrug.set(b.drugId, arr);
      }
      // Per-drug per-batch requested qty (sum within drug across line items).
      const requestedPerDrugBatch = new Map<number, Map<number, number>>();
      for (const it of items) {
        const m = requestedPerDrugBatch.get(it.drugId) ?? new Map<number, number>();
        m.set(it.batchId, (m.get(it.batchId) ?? 0) + it.qty);
        requestedPerDrugBatch.set(it.drugId, m);
      }
      for (const [drugId, reqMap] of requestedPerDrugBatch) {
        const batches = (batchesByDrug.get(drugId) ?? []).slice().sort((a, b) =>
          a.expiry < b.expiry ? -1 : a.expiry > b.expiry ? 1 : a.id - b.id,
        );
        let remaining = [...reqMap.values()].reduce((s, n) => s + n, 0);
        const expected = new Map<number, number>();
        for (const b of batches) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, b.qtyOnHand);
          if (take > 0) expected.set(b.id, take);
          remaining -= take;
        }
        const drugName = drugMap.get(drugId)?.name ?? `drug ${drugId}`;
        if (remaining > 0) {
          throw new HttpError(400, `Insufficient stock for ${drugName}: short by ${remaining}`);
        }
        // Compare maps for exact match (size + each entry).
        if (expected.size !== reqMap.size) {
          const firstWrong = batches.find((b) => (expected.get(b.id) ?? 0) !== (reqMap.get(b.id) ?? 0));
          throw new HttpError(409, `FEFO violation for ${drugName}: dispense earliest-expiry batches first${firstWrong ? ` (batch ${firstWrong.batchNo} expires ${firstWrong.expiry})` : ""}.`);
        }
        for (const [bid, q] of expected) {
          if (reqMap.get(bid) !== q) {
            const b = batches.find((x) => x.id === bid);
            throw new HttpError(409, `FEFO violation for ${drugName}: batch ${b?.batchNo ?? bid} (expires ${b?.expiry ?? "?"}) needs ${q} unit(s), got ${reqMap.get(bid) ?? 0}.`);
          }
        }
      }

      // Build sale line items with per-line GST and total.
      const billItems: Array<{ description: string; quantity: number; unitPrice: number; discount: number; gstRate: number; amount: number; serviceCode: string | null }> = [];
      const saleLines: Array<{ drugId: number; batchId: number; qty: number; unitPrice: number; discount: number; gstRate: number; amount: number }> = [];
      let total = 0;
      for (const it of items) {
        const batch = batchMap.get(it.batchId)!;
        const drug = drugMap.get(it.drugId);
        if (!drug) throw new HttpError(400, `Drug ${it.drugId} not found`);
        if (batch.drugId !== it.drugId) throw new HttpError(400, `Batch ${batch.batchNo} does not belong to drug ${drug.name}`);
        const unit = num(batch.mrp);
        const lineGross = r2(it.qty * unit);
        let disc = Number(it.discount ?? 0);
        if (disc > lineGross) {
          // Refuse rather than silently absorbing — accounting must not invert.
          throw new HttpError(400, `Discount ${disc} exceeds line value ${lineGross} for ${drug.name}`);
        }
        const gst = num(drug.gstRate);
        const taxable = r2(Math.max(lineGross - disc, 0));
        const gstAmt = r2(taxable * gst / 100);
        const amount = r2(taxable + gstAmt);
        total = r2(total + amount);
        saleLines.push({ drugId: it.drugId, batchId: it.batchId, qty: it.qty, unitPrice: unit, discount: disc, gstRate: gst, amount });
        billItems.push({
          description: `${drug.name}${drug.strength ? " " + drug.strength : ""} (Batch ${batch.batchNo}) x ${it.qty}`,
          quantity: it.qty, unitPrice: unit, discount: disc, gstRate: gst, amount: taxable,
          serviceCode: drug.hsn,
        });
      }

      // Decrement batches.
      for (const [bid, q] of want) {
        const b = batchMap.get(bid)!;
        await tx.update(pharmacyBatchesTable)
          .set({ qtyOnHand: b.qtyOnHand - q })
          .where(eq(pharmacyBatchesTable.id, bid));
      }

      // Create Bill (intra GST split mirroring bills.ts conventions).
      let billId: number | null = null;
      if (patientId) {
        const subtotal = r2(billItems.reduce((s, it) => s + it.amount, 0));
        const cgst = r2(billItems.reduce((s, it) => s + r2(it.amount * (it.gstRate / 100) / 2), 0));
        const sgst = cgst;
        const billTotal = r2(subtotal + cgst + sgst);
        const [{ next: billNo }] = (
          await tx.execute<{ next: string }>(
            sql`SELECT 'INV' || to_char(now(),'YYYYMMDD') || lpad((coalesce(max(id),0)+1)::text, 4, '0') AS next FROM bills`,
          )
        ).rows;
        const [bill] = await tx.insert(billsTable).values({
          patientId,
          department: "Pharmacy",
          billNumber: billNo,
          subtotal: subtotal.toFixed(2),
          discount: "0.00",
          cgst: cgst.toFixed(2), sgst: sgst.toFixed(2), igst: "0.00",
          total: billTotal.toFixed(2),
          gstMode: "intra",
          items: billItems.map((it) => ({
            ...it,
            cgst: r2(it.amount * (it.gstRate / 100) / 2),
            sgst: r2(it.amount * (it.gstRate / 100) / 2),
            igst: 0,
          })),
          notes: kind === "rx" ? `Pharmacy dispense (Rx #${prescriptionId ?? "-"})` : "Pharmacy OTC sale",
        }).returning({ id: billsTable.id });
        billId = bill.id;
      }

      const [{ next: saleNo }] = (
        await tx.execute<{ next: string }>(
          sql`SELECT 'SALE' || to_char(now(),'YYYYMMDD') || lpad((coalesce(max(id),0)+1)::text, 4, '0') AS next FROM pharmacy_sales`,
        )
      ).rows;

      const [sale] = await tx.insert(pharmacySalesTable).values({
        saleNumber: saleNo,
        kind,
        patientId: patientId ?? null,
        prescriptionId: prescriptionId ?? null,
        billId,
        walkInName: walkInName ?? null,
        walkInPhone: walkInPhone ?? null,
        total: total.toFixed(2),
        dispensedBy: req.user?.name ?? null,
      }).returning();

      await tx.insert(pharmacySaleItemsTable).values(
        saleLines.map((l) => ({
          saleId: sale.id, drugId: l.drugId, batchId: l.batchId,
          qty: l.qty, unitPrice: l.unitPrice.toFixed(2),
          discount: l.discount.toFixed(2), gstRate: l.gstRate.toFixed(2),
          amount: l.amount.toFixed(2),
        })),
      );

      if (prescriptionId) {
        // Lock the prescription row and verify it belongs to the patient and
        // is still pending; prevents concurrent double-dispense.
        const [rx] = await tx.execute<{ id: number; patient_id: number; status: string }>(
          sql`SELECT id, patient_id, status FROM prescriptions WHERE id = ${prescriptionId} FOR UPDATE`,
        ).then((r) => r.rows);
        if (!rx) throw new HttpError(404, `Prescription ${prescriptionId} not found`);
        if (patientId && rx.patient_id !== patientId) {
          throw new HttpError(400, "Prescription does not belong to this patient");
        }
        if (rx.status !== "pending") {
          throw new HttpError(409, `Prescription already ${rx.status}`);
        }
        await tx.update(prescriptionsTable)
          .set({ status: "dispensed", dispensedAt: new Date() })
          .where(eq(prescriptionsTable.id, prescriptionId));
      }

      let patientName: string | null = null;
      let billNumber: string | null = null;
      if (patientId) {
        const [pt] = await tx.select({ name: patientsTable.name }).from(patientsTable).where(eq(patientsTable.id, patientId));
        patientName = pt?.name ?? null;
      }
      if (billId) {
        const [b] = await tx.select({ n: billsTable.billNumber }).from(billsTable).where(eq(billsTable.id, billId));
        billNumber = b?.n ?? null;
      }
      const m = await loadSaleItems([sale.id], tx as unknown as typeof db);
      return { sale, patientName, billNumber, items: m.get(sale.id) ?? [] };
    });

    if (result.sale.patientId) {
      await sendNotification({
        eventKey: "medication_scheduled",
        channel: "both",
        patientId: result.sale.patientId,
        variables: { saleNumber: result.sale.saleNumber, total: num(result.sale.total).toFixed(2) },
      }).catch(() => {});
    }
    res.status(201).json(shapeSale(result.sale, result.patientName, result.billNumber, result.items));
  } catch (e) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

// Returns: restock batches if requested and refund proportional amount.
router.post("/pharmacy/sales/:id/return", requireRole("admin", "pharmacist"), async (req, res) => {
  const saleId = Number(req.params.id);
  const parsed = ReturnPharmacySaleBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const items = parsed.data.items;
  if (items.length === 0) return res.status(400).json({ error: "No items" });
  for (const it of items) {
    if (!Number.isFinite(it.qty) || it.qty <= 0 || !Number.isInteger(it.qty)) return res.status(400).json({ error: "Return qty must be a positive integer" });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [sale] = await tx.execute<typeof pharmacySalesTable.$inferSelect>(
        sql`SELECT * FROM pharmacy_sales WHERE id = ${saleId} FOR UPDATE`,
      ).then((r) => r.rows);
      if (!sale) throw new HttpError(404, "Sale not found");

      const saleItemIds = items.map((i) => i.saleItemId);
      const saleItems = await tx
        .select()
        .from(pharmacySaleItemsTable)
        .where(inArray(pharmacySaleItemsTable.id, saleItemIds))
        .for("update");
      const itemMap = new Map(saleItems.map((s) => [s.id, s]));

      let refund = 0;
      for (const ret of items) {
        const si = itemMap.get(ret.saleItemId);
        if (!si || si.saleId !== saleId) throw new HttpError(400, `Sale item ${ret.saleItemId} not in this sale`);
        const remaining = si.qty - si.qtyReturned;
        if (ret.qty > remaining) throw new HttpError(400, `Cannot return ${ret.qty} of ${si.id}: only ${remaining} remaining`);
        const linePerUnit = num(si.amount) / si.qty;
        const refundLine = r2(linePerUnit * ret.qty);
        refund = r2(refund + refundLine);

        await tx.update(pharmacySaleItemsTable)
          .set({ qtyReturned: si.qtyReturned + ret.qty })
          .where(eq(pharmacySaleItemsTable.id, si.id));

        if (ret.restock !== false) {
          // FOR UPDATE the batch before bumping qty.
          const [b] = await tx
            .select()
            .from(pharmacyBatchesTable)
            .where(eq(pharmacyBatchesTable.id, si.batchId))
            .for("update");
          if (b) {
            await tx.update(pharmacyBatchesTable)
              .set({ qtyOnHand: b.qtyOnHand + ret.qty })
              .where(eq(pharmacyBatchesTable.id, si.batchId));
          }
        }
      }

      const [{ next }] = (
        await tx.execute<{ next: string }>(
          sql`SELECT 'PRET' || to_char(now(),'YYYYMMDD') || lpad((coalesce(max(id),0)+1)::text, 4, '0') AS next FROM pharmacy_returns`,
        )
      ).rows;
      const [ret] = await tx.insert(pharmacyReturnsTable).values({
        returnNumber: next, saleId, reason: parsed.data.reason ?? null,
        refundAmount: refund.toFixed(2), approvedBy: req.user?.name ?? null,
      }).returning();
      await tx.insert(pharmacyReturnItemsTable).values(
        items.map((it) => {
          const si = itemMap.get(it.saleItemId)!;
          const linePerUnit = num(si.amount) / si.qty;
          return {
            returnId: ret.id, saleItemId: it.saleItemId,
            qty: it.qty, restock: it.restock !== false,
            refundLine: r2(linePerUnit * it.qty).toFixed(2),
          };
        }),
      );

      // Recompute sale status.
      const updated = await tx.select().from(pharmacySaleItemsTable).where(eq(pharmacySaleItemsTable.saleId, saleId));
      const allReturned = updated.every((u) => u.qtyReturned >= u.qty);
      const anyReturned = updated.some((u) => u.qtyReturned > 0);
      const status = allReturned ? "returned" : anyReturned ? "partial_return" : "dispensed";
      await tx.update(pharmacySalesTable).set({ status }).where(eq(pharmacySalesTable.id, saleId));

      return {
        id: ret.id, returnNumber: ret.returnNumber, saleId,
        reason: ret.reason, refundAmount: refund,
        approvedBy: ret.approvedBy, returnedAt: requiredIso(ret.returnedAt),
      };
    });
    res.status(201).json(result);
  } catch (e) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
router.get("/pharmacy/reports/stock-value", requireRole("admin", "pharmacist", "accountant"), async (_req, res) => {
  const rows = await db
    .select({
      drugId: drugsTable.id, drugName: drugsTable.name,
      qtyOnHand: sql<number>`coalesce(sum(${pharmacyBatchesTable.qtyOnHand}), 0)::int`,
      costValue: sql<string>`coalesce(sum(${pharmacyBatchesTable.qtyOnHand} * ${pharmacyBatchesTable.costPerUnit}), 0)::text`,
      mrpValue: sql<string>`coalesce(sum(${pharmacyBatchesTable.qtyOnHand} * ${pharmacyBatchesTable.mrp}), 0)::text`,
    })
    .from(drugsTable)
    .leftJoin(pharmacyBatchesTable, eq(pharmacyBatchesTable.drugId, drugsTable.id))
    .groupBy(drugsTable.id, drugsTable.name)
    .orderBy(asc(drugsTable.name));
  res.json(rows.map((r) => ({
    drugId: r.drugId, drugName: r.drugName,
    qtyOnHand: Number(r.qtyOnHand),
    costValue: num(r.costValue),
    mrpValue: num(r.mrpValue),
  })));
});

router.get("/pharmacy/reports/movers", requireRole("admin", "pharmacist", "accountant"), async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 20), 200);
  const conds: ReturnType<typeof eq>[] = [];
  if (req.query.from) conds.push(gte(pharmacySalesTable.dispensedAt, new Date(String(req.query.from))));
  if (req.query.to) conds.push(lte(pharmacySalesTable.dispensedAt, new Date(String(req.query.to))));
  const rows = await db
    .select({
      drugId: pharmacySaleItemsTable.drugId,
      drugName: drugsTable.name,
      qtyDispensed: sql<number>`sum(${pharmacySaleItemsTable.qty} - ${pharmacySaleItemsTable.qtyReturned})::int`,
      salesValue: sql<string>`sum(${pharmacySaleItemsTable.amount})::text`,
    })
    .from(pharmacySaleItemsTable)
    .innerJoin(pharmacySalesTable, eq(pharmacySaleItemsTable.saleId, pharmacySalesTable.id))
    .innerJoin(drugsTable, eq(pharmacySaleItemsTable.drugId, drugsTable.id))
    .where(conds.length ? and(...conds) : undefined)
    .groupBy(pharmacySaleItemsTable.drugId, drugsTable.name)
    .orderBy(sql`sum(${pharmacySaleItemsTable.qty} - ${pharmacySaleItemsTable.qtyReturned}) desc`)
    .limit(limit);
  res.json(rows.map((r) => ({
    drugId: r.drugId, drugName: r.drugName,
    qtyDispensed: Number(r.qtyDispensed),
    salesValue: num(r.salesValue),
  })));
});

router.get("/pharmacy/reports/near-expiry", requireRole("admin", "pharmacist", "accountant"), async (req, res) => {
  const days = Number(req.query.days ?? 90);
  const cutoff = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const rows = await db
    .select({ b: pharmacyBatchesTable, drugName: drugsTable.name })
    .from(pharmacyBatchesTable)
    .innerJoin(drugsTable, eq(pharmacyBatchesTable.drugId, drugsTable.id))
    .where(and(gt(pharmacyBatchesTable.qtyOnHand, 0), lte(pharmacyBatchesTable.expiry, cutoff)))
    .orderBy(asc(pharmacyBatchesTable.expiry))
    .limit(500);
  res.json(rows.map((r) => shapeBatch(r.b, r.drugName)));
});

router.get("/pharmacy/reports/supplier-purchases", requireRole("admin", "pharmacist", "accountant"), async (req, res) => {
  const conds: ReturnType<typeof eq>[] = [];
  if (req.query.from) conds.push(gte(pharmacyGrnsTable.receivedAt, new Date(String(req.query.from))));
  if (req.query.to) conds.push(lte(pharmacyGrnsTable.receivedAt, new Date(String(req.query.to))));
  const rows = await db
    .select({
      supplierId: pharmacySuppliersTable.id,
      supplierName: pharmacySuppliersTable.name,
      grnCount: sql<number>`count(${pharmacyGrnsTable.id})::int`,
      totalCost: sql<string>`coalesce(sum(${pharmacyGrnsTable.landedCost}), 0)::text`,
    })
    .from(pharmacySuppliersTable)
    .leftJoin(pharmacyGrnsTable, conds.length
      ? and(eq(pharmacyGrnsTable.supplierId, pharmacySuppliersTable.id), ...conds)
      : eq(pharmacyGrnsTable.supplierId, pharmacySuppliersTable.id))
    .groupBy(pharmacySuppliersTable.id, pharmacySuppliersTable.name)
    .orderBy(sql`coalesce(sum(${pharmacyGrnsTable.landedCost}), 0) desc`);
  res.json(rows.map((r) => ({
    supplierId: r.supplierId, supplierName: r.supplierName,
    grnCount: Number(r.grnCount), totalCost: num(r.totalCost),
  })));
});

export default router;
