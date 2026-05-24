import { useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/primitives/empty-state";
import { Receipt, FileText, CreditCard, ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react";
import { PortalShell, useApi, portalApi, fmtDate, fmtDateTime, formatINR } from "./portal-shell";

type Bill = {
  id: number; billNumber: string; status: string;
  subtotal?: number; discount?: number; tax?: number; total: number;
  paidAmount?: number; refundedAmount?: number; gstMode?: string | null;
  createdAt: string;
  items?: BillItem[];
};
type BillItem = {
  description: string; quantity: number; unitPrice: number;
  gstRate?: number; discount?: number; cgst?: number; sgst?: number; igst?: number;
};
type Payment = {
  id: number; receiptNumber: string; amount: number; mode: string;
  reference: string | null; receivedAt: string; receiptPdfUrl: string;
};
type BillDetail = { bill: Bill; payments: Payment[] };

function balanceOf(b: Bill): number {
  return Math.max(0, b.total - (b.paidAmount ?? 0) + (b.refundedAmount ?? 0));
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    paid: "bg-success/10 text-success border-success/30",
    partial: "bg-warning/10 text-warning border-warning/30",
    unpaid: "bg-destructive/10 text-destructive border-destructive/30",
    void: "bg-muted text-muted-foreground",
  };
  return map[status] ?? "bg-muted text-muted-foreground";
}

// ============================================================================
// Bills list
// ============================================================================
export function PortalBills() {
  const { data, loading } = useApi<Bill[]>("/portal/bills", []);
  return (
    <PortalShell active="bills">
      <h1 className="text-2xl font-bold tracking-tight mb-4">My Bills</h1>
      <Card className="border-card-border shadow-sm">
        <CardContent className="space-y-3 pt-6">
          {loading && <Skeleton className="h-32 w-full" />}
          {!loading && data && data.length === 0 && (
            <EmptyState icon={Receipt} title="No bills yet" description="Your invoices and receipts will appear here." />
          )}
          {data?.map((b) => {
            const bal = balanceOf(b);
            return (
              <Link key={b.id} href={`/portal/bills/${b.id}`}>
                <div className="flex items-center justify-between border border-border rounded-lg p-4 hover:bg-muted/40 transition cursor-pointer">
                  <div className="min-w-0">
                    <div className="font-mono font-semibold text-sm">{b.billNumber}</div>
                    <div className="text-xs text-muted-foreground">{fmtDate(b.createdAt)}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="font-mono font-bold tabular-nums">{formatINR(b.total)}</div>
                      {bal > 0 && <div className="text-xs text-warning">{formatINR(bal)} due</div>}
                    </div>
                    <Badge variant="outline" className={`${statusBadge(b.status)} capitalize`}>{b.status}</Badge>
                  </div>
                </div>
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </PortalShell>
  );
}

// ============================================================================
// Bill detail (itemized invoice, payments timeline, online pay)
// ============================================================================
export function PortalBillDetail() {
  const [, params] = useRoute<{ id: string }>("/portal/bills/:id");
  const id = Number(params?.id);
  const { data, loading, error, setData } = useApi<BillDetail>(id ? `/portal/bills/${id}` : null, [id]);
  const [payOpen, setPayOpen] = useState(false);

  if (error) {
    return (
      <PortalShell active="bills">
        <Card><CardContent className="py-8 text-center text-destructive">{error}</CardContent></Card>
      </PortalShell>
    );
  }

  const bill = data?.bill;
  const balance = bill ? balanceOf(bill) : 0;

  return (
    <PortalShell active="bills">
      <Link href="/portal/bills"><Button variant="ghost" size="sm" className="mb-3"><ArrowLeft className="w-4 h-4 mr-1" /> All bills</Button></Link>

      {loading && <Skeleton className="h-96 w-full" />}

      {bill && (
        <div className="space-y-4">
          <Card className="border-card-border shadow-sm">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="font-mono">{bill.billNumber}</CardTitle>
                  <div className="text-sm text-muted-foreground mt-1">Issued {fmtDate(bill.createdAt)}{bill.gstMode ? ` · ${bill.gstMode.toUpperCase()} GST` : ""}</div>
                </div>
                <Badge variant="outline" className={`${statusBadge(bill.status)} capitalize`}>{bill.status}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-3">Description</th>
                      <th className="text-right py-2 pr-3">Qty</th>
                      <th className="text-right py-2 pr-3">Unit</th>
                      <th className="text-right py-2 pr-3">GST</th>
                      <th className="text-right py-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(bill.items ?? []).map((it, idx) => {
                      const line = it.unitPrice * it.quantity - (it.discount ?? 0);
                      return (
                        <tr key={idx} className="border-b border-border/50">
                          <td className="py-2 pr-3">{it.description}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{it.quantity}</td>
                          <td className="py-2 pr-3 text-right tabular-nums font-mono">{formatINR(it.unitPrice)}</td>
                          <td className="py-2 pr-3 text-right text-xs text-muted-foreground">{it.gstRate != null ? `${it.gstRate}%` : "—"}</td>
                          <td className="py-2 text-right tabular-nums font-mono">{formatINR(line)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-sm max-w-sm ml-auto">
                {bill.subtotal != null && (
                  <><div className="text-muted-foreground">Subtotal</div><div className="text-right tabular-nums font-mono">{formatINR(bill.subtotal)}</div></>
                )}
                {bill.discount != null && bill.discount > 0 && (
                  <><div className="text-muted-foreground">Discount</div><div className="text-right tabular-nums font-mono text-success">−{formatINR(bill.discount)}</div></>
                )}
                {bill.tax != null && bill.tax > 0 && (
                  <><div className="text-muted-foreground">GST</div><div className="text-right tabular-nums font-mono">{formatINR(bill.tax)}</div></>
                )}
                <div className="font-semibold border-t border-border pt-2">Total</div>
                <div className="text-right tabular-nums font-mono font-bold border-t border-border pt-2">{formatINR(bill.total)}</div>
                <div className="text-muted-foreground">Paid</div>
                <div className="text-right tabular-nums font-mono">{formatINR(bill.paidAmount ?? 0)}</div>
                {(bill.refundedAmount ?? 0) > 0 && (
                  <><div className="text-muted-foreground">Refunded</div><div className="text-right tabular-nums font-mono">{formatINR(bill.refundedAmount ?? 0)}</div></>
                )}
                <div className="font-semibold">Balance due</div>
                <div className="text-right tabular-nums font-mono font-bold text-warning">{formatINR(balance)}</div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2 justify-end">
                <a href={`/api/portal/bills/${bill.id}/invoice.pdf`} target="_blank" rel="noreferrer">
                  <Button variant="outline"><FileText className="w-4 h-4 mr-1.5" /> Invoice PDF</Button>
                </a>
                {balance > 0.005 && bill.status !== "void" && (
                  <Button className="bg-brand-gradient text-white" onClick={() => setPayOpen(true)}>
                    <CreditCard className="w-4 h-4 mr-1.5" /> Pay {formatINR(balance)}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-card-border shadow-sm">
            <CardHeader><CardTitle className="text-base">Payment history</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {data!.payments.length === 0 && <div className="text-sm text-muted-foreground">No payments yet.</div>}
              {data!.payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between border border-border rounded-lg p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                    <div className="min-w-0">
                      <div className="font-mono text-sm font-semibold">{p.receiptNumber}</div>
                      <div className="text-xs text-muted-foreground">{fmtDateTime(p.receivedAt)} · {p.mode.toUpperCase()}{p.reference ? ` · ${p.reference}` : ""}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="font-mono font-bold tabular-nums">{formatINR(p.amount)}</div>
                    <a href={p.receiptPdfUrl} target="_blank" rel="noreferrer">
                      <Button variant="outline" size="sm"><FileText className="w-3 h-3 mr-1" /> Receipt</Button>
                    </a>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {bill && (
        <PayDialog
          open={payOpen}
          onClose={() => setPayOpen(false)}
          balance={balance}
          billId={bill.id}
          onPaid={(updated) => {
            setData(updated);
            setPayOpen(false);
          }}
          refetchUrl={`/portal/bills/${bill.id}`}
        />
      )}
    </PortalShell>
  );
}

function PayDialog({
  open, onClose, billId, balance, onPaid, refetchUrl,
}: {
  open: boolean;
  onClose: () => void;
  billId: number;
  balance: number;
  onPaid: (d: BillDetail) => void;
  refetchUrl: string;
}) {
  const [mode, setMode] = useState<"upi" | "card" | "netbanking">("upi");
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ receiptNumber: string; pdfUrl: string } | null>(null);
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (open) { setMode("upi"); setReference(""); setAmount(balance.toFixed(2)); setErr(null); setDone(null); }
  }, [open, balance]);

  async function submit() {
    setErr(null); setBusy(true);
    try {
      const amt = Number(amount);
      if (!isFinite(amt) || amt <= 0) throw new Error("Enter a valid amount");
      const r = await portalApi<{ receiptNumber: string; receiptPdfUrl: string }>(`/portal/bills/${billId}/pay`, {
        method: "POST",
        body: JSON.stringify({ amount: amt, mode, reference: reference || undefined }),
      });
      setDone({ receiptNumber: r.receiptNumber, pdfUrl: r.receiptPdfUrl });
      // Refresh bill detail
      const fresh = await portalApi<BillDetail>(refetchUrl);
      onPaid(fresh);
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  }

  if (done) {
    return (
      <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setLocation(`/portal/bills/${billId}`); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-success"><CheckCircle2 className="w-5 h-5" /> Payment successful</DialogTitle>
            <DialogDescription>Receipt {done.receiptNumber} has been issued.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <a href={done.pdfUrl} target="_blank" rel="noreferrer">
              <Button variant="outline"><FileText className="w-4 h-4 mr-1.5" /> Download receipt</Button>
            </a>
            <Button onClick={onClose}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pay bill online</DialogTitle>
          <DialogDescription>Outstanding balance: <strong className="font-mono">{formatINR(balance)}</strong>. This is a demo gateway — no real charge is made.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Method</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="upi">UPI</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="netbanking">Net banking</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Amount (₹)</Label>
            <Input type="number" step="0.01" min="0.01" max={balance} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>Reference (optional)</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UPI ref / last 4 of card" maxLength={120} />
          </div>
          {err && <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded-md flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><span>{err}</span>
          </div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-brand-gradient text-white" onClick={submit} disabled={busy}>
            {busy ? "Processing…" : `Pay ${formatINR(Number(amount) || 0)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
