import { useState, useMemo } from "react";
import {
  useGetPharmacyQueue,
  useListDrugs,
  useListAllBatches,
  useGetPharmacyAlerts,
  useListSuppliers,
  useCreateSupplier,
  useListPurchaseOrders,
  useCreatePurchaseOrder,
  useListGrns,
  useCreateGrn,
  useListPharmacySales,
  useGetPharmacySale,
  useCreatePharmacySale,
  useReturnPharmacySale,
  useListDrugBatches,
  useGetStockValueReport,
  useGetMoversReport,
  useGetSupplierPurchasesReport,
  useListPrescriptions,
  getListAllBatchesQueryKey,
  getGetPharmacyAlertsQueryKey,
  getListPurchaseOrdersQueryKey,
  getListGrnsQueryKey,
  getListPharmacySalesQueryKey,
  getListSuppliersQueryKey,
  getGetPharmacyQueueQueryKey,
  getListPrescriptionsQueryKey,
  getGetStockValueReportQueryKey,
  getGetMoversReportQueryKey,
  getGetSupplierPurchasesReportQueryKey,
  getListDrugBatchesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { ShieldPlus, Plus, AlertTriangle, Trash2, Package, TrendingUp, FileText, Truck, Undo2, Printer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function inr(n: number | string | null | undefined) {
  const v = typeof n === "number" ? n : Number(n ?? 0);
  return `₹${v.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Dispense (Rx) — pulls pending prescriptions; opens composer to dispense.
// ---------------------------------------------------------------------------
function DispenseTab() {
  const { data: queue, isLoading } = useGetPharmacyQueue();
  const [sel, setSel] = useState<{ id: number; patientId: number; drug: string; patientName: string } | null>(null);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Pending Prescriptions</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Drug</TableHead>
                <TableHead>Dosage</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : queue?.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No pending prescriptions</TableCell></TableRow>
              ) : queue?.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{new Date(p.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short" })}</TableCell>
                  <TableCell className="font-medium">{p.patientName}</TableCell>
                  <TableCell className="font-semibold">{p.drug}</TableCell>
                  <TableCell>{p.dosage} {p.frequency ? `• ${p.frequency}` : ""}</TableCell>
                  <TableCell>
                    <Button size="sm" onClick={() => setSel({ id: p.id, patientId: p.patientId, drug: p.drug, patientName: p.patientName })} data-testid={`button-dispense-${p.id}`}>Dispense</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {sel && (
        <SaleComposer
          kind="rx"
          patientId={sel.patientId}
          patientName={sel.patientName}
          prescriptionId={sel.id}
          drugHint={sel.drug}
          onClose={() => setSel(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Label printing — opens a print-ready window with one label per dispensed
// unit (drug name, strength, batch, expiry, qty, patient/walk-in). Done
// client-side: all data we need is already on the sale payload, so no extra
// server round-trip is required.
// ---------------------------------------------------------------------------
function printSaleLabels(sale: {
  saleNumber: string;
  patientName?: string | null;
  walkInName?: string | null;
  dispensedAt: string;
  items: Array<{ drugName: string; batchNo: string; qty: number; unitPrice: number }>;
}) {
  const recipient = sale.patientName ?? sale.walkInName ?? "Walk-in";
  const when = new Date(sale.dispensedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const labels = sale.items.map((it) => `
    <div class="lbl">
      <div class="hdr">Mystics MediCare</div>
      <div class="drug">${escapeHtml(it.drugName)}</div>
      <div class="row"><span>Batch</span><b>${escapeHtml(it.batchNo)}</b></div>
      <div class="row"><span>Qty</span><b>${it.qty}</b></div>
      <div class="row"><span>For</span><b>${escapeHtml(recipient)}</b></div>
      <div class="row"><span>Sale</span><b>${escapeHtml(sale.saleNumber)}</b></div>
      <div class="row"><span>Dispensed</span><b>${escapeHtml(when)}</b></div>
    </div>
  `).join("");
  const html = `<!doctype html><html><head><title>Labels ${escapeHtml(sale.saleNumber)}</title>
    <style>
      @page { size: 50mm 30mm; margin: 2mm; }
      body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; padding: 4mm; }
      .lbl { border: 1px dashed #999; padding: 3mm; margin-bottom: 2mm; page-break-after: always; width: 46mm; }
      .hdr { font-size: 9px; color: #555; text-align: center; }
      .drug { font-weight: 700; font-size: 12px; margin: 1mm 0; }
      .row { display: flex; justify-content: space-between; font-size: 10px; }
      @media print { .lbl { page-break-after: always; } }
    </style></head><body>${labels}
    <script>window.onload = () => { window.print(); };<\/script>
    </body></html>`;
  const w = window.open("", "_blank", "width=400,height=600");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));
}

// ---------------------------------------------------------------------------
// OTC sale — walk-in customer; optional patient link.
// ---------------------------------------------------------------------------
function OtcTab() {
  const [open, setOpen] = useState(false);
  const [returnFor, setReturnFor] = useState<number | null>(null);
  const { data: sales } = useListPharmacySales({ kind: "otc" });
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)} data-testid="button-new-otc"><Plus className="w-4 h-4 mr-2" /> New OTC Sale</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sale #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales?.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No OTC sales yet</TableCell></TableRow>
              ) : sales?.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.saleNumber}</TableCell>
                  <TableCell>{new Date(s.dispensedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</TableCell>
                  <TableCell>{s.walkInName ?? s.patientName ?? "Walk-in"}</TableCell>
                  <TableCell>{s.items.length}</TableCell>
                  <TableCell className="text-right font-semibold">{inr(s.total)}</TableCell>
                  <TableCell><Badge variant={s.status === "returned" ? "destructive" : s.status === "partial_return" ? "secondary" : "default"}>{s.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => printSaleLabels({ saleNumber: s.saleNumber, patientName: s.patientName, walkInName: s.walkInName, dispensedAt: s.dispensedAt, items: s.items.map((it) => ({ drugName: it.drugName ?? "", batchNo: it.batchNo ?? "", qty: it.qty, unitPrice: it.unitPrice })) })} data-testid={`button-print-labels-${s.id}`}><Printer className="w-4 h-4" /></Button>
                      {s.status !== "returned" && (
                        <Button size="sm" variant="outline" onClick={() => setReturnFor(s.id)} data-testid={`button-return-${s.id}`}>Return</Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {open && <SaleComposer kind="otc" onClose={() => setOpen(false)} />}
      {returnFor !== null && <SaleReturnDialog saleId={returnFor} onClose={() => setReturnFor(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sale return — partial or full, with optional restock.
// ---------------------------------------------------------------------------
function SaleReturnDialog({ saleId, onClose }: { saleId: number; onClose: () => void }) {
  const { data: sale } = useGetPharmacySale(saleId);
  const ret = useReturnPharmacySale();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [qtys, setQtys] = useState<Record<number, number>>({});
  const [restock, setRestock] = useState(true);
  const [reason, setReason] = useState("");

  const items = (sale?.items ?? []).flatMap((it) =>
    it.id == null ? [] : [{
      id: it.id as number,
      drugName: it.drugName,
      qty: it.qty,
      unitPrice: it.unitPrice,
      discount: it.discount ?? 0,
      gstRate: it.gstRate,
    }],
  );
  const lineRefund = (it: { qty: number; unitPrice: number; discount: number; gstRate: number }, q: number) => {
    if (q <= 0) return 0;
    const ratio = q / it.qty;
    const taxable = Math.max(it.qty * it.unitPrice - it.discount, 0) * ratio;
    return Math.round((taxable + (taxable * it.gstRate) / 100) * 100) / 100;
  };
  const totalRefund = items.reduce((sum, it) => sum + lineRefund(it, qtys[it.id] ?? 0), 0);

  const submit = () => {
    const payload = items
      .map((it) => ({ saleItemId: it.id, qty: qtys[it.id] ?? 0, restock }))
      .filter((x) => x.qty > 0);
    if (payload.length === 0) {
      toast({ title: "Enter at least one qty to return", variant: "destructive" });
      return;
    }
    ret.mutate(
      { id: saleId, data: { items: payload, reason: reason || undefined } },
      {
        onSuccess: () => {
          toast({ title: "Return recorded", description: `Refund ${inr(totalRefund)}` });
          [getListPharmacySalesQueryKey(), getListAllBatchesQueryKey(), getGetPharmacyAlertsQueryKey()].forEach((k) =>
            queryClient.invalidateQueries({ queryKey: k }),
          );
          onClose();
        },
        onError: (e: unknown) => toast({ title: "Return failed", description: (e as Error).message, variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Return — {sale?.saleNumber ?? "..."}</DialogTitle>
        </DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Sold</TableHead>
              <TableHead className="text-right">MRP</TableHead>
              <TableHead className="w-32">Return qty</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it) => (
              <TableRow key={it.id}>
                <TableCell>{it.drugName}</TableCell>
                <TableCell className="text-right">{it.qty}</TableCell>
                <TableCell className="text-right">{inr(it.unitPrice)}</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    max={it.qty}
                    value={qtys[it.id] ?? 0}
                    onChange={(e) => setQtys((p) => ({ ...p, [it.id]: Math.max(0, Math.min(it.qty, Number(e.target.value) || 0)) }))}
                    data-testid={`input-return-qty-${it.id}`}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex items-center gap-2">
          <input id="restock" type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
          <Label htmlFor="restock" className="cursor-pointer">Restock returned units back to batch</Label>
        </div>
        <div>
          <Label>Reason (optional)</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. wrong strength, customer changed mind" />
        </div>
        <div className="flex justify-between items-center pt-2 border-t">
          <span className="text-sm text-muted-foreground">Refund</span>
          <span className="font-semibold text-lg">{inr(totalRefund)}</span>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={ret.isPending || totalRefund <= 0} data-testid="button-confirm-return">
            {ret.isPending ? "Processing..." : "Confirm Return"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Reusable sale composer for Rx and OTC. Loads batches per drug picked.
// ---------------------------------------------------------------------------
interface SaleLine {
  drugId: number;
  drugName: string;
  batchId: number;
  batchNo: string;
  mrp: number;
  available: number;
  qty: number;
  discount: number;
  gstRate: number;
}

function SaleComposer({
  kind, patientId, patientName, prescriptionId, drugHint, onClose,
}: {
  kind: "rx" | "otc";
  patientId?: number;
  patientName?: string;
  prescriptionId?: number;
  drugHint?: string;
  onClose: () => void;
}) {
  const { data: drugs } = useListDrugs();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const create = useCreatePharmacySale();

  const [lines, setLines] = useState<SaleLine[]>([]);
  const [drugQuery, setDrugQuery] = useState(drugHint ?? "");
  const [walkIn, setWalkIn] = useState({ name: "", phone: "" });

  const matches = useMemo(() => {
    if (!drugQuery.trim()) return [];
    const q = drugQuery.toLowerCase();
    return (drugs ?? []).filter((d) => d.name.toLowerCase().includes(q) || (d.genericName ?? "").toLowerCase().includes(q)).slice(0, 8);
  }, [drugQuery, drugs]);

  const addDrug = (drugId: number, drugName: string) => {
    setLines((prev) => [...prev, { drugId, drugName, batchId: 0, batchNo: "", mrp: 0, available: 0, qty: 1, discount: 0, gstRate: 12 }]);
    setDrugQuery("");
  };

  const updateLine = (idx: number, patch: Partial<SaleLine>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const totals = useMemo(() => {
    let subtotal = 0, gst = 0;
    for (const l of lines) {
      const taxable = Math.max(l.qty * l.mrp - l.discount, 0);
      subtotal += taxable;
      gst += (taxable * l.gstRate) / 100;
    }
    return { subtotal, gst, total: subtotal + gst };
  }, [lines]);

  const submit = () => {
    const items = lines.filter((l) => l.batchId && l.qty > 0).map((l) => ({
      drugId: l.drugId, batchId: l.batchId, qty: l.qty, discount: l.discount,
    }));
    if (items.length === 0) {
      toast({ title: "Pick a batch and qty", variant: "destructive" });
      return;
    }
    create.mutate(
      {
        data: {
          kind,
          patientId: patientId,
          prescriptionId,
          walkInName: kind === "otc" ? walkIn.name || undefined : undefined,
          walkInPhone: kind === "otc" ? walkIn.phone || undefined : undefined,
          items,
        },
      },
      {
        onSuccess: (sale) => {
          toast({ title: `Sale ${sale.saleNumber} created`, description: sale.billNumber ? `Bill ${sale.billNumber} • ${inr(sale.total)}` : `Total ${inr(sale.total)}` });
          [getListPharmacySalesQueryKey(), getListAllBatchesQueryKey(), getGetPharmacyAlertsQueryKey(), getGetPharmacyQueueQueryKey(), getListPrescriptionsQueryKey()].forEach((k) =>
            queryClient.invalidateQueries({ queryKey: k }),
          );
          onClose();
        },
        onError: (e: unknown) => toast({ title: "Dispense failed", description: (e as Error).message, variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{kind === "rx" ? `Dispense to ${patientName}` : "OTC Sale"}</DialogTitle>
        </DialogHeader>

        {kind === "otc" && (
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Customer name</Label><Input value={walkIn.name} onChange={(e) => setWalkIn({ ...walkIn, name: e.target.value })} placeholder="Walk-in" /></div>
            <div><Label>Phone</Label><Input value={walkIn.phone} onChange={(e) => setWalkIn({ ...walkIn, phone: e.target.value })} placeholder="Optional" /></div>
          </div>
        )}

        <div className="space-y-2">
          <Label>Add drug</Label>
          <Input value={drugQuery} onChange={(e) => setDrugQuery(e.target.value)} placeholder="Search by name or generic..." data-testid="input-drug-search" />
          {matches.length > 0 && (
            <div className="border rounded-md max-h-40 overflow-y-auto">
              {matches.map((d) => (
                <button key={d.id} type="button" className="w-full text-left px-3 py-2 hover:bg-muted text-sm" onClick={() => addDrug(d.id, d.name)} data-testid={`option-drug-${d.id}`}>
                  <span className="font-medium">{d.name}</span>
                  {d.strength && <span className="text-muted-foreground"> • {d.strength}</span>}
                  {d.schedule && d.schedule !== "OTC" && <Badge variant="outline" className="ml-2 text-xs">{d.schedule}</Badge>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          {lines.map((l, i) => (
            <BatchPicker key={i} line={l} idx={i} onUpdate={updateLine} onRemove={() => setLines((p) => p.filter((_, j) => j !== i))} />
          ))}
        </div>

        {lines.length > 0 && (
          <div className="border rounded p-3 bg-muted/30 text-sm space-y-1">
            <div className="flex justify-between"><span>Subtotal</span><span>{inr(totals.subtotal)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>GST</span><span>{inr(totals.gst)}</span></div>
            <div className="flex justify-between font-semibold text-base pt-1 border-t"><span>Total</span><span>{inr(totals.total)}</span></div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending || lines.length === 0} data-testid="button-submit-sale">
            {create.isPending ? "Dispensing…" : "Dispense & Bill"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BatchPicker({ line, idx, onUpdate, onRemove }: { line: SaleLine; idx: number; onUpdate: (i: number, patch: Partial<SaleLine>) => void; onRemove: () => void }) {
  const { data: batches } = useListDrugBatches(line.drugId);
  const available = (batches ?? []).filter((b) => b.qtyOnHand > 0);
  // FEFO: sort by expiry asc and preselect first.
  const sorted = useMemo(() => [...available].sort((a, b) => a.expiry.localeCompare(b.expiry)), [available]);
  // Auto-select first batch when batches load.
  if (!line.batchId && sorted.length > 0) {
    setTimeout(() => onUpdate(idx, { batchId: sorted[0].id, batchNo: sorted[0].batchNo, mrp: sorted[0].mrp, available: sorted[0].qtyOnHand }), 0);
  }
  return (
    <div className="border rounded p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="font-semibold">{line.drugName}</div>
        <Button size="sm" variant="ghost" onClick={onRemove}><Trash2 className="w-4 h-4 text-destructive" /></Button>
      </div>
      {sorted.length === 0 ? (
        <div className="text-sm text-amber-600 flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> No stock available</div>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          <div>
            <Label className="text-xs">Batch (FEFO)</Label>
            <Select value={String(line.batchId)} onValueChange={(v) => {
              const b = sorted.find((x) => x.id === Number(v));
              if (b) onUpdate(idx, { batchId: b.id, batchNo: b.batchNo, mrp: b.mrp, available: b.qtyOnHand });
            }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {sorted.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.batchNo} • exp {b.expiry} • {b.qtyOnHand} units @ {inr(b.mrp)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Qty (max {line.available})</Label>
            <Input type="number" min={1} max={line.available} value={line.qty} onChange={(e) => onUpdate(idx, { qty: Math.min(line.available, Number(e.target.value) || 0) })} />
          </div>
          <div>
            <Label className="text-xs">Discount ₹</Label>
            <Input type="number" min={0} value={line.discount} onChange={(e) => onUpdate(idx, { discount: Number(e.target.value) || 0 })} />
          </div>
          <div className="flex flex-col justify-end text-sm">
            <div className="text-muted-foreground text-xs">MRP {inr(line.mrp)}</div>
            <div className="font-semibold">{inr(Math.max(line.qty * line.mrp - line.discount, 0) * (1 + line.gstRate / 100))}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stock tab — batches with FEFO sort + return-sale.
// ---------------------------------------------------------------------------
function StockTab() {
  const { data: batches, isLoading } = useListAllBatches();
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Batch-wise Stock</CardTitle></CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Drug</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">MRP</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead>Location</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={7} className="text-center py-6">Loading…</TableCell></TableRow>
              : batches?.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No stock — record a GRN to receive inventory.</TableCell></TableRow>
              : batches?.map((b) => (
                <TableRow key={b.id} className={(b.daysToExpiry ?? 999) < 30 ? "bg-amber-500/5" : undefined}>
                  <TableCell className="font-medium">{b.drugName}</TableCell>
                  <TableCell className="font-mono text-xs">{b.batchNo}</TableCell>
                  <TableCell>{b.expiry} <span className="text-xs text-muted-foreground">({b.daysToExpiry ?? "?"}d)</span></TableCell>
                  <TableCell className="text-right">{b.qtyOnHand}</TableCell>
                  <TableCell className="text-right">{inr(b.mrp)}</TableCell>
                  <TableCell className="text-right">{inr(b.costPerUnit)}</TableCell>
                  <TableCell>{b.location ?? "-"}</TableCell>
                </TableRow>
              ))
            }
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Purchases tab — suppliers, PO, GRN
// ---------------------------------------------------------------------------
function PurchasesTab() {
  const { data: suppliers } = useListSuppliers();
  const { data: pos } = useListPurchaseOrders();
  const { data: grns } = useListGrns();
  const { data: drugs } = useListDrugs();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createSupplier = useCreateSupplier();
  const createPo = useCreatePurchaseOrder();
  const createGrn = useCreateGrn();

  const [supplierOpen, setSupplierOpen] = useState(false);
  const [poOpen, setPoOpen] = useState(false);
  const [grnOpen, setGrnOpen] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: "", gstin: "", phone: "", email: "" });
  const [poForm, setPoForm] = useState<{ supplierId: number | null; notes: string; items: { drugId: number; qty: number; costPerUnit: number }[] }>({ supplierId: null, notes: "", items: [] });
  const [grnForm, setGrnForm] = useState<{ supplierId: number | null; poId: number | null; invoiceNumber: string; invoiceDate: string; items: { drugId: number; batchNo: string; expiry: string; qty: number; costPerUnit: number; mrp: number; location: string }[] }>({ supplierId: null, poId: null, invoiceNumber: "", invoiceDate: "", items: [] });

  const submitSupplier = () => {
    if (!newSupplier.name) { toast({ title: "Name required", variant: "destructive" }); return; }
    createSupplier.mutate({ data: newSupplier }, {
      onSuccess: () => {
        toast({ title: "Supplier added" });
        queryClient.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
        setSupplierOpen(false); setNewSupplier({ name: "", gstin: "", phone: "", email: "" });
      },
    });
  };

  const submitPo = () => {
    if (!poForm.supplierId || poForm.items.length === 0) { toast({ title: "Supplier and items required", variant: "destructive" }); return; }
    createPo.mutate({ data: { supplierId: poForm.supplierId, notes: poForm.notes, items: poForm.items } }, {
      onSuccess: () => {
        toast({ title: "PO created" });
        queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
        setPoOpen(false); setPoForm({ supplierId: null, notes: "", items: [] });
      },
    });
  };

  const submitGrn = () => {
    if (!grnForm.supplierId || grnForm.items.length === 0) { toast({ title: "Supplier and items required", variant: "destructive" }); return; }
    createGrn.mutate({ data: { ...grnForm, supplierId: grnForm.supplierId, poId: grnForm.poId ?? undefined } }, {
      onSuccess: (g) => {
        toast({ title: `GRN ${g.grnNumber} received`, description: `Landed cost ${inr(g.landedCost)}` });
        [getListGrnsQueryKey(), getListAllBatchesQueryKey(), getGetPharmacyAlertsQueryKey(), getListPurchaseOrdersQueryKey(),
         ...grnForm.items.map((it) => getListDrugBatchesQueryKey(it.drugId))].forEach((k) => queryClient.invalidateQueries({ queryKey: k }));
        setGrnOpen(false); setGrnForm({ supplierId: null, poId: null, invoiceNumber: "", invoiceDate: "", items: [] });
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Suppliers */}
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Suppliers</CardTitle>
          <Dialog open={supplierOpen} onOpenChange={setSupplierOpen}>
            <DialogTrigger asChild><Button size="sm" data-testid="button-add-supplier"><Plus className="w-4 h-4 mr-1" /> Supplier</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Supplier</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name *</Label><Input value={newSupplier.name} onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>GSTIN</Label><Input value={newSupplier.gstin} onChange={(e) => setNewSupplier({ ...newSupplier, gstin: e.target.value })} /></div>
                  <div><Label>Phone</Label><Input value={newSupplier.phone} onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })} /></div>
                </div>
                <div><Label>Email</Label><Input value={newSupplier.email} onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={submitSupplier}>Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>GSTIN</TableHead><TableHead>Phone</TableHead><TableHead>Email</TableHead></TableRow></TableHeader>
            <TableBody>
              {suppliers?.length === 0
                ? <TableRow><TableCell colSpan={4} className="text-center py-4 text-muted-foreground">No suppliers</TableCell></TableRow>
                : suppliers?.map((s) => (
                  <TableRow key={s.id}><TableCell className="font-medium">{s.name}</TableCell><TableCell className="font-mono text-xs">{s.gstin ?? "-"}</TableCell><TableCell>{s.phone ?? "-"}</TableCell><TableCell>{s.email ?? "-"}</TableCell></TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Purchase Orders */}
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Purchase Orders</CardTitle>
          <Dialog open={poOpen} onOpenChange={setPoOpen}>
            <DialogTrigger asChild><Button size="sm" data-testid="button-new-po"><Plus className="w-4 h-4 mr-1" /> New PO</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>New Purchase Order</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Supplier</Label>
                  <Select value={poForm.supplierId ? String(poForm.supplierId) : ""} onValueChange={(v) => setPoForm({ ...poForm, supplierId: Number(v) })}>
                    <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                    <SelectContent>{suppliers?.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <ItemEditor
                  drugs={drugs ?? []}
                  items={poForm.items as unknown as EditorItem[]}
                  onChange={(items) => setPoForm({ ...poForm, items: items as unknown as typeof poForm.items })}
                  fields={["qty", "cost"]}
                />
                <div><Label>Notes</Label><Textarea value={poForm.notes} onChange={(e) => setPoForm({ ...poForm, notes: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={submitPo} disabled={createPo.isPending}>{createPo.isPending ? "Creating…" : "Create PO"}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>PO #</TableHead><TableHead>Supplier</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Items</TableHead><TableHead className="text-right">Expected</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
            <TableBody>
              {pos?.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-4 text-muted-foreground">No POs</TableCell></TableRow>
                : pos?.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.poNumber}</TableCell>
                    <TableCell>{p.supplierName}</TableCell>
                    <TableCell><Badge variant={p.status === "received" ? "default" : "secondary"}>{p.status}</Badge></TableCell>
                    <TableCell className="text-right">{p.items.length}</TableCell>
                    <TableCell className="text-right">{inr(p.expectedAmount)}</TableCell>
                    <TableCell>{new Date(p.createdAt).toLocaleDateString("en-IN")}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* GRNs */}
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Truck className="w-4 h-4" /> Goods Received Notes</CardTitle>
          <Dialog open={grnOpen} onOpenChange={setGrnOpen}>
            <DialogTrigger asChild><Button size="sm" data-testid="button-new-grn"><Plus className="w-4 h-4 mr-1" /> Receive Stock</Button></DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>New GRN — Receive Stock</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Supplier *</Label>
                    <Select value={grnForm.supplierId ? String(grnForm.supplierId) : ""} onValueChange={(v) => setGrnForm({ ...grnForm, supplierId: Number(v) })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{suppliers?.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Against PO (optional)</Label>
                    <Select value={grnForm.poId ? String(grnForm.poId) : ""} onValueChange={(v) => setGrnForm({ ...grnForm, poId: v ? Number(v) : null })}>
                      <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>{pos?.filter((p) => p.status !== "received").map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.poNumber} — {p.supplierName}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Invoice #</Label><Input value={grnForm.invoiceNumber} onChange={(e) => setGrnForm({ ...grnForm, invoiceNumber: e.target.value })} /></div>
                  <div><Label>Invoice Date</Label><Input type="date" value={grnForm.invoiceDate} onChange={(e) => setGrnForm({ ...grnForm, invoiceDate: e.target.value })} /></div>
                </div>
                <ItemEditor
                  drugs={drugs ?? []}
                  items={grnForm.items as unknown as EditorItem[]}
                  onChange={(items) => setGrnForm({ ...grnForm, items: items as unknown as typeof grnForm.items })}
                  fields={["batch", "expiry", "qty", "cost", "mrp", "location"]}
                />
              </div>
              <DialogFooter><Button onClick={submitGrn} disabled={createGrn.isPending}>{createGrn.isPending ? "Receiving…" : "Receive Stock"}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>GRN #</TableHead><TableHead>Supplier</TableHead><TableHead>Invoice</TableHead><TableHead className="text-right">Items</TableHead><TableHead className="text-right">Landed</TableHead><TableHead>Received</TableHead></TableRow></TableHeader>
            <TableBody>
              {grns?.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-4 text-muted-foreground">No GRNs</TableCell></TableRow>
                : grns?.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-mono text-xs">{g.grnNumber}</TableCell>
                    <TableCell>{g.supplierName}</TableCell>
                    <TableCell>{g.invoiceNumber ?? "-"}</TableCell>
                    <TableCell className="text-right">{g.items.length}</TableCell>
                    <TableCell className="text-right">{inr(g.landedCost)}</TableCell>
                    <TableCell>{new Date(g.receivedAt).toLocaleDateString("en-IN")}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// Reusable item grid editor (PO or GRN). `fields` controls visible columns.
type EditorItem = Record<string, unknown>;
function ItemEditor({
  drugs, items, onChange, fields,
}: {
  drugs: { id: number; name: string; mrp?: number | null; gstRate: number }[];
  items: EditorItem[];
  onChange: (items: EditorItem[]) => void;
  fields: ("batch" | "expiry" | "qty" | "cost" | "mrp" | "location")[];
}) {
  const add = () => {
    const blank: EditorItem = { drugId: 0, qty: 1, costPerUnit: 0 };
    if (fields.includes("batch")) blank.batchNo = "";
    if (fields.includes("expiry")) blank.expiry = "";
    if (fields.includes("mrp")) blank.mrp = 0;
    if (fields.includes("location")) blank.location = "";
    onChange([...items, blank]);
  };
  const upd = (i: number, patch: EditorItem) => onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const rm = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <Label>Items</Label>
        <Button type="button" size="sm" variant="outline" onClick={add}><Plus className="w-3 h-3 mr-1" /> Line</Button>
      </div>
      {items.length === 0 ? <p className="text-xs text-muted-foreground">No lines yet — click "Line" to add.</p> : items.map((it, i) => (
        <div key={i} className="border rounded p-2 grid grid-cols-12 gap-2 items-end">
          <div className="col-span-3">
            <Label className="text-xs">Drug</Label>
            <Select value={String(it.drugId || "")} onValueChange={(v) => {
              const d = drugs.find((x) => x.id === Number(v));
              upd(i, { drugId: Number(v), ...(fields.includes("mrp") && d?.mrp ? { mrp: d.mrp } : {}) });
            }}>
              <SelectTrigger><SelectValue placeholder="Drug" /></SelectTrigger>
              <SelectContent>{drugs.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {fields.includes("batch") && <div className="col-span-2"><Label className="text-xs">Batch #</Label><Input value={String(it.batchNo ?? "")} onChange={(e) => upd(i, { batchNo: e.target.value })} /></div>}
          {fields.includes("expiry") && <div className="col-span-2"><Label className="text-xs">Expiry</Label><Input type="date" value={String(it.expiry ?? "")} onChange={(e) => upd(i, { expiry: e.target.value })} /></div>}
          <div className="col-span-1"><Label className="text-xs">Qty</Label><Input type="number" min={1} value={Number(it.qty ?? 0)} onChange={(e) => upd(i, { qty: Number(e.target.value) || 0 })} /></div>
          <div className="col-span-1"><Label className="text-xs">Cost</Label><Input type="number" step="0.01" value={Number(it.costPerUnit ?? 0)} onChange={(e) => upd(i, { costPerUnit: Number(e.target.value) || 0 })} /></div>
          {fields.includes("mrp") && <div className="col-span-1"><Label className="text-xs">MRP</Label><Input type="number" step="0.01" value={Number(it.mrp ?? 0)} onChange={(e) => upd(i, { mrp: Number(e.target.value) || 0 })} /></div>}
          {fields.includes("location") && <div className="col-span-1"><Label className="text-xs">Loc</Label><Input value={String(it.location ?? "")} onChange={(e) => upd(i, { location: e.target.value })} /></div>}
          <div className="col-span-1 flex justify-end"><Button size="sm" variant="ghost" type="button" onClick={() => rm(i)}><Trash2 className="w-4 h-4 text-destructive" /></Button></div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alerts tab
// ---------------------------------------------------------------------------
function AlertsTab() {
  const { data: alerts, isLoading } = useGetPharmacyAlerts();
  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /> Low Stock</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Drug</TableHead><TableHead className="text-right">On hand</TableHead><TableHead className="text-right">Reorder ≤</TableHead></TableRow></TableHeader>
            <TableBody>
              {alerts?.lowStock.length === 0 ? <TableRow><TableCell colSpan={3} className="text-center py-4 text-muted-foreground">All stocked above reorder level</TableCell></TableRow>
                : alerts?.lowStock.map((r) => <TableRow key={r.drugId}><TableCell>{r.drugName}</TableCell><TableCell className="text-right font-semibold text-amber-700">{r.totalQty}</TableCell><TableCell className="text-right">{r.reorderLevel}</TableCell></TableRow>)}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-500" /> Near Expiry (90 days)</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Drug</TableHead><TableHead>Batch</TableHead><TableHead>Expiry</TableHead><TableHead className="text-right">Qty</TableHead></TableRow></TableHeader>
            <TableBody>
              {alerts?.nearExpiry.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center py-4 text-muted-foreground">Nothing expiring soon</TableCell></TableRow>
                : alerts?.nearExpiry.map((b) => <TableRow key={b.id}><TableCell>{b.drugName}</TableCell><TableCell className="font-mono text-xs">{b.batchNo}</TableCell><TableCell>{b.expiry} <span className="text-xs text-muted-foreground">({b.daysToExpiry}d)</span></TableCell><TableCell className="text-right">{b.qtyOnHand}</TableCell></TableRow>)}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reports tab — stock value, movers, supplier purchases.
// ---------------------------------------------------------------------------
function ReportsTab() {
  const [moversOrder, setMoversOrder] = useState<"desc" | "asc">("desc");
  const { data: stock } = useGetStockValueReport();
  const { data: movers } = useGetMoversReport({ limit: 10, order: moversOrder });
  const { data: purchases } = useGetSupplierPurchasesReport();
  const totalCost = (stock ?? []).reduce((s, r) => s + r.costValue, 0);
  const totalMrp = (stock ?? []).reduce((s, r) => s + r.mrpValue, 0);
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Stock value at cost</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{inr(totalCost)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Stock value at MRP</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{inr(totalMrp)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Potential margin</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-green-600">{inr(totalMrp - totalCost)}</div></CardContent></Card>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-4 h-4" /> {moversOrder === "desc" ? "Top Movers" : "Slow Movers"}</CardTitle>
            <div className="flex gap-1">
              <Button size="sm" variant={moversOrder === "desc" ? "default" : "outline"} onClick={() => setMoversOrder("desc")} data-testid="button-movers-top">Top</Button>
              <Button size="sm" variant={moversOrder === "asc" ? "default" : "outline"} onClick={() => setMoversOrder("asc")} data-testid="button-movers-slow">Slow</Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Drug</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Sales</TableHead></TableRow></TableHeader>
              <TableBody>
                {movers?.length === 0 ? <TableRow><TableCell colSpan={3} className="text-center py-4 text-muted-foreground">No sales yet</TableCell></TableRow>
                  : movers?.map((m) => <TableRow key={m.drugId}><TableCell>{m.drugName}</TableCell><TableCell className="text-right">{m.qtyDispensed}</TableCell><TableCell className="text-right">{inr(m.salesValue)}</TableCell></TableRow>)}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4" /> Supplier Purchases</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Supplier</TableHead><TableHead className="text-right">GRNs</TableHead><TableHead className="text-right">Total Cost</TableHead></TableRow></TableHeader>
              <TableBody>
                {purchases?.length === 0 ? <TableRow><TableCell colSpan={3} className="text-center py-4 text-muted-foreground">No purchases yet</TableCell></TableRow>
                  : purchases?.map((p) => <TableRow key={p.supplierId}><TableCell>{p.supplierName}</TableCell><TableCell className="text-right">{p.grnCount}</TableCell><TableCell className="text-right">{inr(p.totalCost)}</TableCell></TableRow>)}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------
export default function Pharmacy() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ShieldPlus className="w-6 h-6 text-primary" />
          Pharmacy
        </h1>
        <p className="text-muted-foreground">Dispense Rx, OTC sales, batch-tracked stock, purchases, and reports.</p>
      </div>
      <Tabs defaultValue="dispense" className="space-y-4">
        <TabsList>
          <TabsTrigger value="dispense" data-testid="tab-dispense">Dispense</TabsTrigger>
          <TabsTrigger value="otc" data-testid="tab-otc">OTC</TabsTrigger>
          <TabsTrigger value="stock" data-testid="tab-stock"><Package className="w-4 h-4 mr-1" /> Stock</TabsTrigger>
          <TabsTrigger value="purchases" data-testid="tab-purchases"><Truck className="w-4 h-4 mr-1" /> Purchases</TabsTrigger>
          <TabsTrigger value="alerts" data-testid="tab-alerts"><AlertTriangle className="w-4 h-4 mr-1" /> Alerts</TabsTrigger>
          <TabsTrigger value="reports" data-testid="tab-reports"><TrendingUp className="w-4 h-4 mr-1" /> Reports</TabsTrigger>
        </TabsList>
        <TabsContent value="dispense"><DispenseTab /></TabsContent>
        <TabsContent value="otc"><OtcTab /></TabsContent>
        <TabsContent value="stock"><StockTab /></TabsContent>
        <TabsContent value="purchases"><PurchasesTab /></TabsContent>
        <TabsContent value="alerts"><AlertsTab /></TabsContent>
        <TabsContent value="reports"><ReportsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
