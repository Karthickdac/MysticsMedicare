import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCashierSessions,
  useOpenCashierSession,
  useCloseCashierSession,
  getListCashierSessionsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/primitives/page-header";
import { Wallet, LogIn, LogOut } from "lucide-react";

function inr(n: number | null | undefined) {
  if (n == null) return "—";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function CashierSessions() {
  const qc = useQueryClient();
  const { data: sessions, isLoading } = useListCashierSessions(undefined, {
    query: { queryKey: getListCashierSessionsQueryKey() },
  });
  const open = (sessions ?? []).filter((s) => s.status === "open");
  const closed = (sessions ?? []).filter((s) => s.status === "closed").slice(0, 25);

  function refresh() { qc.invalidateQueries({ queryKey: getListCashierSessionsQueryKey() }); }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <PageHeader
        eyebrow="Cashier"
        title="Cash Drawer Sessions"
        description="Open a session before collecting cash, close it at end-of-shift for reconciliation."
        icon={Wallet}
        actions={<OpenSessionDialog onDone={refresh} />}
      />

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Open Sessions</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : open.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">No open sessions — open one to start collecting cash.</div>
          ) : (
            <ul className="divide-y divide-border">
              {open.map((s) => {
                const cash = s.collectionsByMode?.find((m) => m.mode === "cash");
                const others = s.collectionsByMode?.filter((m) => m.mode !== "cash") ?? [];
                const expected = (s.openingCash ?? 0) + (cash?.amount ?? 0) - (s.refundsTotal ?? 0);
                return (
                  <li key={s.id} className="p-4 flex flex-wrap items-center gap-4 justify-between">
                    <div>
                      <div className="font-semibold">{s.cashierName}</div>
                      <div className="text-xs text-muted-foreground">Opened {new Date(s.openedAt).toLocaleString("en-IN")}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Opening: <strong>{inr(s.openingCash)}</strong>
                        {" • "}Cash in: <strong>{inr(cash?.amount ?? 0)}</strong> ({cash?.count ?? 0} receipts)
                        {" • "}Refunds: <strong>{inr(s.refundsTotal ?? 0)}</strong>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Other modes: {others.length === 0 ? "—" : others.map((m) => `${m.mode.toUpperCase()} ${inr(m.amount)}`).join(" · ")}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] uppercase text-muted-foreground">Expected Drawer</div>
                      <div className="text-2xl font-bold tabular-nums">{inr(expected)}</div>
                    </div>
                    <CloseSessionDialog sessionId={s.id} expected={expected} onDone={refresh} />
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Recent Closed Sessions</CardTitle></CardHeader>
        <CardContent className="p-0">
          {closed.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">No closed sessions yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground border-y border-border">
                <tr>
                  <th className="py-2 px-4 text-left">Cashier</th>
                  <th className="py-2 px-3 text-left">Opened</th>
                  <th className="py-2 px-3 text-left">Closed</th>
                  <th className="py-2 px-3 text-right">Opening</th>
                  <th className="py-2 px-3 text-right">Expected</th>
                  <th className="py-2 px-3 text-right">Counted</th>
                  <th className="py-2 px-3 text-right">Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {closed.map((s) => {
                  const v = s.variance ?? 0;
                  const tone = v === 0 ? "" : v > 0 ? "text-success" : "text-destructive";
                  return (
                    <tr key={s.id}>
                      <td className="py-2 px-4">{s.cashierName}</td>
                      <td className="py-2 px-3 text-muted-foreground">{new Date(s.openedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="py-2 px-3 text-muted-foreground">{s.closedAt ? new Date(s.closedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{inr(s.openingCash)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{inr(s.expectedCash)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{inr(s.closingCash)}</td>
                      <td className={`py-2 px-3 text-right tabular-nums font-semibold ${tone}`}>
                        <Badge variant="outline" className={tone}>{inr(v)}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OpenSessionDialog({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState("0");
  const [notes, setNotes] = useState("");
  const mut = useOpenCashierSession();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><LogIn className="w-4 h-4 mr-2" /> Open Session</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Open Cashier Session</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Opening Cash (₹)</Label><Input type="number" min={0} step="0.01" value={opening} onChange={(e) => setOpening(e.target.value)} /></div>
          <div><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={mut.isPending} onClick={() => {
            mut.mutate({ data: { openingCash: Number(opening), notes: notes || undefined } }, {
              onSuccess: () => { toast({ title: "Session opened" }); setOpen(false); onDone(); },
              onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
            });
          }}>Open</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CloseSessionDialog({ sessionId, expected, onDone }: { sessionId: number; expected: number; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(expected.toFixed(2));
  const [notes, setNotes] = useState("");
  const mut = useCloseCashierSession();
  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) setClosing(expected.toFixed(2)); }}>
      <DialogTrigger asChild>
        <Button variant="outline"><LogOut className="w-4 h-4 mr-2" /> Close</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Close Session</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Expected cash in drawer: <strong>{inr(expected)}</strong></p>
          <div><Label>Counted Cash (₹)</Label><Input type="number" min={0} step="0.01" value={closing} onChange={(e) => setClosing(e.target.value)} /></div>
          <div><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Variance explanation, hand-off, etc." /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={mut.isPending} onClick={() => {
            mut.mutate({ id: sessionId, data: { closingCash: Number(closing), notes: notes || undefined } }, {
              onSuccess: () => { toast({ title: "Session closed" }); setOpen(false); onDone(); },
              onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
            });
          }}>Close & Reconcile</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
