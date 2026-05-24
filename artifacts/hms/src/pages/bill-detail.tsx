import { useMemo, useState } from "react";
import { useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetBillFull,
  useRecordPayment,
  useRecordRefund,
  useVoidBill,
  useUpdateBillClaim,
  getGetBillFullQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, IndianRupee, Receipt, RefreshCcw, Ban, ShieldCheck, Printer,
} from "lucide-react";

function inr(n: number | string | undefined | null) {
  const v = typeof n === "number" ? n : Number(n ?? 0);
  return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const statusTone: Record<string, string> = {
  paid: "bg-success/10 text-success border-success/30",
  partial: "bg-warning/10 text-warning border-warning/30",
  unpaid: "bg-destructive/10 text-destructive border-destructive/30",
  refunded: "bg-muted text-muted-foreground",
  void: "bg-muted text-muted-foreground line-through",
};

export default function BillDetail() {
  const { id } = useParams<{ id: string }>();
  const billId = Number(id);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useGetBillFull(billId, {
    query: { enabled: !!billId, queryKey: getGetBillFullQueryKey(billId) },
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: getGetBillFullQueryKey(billId) });
  }

  if (isLoading) return <div className="p-6"><Skeleton className="h-[600px] w-full max-w-4xl mx-auto" /></div>;
  if (!data) return <div className="p-6">Bill not found</div>;

  const { bill, payments, refunds } = data;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center gap-3 justify-between print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{bill.billNumber}</h1>
            <Badge variant="outline" className={statusTone[bill.status] ?? ""}>{bill.status.toUpperCase()}</Badge>
            {bill.claimStatus !== "none" && (
              <Badge variant="outline" className="bg-blue-50 border-blue-200 text-blue-700">
                Claim: {bill.claimStatus}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{bill.patientName} • {new Date(bill.createdAt).toLocaleString("en-IN")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href={`/api/pdf/invoice/${bill.id}`} target="_blank" rel="noopener noreferrer">
              <Printer className="w-4 h-4 mr-2" /> Invoice PDF
            </a>
          </Button>
          <PaymentDialog billId={billId} balance={bill.balance} disabled={bill.status === "void" || bill.balance <= 0} onDone={refresh} />
          <RefundDialog billId={billId} refundable={bill.paidAmount - bill.refundedAmount} disabled={bill.status === "void"} payments={payments} onDone={refresh} />
          <VoidDialog billId={billId} disabled={bill.status === "void" || bill.paidAmount - bill.refundedAmount > 0} onDone={refresh} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Summary label="Grand Total" value={inr(bill.total)} icon={IndianRupee} />
        <Summary label="Paid" value={inr(bill.paidAmount)} icon={Receipt} tone="success" />
        <Summary label="Refunded" value={inr(bill.refundedAmount)} icon={RefreshCcw} tone="warning" />
        <Summary label="Balance" value={inr(bill.balance)} icon={IndianRupee} tone={bill.balance > 0 ? "danger" : "muted"} />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Line Items</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground border-y border-border">
              <tr>
                <th className="py-2 px-4 text-left">Service</th>
                <th className="py-2 px-3 text-right">Qty</th>
                <th className="py-2 px-3 text-right">Rate</th>
                <th className="py-2 px-3 text-right">Disc</th>
                <th className="py-2 px-3 text-right">GST%</th>
                <th className="py-2 px-4 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bill.items.map((it, i) => (
                <tr key={i}>
                  <td className="py-2 px-4">
                    <div className="font-medium">{it.description}</div>
                    {it.serviceCode && <div className="text-[11px] text-muted-foreground font-mono">{it.serviceCode}</div>}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums">{it.quantity}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{inr(it.unitPrice)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{it.discount ? inr(it.discount) : "—"}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{it.gstRate ?? 0}%</td>
                  <td className="py-2 px-4 text-right tabular-nums font-medium">{inr(it.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="text-sm">
              <tr><td colSpan={5} className="px-4 py-1 text-right text-muted-foreground">Subtotal</td><td className="px-4 py-1 text-right">{inr(bill.subtotal)}</td></tr>
              {bill.discount > 0 && <tr><td colSpan={5} className="px-4 py-1 text-right text-muted-foreground">Discount</td><td className="px-4 py-1 text-right">− {inr(bill.discount)}</td></tr>}
              {bill.cgst > 0 && <tr><td colSpan={5} className="px-4 py-1 text-right text-muted-foreground">CGST</td><td className="px-4 py-1 text-right">{inr(bill.cgst)}</td></tr>}
              {bill.sgst > 0 && <tr><td colSpan={5} className="px-4 py-1 text-right text-muted-foreground">SGST</td><td className="px-4 py-1 text-right">{inr(bill.sgst)}</td></tr>}
              {bill.igst > 0 && <tr><td colSpan={5} className="px-4 py-1 text-right text-muted-foreground">IGST</td><td className="px-4 py-1 text-right">{inr(bill.igst)}</td></tr>}
              <tr className="font-bold border-t border-border"><td colSpan={5} className="px-4 py-2 text-right">Grand Total</td><td className="px-4 py-2 text-right text-primary">{inr(bill.total)}</td></tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Payment Timeline</CardTitle></CardHeader>
          <CardContent className="p-0">
            {payments.length === 0 && refunds.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center">No payments or refunds yet.</div>
            ) : (
              <ul className="divide-y divide-border">
                {payments.map((p) => (
                  <li key={`p-${p.id}`} className="flex items-center justify-between p-3">
                    <div>
                      <div className="text-sm font-medium">{inr(p.amount)} <span className="text-muted-foreground font-normal">via {p.mode.toUpperCase()}</span></div>
                      <div className="text-[11px] text-muted-foreground">
                        {new Date(p.receivedAt).toLocaleString("en-IN")} • {p.receiptNumber}
                        {p.receivedBy ? ` • ${p.receivedBy}` : ""}
                        {p.reference ? ` • Ref ${p.reference}` : ""}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" asChild>
                      <a href={`/api/pdf/receipt/${p.id}`} target="_blank" rel="noopener noreferrer">
                        <FileText className="w-4 h-4 mr-1" /> Receipt
                      </a>
                    </Button>
                  </li>
                ))}
                {refunds.map((r) => (
                  <li key={`r-${r.id}`} className="p-3">
                    <div className="text-sm font-medium text-warning">− {inr(r.amount)} refund <span className="text-muted-foreground font-normal">via {r.mode.toUpperCase()}</span></div>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(r.refundedAt).toLocaleString("en-IN")} • {r.reason}{r.approvedBy ? ` • ${r.approvedBy}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <ClaimCard
          billId={billId}
          claimStatus={bill.claimStatus}
          claimAmount={bill.claimAmount}
          tpa={bill.tpa ?? ""}
          policyNumber={bill.policyNumber ?? ""}
          preAuthCode={bill.preAuthCode ?? ""}
          insurer={bill.insuranceProvider ?? ""}
          onDone={refresh}
        />
      </div>
    </div>
  );
}

function Summary({ label, value, icon: Icon, tone = "primary" }: { label: string; value: string; icon: React.ComponentType<{ className?: string }>; tone?: "primary" | "success" | "warning" | "danger" | "muted" }) {
  const tones: Record<string, string> = {
    primary: "text-primary bg-primary/10",
    success: "text-success bg-success/10",
    warning: "text-warning bg-warning/10",
    danger: "text-destructive bg-destructive/10",
    muted: "text-muted-foreground bg-muted",
  };
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-9 h-9 rounded-md flex items-center justify-center ${tones[tone]}`}><Icon className="w-4 h-4" /></div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="text-lg font-bold tabular-nums">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

const PAYMENT_MODES = ["cash", "card", "upi", "netbanking", "cheque", "insurance"];

function PaymentDialog({ billId, balance, disabled, onDone }: { billId: number; balance: number; disabled: boolean; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(balance.toFixed(2));
  const [mode, setMode] = useState("cash");
  const [tendered, setTendered] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const mut = useRecordPayment();
  const change = useMemo(() => {
    const t = Number(tendered);
    const a = Number(amount);
    if (!Number.isFinite(t) || !Number.isFinite(a) || t <= 0) return 0;
    return Math.max(0, Math.round((t - a) * 100) / 100);
  }, [tendered, amount]);
  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) setAmount(balance.toFixed(2)); }}>
      <DialogTrigger asChild>
        <Button disabled={disabled} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          <IndianRupee className="w-4 h-4 mr-1" /> Record Payment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Amount (₹)</Label><Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div>
            <Label>Mode</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PAYMENT_MODES.map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {mode === "cash" && (
            <div>
              <Label>Tendered (₹) <span className="text-muted-foreground text-xs">optional · for cash over-tender</span></Label>
              <Input type="number" min={0} step="0.01" value={tendered} onChange={(e) => setTendered(e.target.value)} placeholder="What the customer handed over" />
              {Number(tendered) > 0 && <p className="text-xs mt-1">Change due: <strong>{inr(change)}</strong></p>}
            </div>
          )}
          <div><Label>Reference (txn ID / cheque #)</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} /></div>
          <div><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <p className="text-xs text-muted-foreground">Outstanding balance: <strong>{inr(balance)}</strong></p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={mut.isPending}
            onClick={() => {
              const tNum = Number(tendered);
              const tenderedAmount = mode === "cash" && Number.isFinite(tNum) && tNum > 0 ? tNum : undefined;
              mut.mutate({ id: billId, data: { amount: Number(amount), mode, tenderedAmount, reference: reference || undefined, notes: notes || undefined } }, {
                onSuccess: () => { toast({ title: "Payment recorded" }); setOpen(false); onDone(); },
                onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
              });
            }}
          >Record</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RefundDialog({ billId, refundable, disabled, payments, onDone }: {
  billId: number; refundable: number; disabled: boolean;
  payments: Array<{ id: number; amount: number; receiptNumber: string; mode: string }>;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [paymentId, setPaymentId] = useState<string>("");
  const [amount, setAmount] = useState("0");
  const [mode, setMode] = useState("cash");
  const [reason, setReason] = useState("");
  const mut = useRecordRefund();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled || refundable <= 0}>
          <RefreshCcw className="w-4 h-4 mr-1" /> Refund
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Issue Refund</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Against Payment (optional)</Label>
            <Select value={paymentId} onValueChange={(v) => {
              setPaymentId(v);
              const p = payments.find((x) => String(x.id) === v);
              if (p) { setAmount(String(p.amount)); setMode(p.mode); }
            }}>
              <SelectTrigger><SelectValue placeholder="Standalone refund" /></SelectTrigger>
              <SelectContent>
                {payments.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.receiptNumber} • {p.mode} • {inr(p.amount)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Amount (₹)</Label><Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div>
            <Label>Mode</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PAYMENT_MODES.map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Reason *</Label><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <p className="text-xs text-muted-foreground">Refundable balance: <strong>{inr(refundable)}</strong></p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={mut.isPending || !reason.trim()}
            onClick={() => {
              mut.mutate({ id: billId, data: {
                paymentId: paymentId ? Number(paymentId) : undefined,
                amount: Number(amount), mode, reason,
              } }, {
                onSuccess: () => { toast({ title: "Refund issued" }); setOpen(false); onDone(); },
                onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
              });
            }}
          >Issue Refund</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VoidDialog({ billId, disabled, onDone }: { billId: number; disabled: boolean; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const mut = useVoidBill();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled} className="text-destructive">
          <Ban className="w-4 h-4 mr-1" /> Void
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Void Bill</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Voiding marks the bill as cancelled. Refund all collected payments first. This action is restricted to admins.</p>
          <div><Label>Reason *</Label><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={mut.isPending || !reason.trim()}
            onClick={() => {
              mut.mutate({ id: billId, data: { reason } }, {
                onSuccess: () => { toast({ title: "Bill voided" }); setOpen(false); onDone(); },
                onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
              });
            }}
          >Confirm Void</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const CLAIM_STATUSES = ["none", "submitted", "approved", "rejected", "settled"];

function ClaimCard({ billId, claimStatus, claimAmount, tpa, policyNumber, preAuthCode, insurer, onDone }: {
  billId: number; claimStatus: string; claimAmount: number;
  tpa: string; policyNumber: string; preAuthCode: string; insurer: string; onDone: () => void;
}) {
  const { toast } = useToast();
  const [status, setStatus] = useState(claimStatus);
  const [amount, setAmount] = useState(String(claimAmount));
  const [t, setT] = useState(tpa);
  const [pol, setPol] = useState(policyNumber);
  const [pre, setPre] = useState(preAuthCode);
  const mut = useUpdateBillClaim();
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-blue-600" />
        <CardTitle className="text-base">Insurance Claim</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="text-xs text-muted-foreground">Insurer: <strong>{insurer || "—"}</strong></div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CLAIM_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Approved Amount</Label><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div><Label>TPA</Label><Input value={t} onChange={(e) => setT(e.target.value)} /></div>
          <div><Label>Policy #</Label><Input value={pol} onChange={(e) => setPol(e.target.value)} /></div>
          <div className="col-span-2"><Label>Pre-Auth Code</Label><Input value={pre} onChange={(e) => setPre(e.target.value)} /></div>
        </div>
        <Button
          size="sm"
          disabled={mut.isPending}
          onClick={() => {
            mut.mutate({ id: billId, data: { claimStatus: status, claimAmount: Number(amount), tpa: t, policyNumber: pol, preAuthCode: pre } }, {
              onSuccess: () => { toast({ title: "Claim updated" }); onDone(); },
              onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
            });
          }}
        >Save Claim</Button>
      </CardContent>
    </Card>
  );
}
