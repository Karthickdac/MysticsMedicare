import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  useCreateBill,
  useListPatients,
  useListServiceCatalog,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, Receipt, Package, Search } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface Line {
  serviceCode?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  gstRate: number;
  isPackage?: boolean;
}

function inr(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function BillingNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMutation = useCreateBill();
  const { data: patients } = useListPatients({});
  const { data: catalog } = useListServiceCatalog({});

  const [patientId, setPatientId] = useState<number>(0);
  const [gstMode, setGstMode] = useState<"intra" | "inter">("intra");
  const [billDiscount, setBillDiscount] = useState<number>(0);
  const [insuranceProvider, setInsuranceProvider] = useState("");
  const [tpa, setTpa] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [preAuthCode, setPreAuthCode] = useState("");
  const [notes, setNotes] = useState("");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([
    { description: "Consultation Fee", quantity: 1, unitPrice: 500, discount: 0, gstRate: 0 },
  ]);

  const totals = useMemo(() => {
    const enriched = lines.map((l) => ({
      ...l,
      amount: Math.max(0, l.quantity * l.unitPrice - l.discount),
    }));
    const grossSub = enriched.reduce((s, l) => s + l.amount, 0);
    const disc = Math.min(Math.max(billDiscount, 0), grossSub);
    const taxableSub = grossSub - disc;
    const scale = grossSub > 0 ? taxableSub / grossSub : 0;
    let cgst = 0, sgst = 0, igst = 0;
    for (const l of enriched) {
      const taxable = l.amount * scale;
      const rate = (l.gstRate ?? 0) / 100;
      if (gstMode === "intra") {
        cgst += (taxable * rate) / 2;
        sgst += (taxable * rate) / 2;
      } else {
        igst += taxable * rate;
      }
    }
    const total = taxableSub + cgst + sgst + igst;
    return { enriched, grossSub, disc, taxableSub, cgst, sgst, igst, total };
  }, [lines, billDiscount, gstMode]);

  function update(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function removeLine(i: number) {
    setLines((ls) => ls.filter((_, idx) => idx !== i));
  }
  function addFromCatalog(s: { code: string; name: string; unitPrice: number; gstRate: number; isPackage?: boolean }) {
    setLines((ls) => [
      ...ls,
      {
        serviceCode: s.code,
        description: s.name,
        quantity: 1,
        unitPrice: Number(s.unitPrice),
        discount: 0,
        gstRate: Number(s.gstRate),
        isPackage: s.isPackage,
      },
    ]);
    setCatalogOpen(false);
  }
  function addBlank() {
    setLines((ls) => [...ls, { description: "", quantity: 1, unitPrice: 0, discount: 0, gstRate: 18 }]);
  }

  function submit() {
    if (!patientId) { toast({ title: "Select a patient", variant: "destructive" }); return; }
    if (lines.length === 0) { toast({ title: "Add at least one item", variant: "destructive" }); return; }
    if (lines.some((l) => !l.description.trim())) {
      toast({ title: "Every line needs a description", variant: "destructive" });
      return;
    }
    createMutation.mutate(
      {
        data: {
          patientId,
          gstMode,
          discount: totals.disc,
          insuranceProvider: insuranceProvider || undefined,
          tpa: tpa || undefined,
          policyNumber: policyNumber || undefined,
          preAuthCode: preAuthCode || undefined,
          notes: notes || undefined,
          items: totals.enriched.map((l) => ({
            serviceCode: l.serviceCode,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discount: l.discount,
            gstRate: l.gstRate,
            amount: l.amount,
          })),
        },
      },
      {
        onSuccess: (res) => {
          toast({ title: `Invoice ${res.billNumber} created` });
          setLocation(`/billing/${res.id}`);
        },
        onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      },
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <Receipt className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Create Invoice</h1>
          <p className="text-muted-foreground text-sm">GST-compliant cashier billing with service catalog.</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4"><CardTitle className="text-lg">Billing Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label>Patient *</Label>
              <Select value={patientId ? String(patientId) : ""} onValueChange={(v) => setPatientId(Number(v))}>
                <SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
                <SelectContent>
                  {patients?.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name} ({p.uhid})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tax Configuration</Label>
              <RadioGroup value={gstMode} onValueChange={(v) => setGstMode(v as "intra" | "inter")} className="flex gap-4 mt-2">
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="intra" />Intra-state (CGST+SGST)</label>
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="inter" />Inter-state (IGST)</label>
              </RadioGroup>
            </div>
            <div>
              <Label>Insurance Provider</Label>
              <Input value={insuranceProvider} onChange={(e) => setInsuranceProvider(e.target.value)} placeholder="e.g. Star Health" />
            </div>
            <div>
              <Label>TPA</Label>
              <Input value={tpa} onChange={(e) => setTpa(e.target.value)} placeholder="e.g. MediAssist" />
            </div>
            <div>
              <Label>Policy Number</Label>
              <Input value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} placeholder="POL-…" />
            </div>
            <div>
              <Label>Pre-Auth Code</Label>
              <Input value={preAuthCode} onChange={(e) => setPreAuthCode(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional internal notes" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg">Line Items</CardTitle>
          <div className="flex gap-2">
            <Popover open={catalogOpen} onOpenChange={setCatalogOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  <Search className="w-4 h-4 mr-2" /> Add from catalog
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[420px] p-0" align="end">
                <Command>
                  <CommandInput placeholder="Search service / package / code…" />
                  <CommandList>
                    <CommandEmpty>No matching services.</CommandEmpty>
                    <CommandGroup heading="Catalog">
                      {(catalog ?? []).map((s) => (
                        <CommandItem
                          key={s.id}
                          value={`${s.code} ${s.name} ${s.category}`}
                          onSelect={() => addFromCatalog(s)}
                        >
                          {s.isPackage ? <Package className="w-4 h-4 mr-2 text-amber-600" /> : <Receipt className="w-4 h-4 mr-2 text-muted-foreground" />}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{s.name}</div>
                            <div className="text-[11px] text-muted-foreground">{s.code} • {s.category} • GST {Number(s.gstRate)}%</div>
                          </div>
                          <div className="font-mono text-sm ml-2">{inr(Number(s.unitPrice))}</div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Button type="button" variant="outline" size="sm" onClick={addBlank}>
              <Plus className="w-4 h-4 mr-2" /> Blank line
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {lines.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-4">No items added yet.</div>
            )}
            {lines.map((l, i) => {
              const amount = Math.max(0, l.quantity * l.unitPrice - l.discount);
              return (
                <div key={i} className="grid grid-cols-12 gap-2 items-end p-2 bg-muted/30 rounded-md">
                  <div className="col-span-12 md:col-span-4">
                    <Label className="text-[10px] uppercase">Description</Label>
                    <div className="flex items-center gap-2">
                      <Input value={l.description} onChange={(e) => update(i, { description: e.target.value })} />
                      {l.isPackage && <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-700">PKG</Badge>}
                    </div>
                  </div>
                  <div className="col-span-3 md:col-span-1">
                    <Label className="text-[10px] uppercase">Qty</Label>
                    <Input type="number" min={1} value={l.quantity} onChange={(e) => update(i, { quantity: Number(e.target.value) || 0 })} />
                  </div>
                  <div className="col-span-3 md:col-span-2">
                    <Label className="text-[10px] uppercase">Rate ₹</Label>
                    <Input type="number" min={0} value={l.unitPrice} onChange={(e) => update(i, { unitPrice: Number(e.target.value) || 0 })} />
                  </div>
                  <div className="col-span-3 md:col-span-2">
                    <Label className="text-[10px] uppercase">Discount ₹</Label>
                    <Input type="number" min={0} value={l.discount} onChange={(e) => update(i, { discount: Number(e.target.value) || 0 })} />
                  </div>
                  <div className="col-span-3 md:col-span-1">
                    <Label className="text-[10px] uppercase">GST %</Label>
                    <Input type="number" min={0} max={28} value={l.gstRate} onChange={(e) => update(i, { gstRate: Number(e.target.value) || 0 })} />
                  </div>
                  <div className="col-span-9 md:col-span-1 text-right">
                    <Label className="text-[10px] uppercase">Amount</Label>
                    <div className="text-sm font-semibold pt-2">{inr(amount)}</div>
                  </div>
                  <div className="col-span-3 md:col-span-1 flex justify-end">
                    <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => removeLine(i)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
        <CardFooter className="bg-muted/10 border-t border-border flex flex-col md:flex-row justify-between gap-4 p-6">
          <div className="w-full md:w-64 space-y-2">
            <Label className="text-xs">Bill-level Discount (₹)</Label>
            <Input type="number" min={0} value={billDiscount} onChange={(e) => setBillDiscount(Number(e.target.value) || 0)} />
            <p className="text-[11px] text-muted-foreground">Applied to subtotal before GST.</p>
          </div>
          <div className="w-full md:w-72 space-y-2 text-sm">
            <Row label="Subtotal" value={inr(totals.grossSub)} />
            {totals.disc > 0 && <Row label="Bill Discount" value={"− " + inr(totals.disc)} muted />}
            {totals.cgst > 0 && <Row label="CGST" value={inr(totals.cgst)} muted />}
            {totals.sgst > 0 && <Row label="SGST" value={inr(totals.sgst)} muted />}
            {totals.igst > 0 && <Row label="IGST" value={inr(totals.igst)} muted />}
            <div className="flex justify-between pt-2 border-t border-border font-bold text-lg">
              <span>Total</span>
              <span className="text-primary">{inr(totals.total)}</span>
            </div>
          </div>
        </CardFooter>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => setLocation("/billing")}>Cancel</Button>
        <Button onClick={submit} disabled={createMutation.isPending}>
          {createMutation.isPending ? "Generating…" : "Generate Invoice"}
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={muted ? "text-muted-foreground" : ""}>{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
