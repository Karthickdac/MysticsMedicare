import { useState, useMemo } from "react";
import {
  useListLabOrders,
  useCreateLabOrder,
  useRecordLabResult,
  useCollectLabSample,
  useRejectLabSample,
  useVerifyLabResult,
  useDispatchLabReport,
  useListLabCatalog,
  useCreateLabCatalogItem,
  useListPatients,
  useMe,
  getListLabOrdersQueryKey,
  getListLabCatalogQueryKey,
  type LabOrder,
  type LabCatalogItem,
  type LabCatalogParam,
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
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { TestTube, Plus, Beaker, FileCheck, Send, BookOpen, Printer } from "lucide-react";

type Catalog = LabCatalogItem;

function statusBadge(s: string) {
  const m: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    collected: "bg-blue-100 text-blue-800",
    rejected: "bg-red-100 text-red-800",
    resulted: "bg-purple-100 text-purple-800",
    verified: "bg-emerald-100 text-emerald-800",
    dispatched: "bg-gray-200 text-gray-800",
  };
  return <Badge className={m[s] ?? ""}>{s}</Badge>;
}

export default function LabPage() {
  const { data: me } = useMe();
  const role = me?.role ?? "";
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><TestTube className="w-6 h-6 text-primary" /> Laboratory</h1>
        <p className="text-muted-foreground">Order, collect, result, verify and dispatch lab tests.</p>
      </div>
      <Tabs defaultValue="orders" className="space-y-4">
        <TabsList>
          <TabsTrigger value="orders" data-testid="tab-orders">Orders</TabsTrigger>
          <TabsTrigger value="collection" data-testid="tab-collection"><Beaker className="w-4 h-4 mr-1" /> Collection</TabsTrigger>
          <TabsTrigger value="results" data-testid="tab-results">Results</TabsTrigger>
          <TabsTrigger value="verification" data-testid="tab-verification"><FileCheck className="w-4 h-4 mr-1" /> Verification</TabsTrigger>
          <TabsTrigger value="dispatch" data-testid="tab-dispatch"><Send className="w-4 h-4 mr-1" /> Dispatch</TabsTrigger>
          <TabsTrigger value="catalog" data-testid="tab-catalog"><BookOpen className="w-4 h-4 mr-1" /> Catalog</TabsTrigger>
        </TabsList>
        <TabsContent value="orders"><OrdersTab role={role} /></TabsContent>
        <TabsContent value="collection"><CollectionTab role={role} /></TabsContent>
        <TabsContent value="results"><ResultsTab role={role} /></TabsContent>
        <TabsContent value="verification"><VerificationTab role={role} verifierName={me?.name ?? ""} /></TabsContent>
        <TabsContent value="dispatch"><DispatchTab role={role} /></TabsContent>
        <TabsContent value="catalog"><CatalogTab role={role} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Orders tab — list + new-order dialog
// ---------------------------------------------------------------------------
function OrdersTab({ role }: { role: string }) {
  const { data: orders, isLoading } = useListLabOrders({});
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>All Orders</CardTitle>
        {["admin", "doctor", "labtech"].includes(role) && <NewOrderDialog />}
      </CardHeader>
      <CardContent>
        {isLoading ? "Loading…" : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Test</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Sample ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ordered</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(orders ?? []).map(o => (
                <TableRow key={o.id} data-testid={`row-lab-${o.id}`}>
                  <TableCell className="font-mono text-xs">#{o.id}</TableCell>
                  <TableCell>{o.patientName}</TableCell>
                  <TableCell>{o.testName}</TableCell>
                  <TableCell>{o.priority}</TableCell>
                  <TableCell className="font-mono text-xs">{o.sampleId ?? "—"}</TableCell>
                  <TableCell>{statusBadge(o.status)}</TableCell>
                  <TableCell className="text-xs">{new Date(o.createdAt).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function NewOrderDialog() {
  const [open, setOpen] = useState(false);
  const [patientId, setPatientId] = useState<string>("");
  const [catalogId, setCatalogId] = useState<string>("");
  const [testName, setTestName] = useState("");
  const [priority, setPriority] = useState("routine");
  const [autoBill, setAutoBill] = useState(true);
  const { data: patients } = useListPatients({});
  const { data: catalog } = useListLabCatalog();
  const qc = useQueryClient();
  const create = useCreateLabOrder({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListLabOrdersQueryKey() });
        setOpen(false); setPatientId(""); setCatalogId(""); setTestName(""); setPriority("routine"); setAutoBill(true);
      },
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button data-testid="btn-new-lab-order"><Plus className="w-4 h-4 mr-1" /> New Order</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New Lab Order</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Patient</Label>
            <Select value={patientId} onValueChange={setPatientId}>
              <SelectTrigger data-testid="sel-patient"><SelectValue placeholder="Choose patient" /></SelectTrigger>
              <SelectContent>{(patients ?? []).map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name} ({p.uhid})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Catalog Test</Label>
            <Select value={catalogId} onValueChange={setCatalogId}>
              <SelectTrigger data-testid="sel-catalog"><SelectValue placeholder="From catalog (optional)" /></SelectTrigger>
              <SelectContent>{(catalog ?? []).filter(c => c.active).map(c => <SelectItem key={c.id} value={String(c.id)}>{c.code} — {c.name} (₹{c.price})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {!catalogId && (
            <div><Label>Test Name (ad-hoc)</Label><Input value={testName} onChange={e => setTestName(e.target.value)} data-testid="inp-testname" /></div>
          )}
          <div>
            <Label>Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="routine">Routine</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="stat">STAT</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={autoBill} onCheckedChange={(v) => setAutoBill(!!v)} data-testid="chk-autobill" />
            Auto-create bill from catalog price
          </label>
        </div>
        <DialogFooter>
          <Button disabled={!patientId || (!catalogId && !testName) || create.isPending} data-testid="btn-create-lab-order" onClick={() => {
            create.mutate({ data: {
              patientId: Number(patientId),
              catalogId: catalogId ? Number(catalogId) : undefined,
              testName: !catalogId ? testName : undefined,
              priority: priority as "routine" | "urgent" | "stat",
              autoBill: autoBill && !!catalogId,
            } });
          }}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Collection tab — collect or reject pending samples
// ---------------------------------------------------------------------------
function CollectionTab({ role }: { role: string }) {
  const { data: orders } = useListLabOrders({ status: "pending" });
  const qc = useQueryClient();
  const collect = useCollectLabSample({ mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListLabOrdersQueryKey() }) } });
  const reject = useRejectLabSample({ mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListLabOrdersQueryKey() }) } });
  const canAct = ["admin", "labtech", "nurse"].includes(role);
  return (
    <Card>
      <CardHeader><CardTitle>Pending Collection ({(orders ?? []).length})</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Patient</TableHead><TableHead>Test</TableHead><TableHead>Sample ID</TableHead><TableHead>Barcode</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {(orders ?? []).map(o => (
              <TableRow key={o.id}>
                <TableCell>{o.patientName}</TableCell>
                <TableCell>{o.testName}</TableCell>
                <TableCell className="font-mono text-xs">{o.sampleId}</TableCell>
                <TableCell className="font-mono text-xs">{o.barcode}</TableCell>
                <TableCell className="text-right space-x-2">
                  {canAct && (
                    <>
                      <Button size="sm" data-testid={`btn-collect-${o.id}`} disabled={collect.isPending} onClick={() => collect.mutate({ id: o.id, data: {} })}>Collect</Button>
                      <Button size="sm" variant="destructive" data-testid={`btn-reject-${o.id}`} onClick={() => {
                        const reason = window.prompt("Rejection reason?");
                        if (reason) reject.mutate({ id: o.id, data: { reason } });
                      }}>Reject</Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Results tab — enter parameter grid for collected orders
// ---------------------------------------------------------------------------
function ResultsTab({ role }: { role: string }) {
  const { data: orders } = useListLabOrders({ status: "collected" });
  const canAct = ["admin", "labtech", "doctor"].includes(role);
  return (
    <div className="space-y-4">
      {(orders ?? []).map(o => canAct ? <ResultEntry key={o.id} order={o} /> : <Card key={o.id}><CardContent className="p-3">{o.patientName} — {o.testName}</CardContent></Card>)}
      {(orders ?? []).length === 0 && <Card><CardContent className="p-6 text-center text-muted-foreground">No collected samples awaiting results.</CardContent></Card>}
    </div>
  );
}

function ResultEntry({ order }: { order: LabOrder }) {
  const { data: catalog } = useListLabCatalog();
  const params = useMemo<LabCatalogParam[]>(() => {
    const c = (catalog ?? []).find(x => x.id === order.catalogId);
    const ps = (c?.parameters ?? []) as LabCatalogParam[];
    return ps.length ? ps : [{ name: order.testName, unit: null, refLow: null, refHigh: null, refText: null }];
  }, [catalog, order]);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const qc = useQueryClient();
  const record = useRecordLabResult({ mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListLabOrdersQueryKey() }) } });

  function flagOf(p: { refLow?: number | null; refHigh?: number | null }, v: string): string {
    const n = Number(v);
    if (!v || isNaN(n)) return "";
    if (p.refHigh != null && n > p.refHigh) return "H";
    if (p.refLow != null && n < p.refLow) return "L";
    return "N";
  }

  return (
    <Card data-testid={`result-entry-${order.id}`}>
      <CardHeader>
        <CardTitle className="text-base">#{order.id} {order.patientName} — {order.testName} <span className="text-xs text-muted-foreground ml-2">Sample {order.sampleId}</span></CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Table>
          <TableHeader><TableRow><TableHead>Parameter</TableHead><TableHead>Value</TableHead><TableHead>Unit</TableHead><TableHead>Reference</TableHead><TableHead>Flag</TableHead></TableRow></TableHeader>
          <TableBody>
            {params.map(p => {
              const v = vals[p.name] ?? "";
              const flag = flagOf(p, v);
              return (
                <TableRow key={p.name}>
                  <TableCell>{p.name}</TableCell>
                  <TableCell><Input value={v} onChange={e => setVals({ ...vals, [p.name]: e.target.value })} data-testid={`inp-${order.id}-${p.name}`} className="w-32" /></TableCell>
                  <TableCell className="text-xs">{p.unit ?? "—"}</TableCell>
                  <TableCell className="text-xs">{p.refLow != null && p.refHigh != null ? `${p.refLow} – ${p.refHigh}` : (p.refText ?? "—")}</TableCell>
                  <TableCell>{flag && <Badge variant={flag === "N" ? "outline" : "destructive"}>{flag}</Badge>}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <Textarea placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} data-testid={`inp-notes-${order.id}`} />
        <Input placeholder="Attachment URL (scan/PDF)" value={attachmentUrl} onChange={e => setAttachmentUrl(e.target.value)} data-testid={`inp-attach-${order.id}`} />
        <Button disabled={record.isPending} data-testid={`btn-save-result-${order.id}`} onClick={() => {
          const results = params.map(p => ({
            name: p.name,
            value: vals[p.name] ?? "",
            unit: p.unit ?? null,
            flag: flagOf(p, vals[p.name] ?? "") || null,
            refRange: p.refLow != null && p.refHigh != null ? `${p.refLow} – ${p.refHigh}` : p.refText ?? null,
          })).filter(r => r.value);
          record.mutate({ id: order.id, data: { results, notes: notes || undefined, attachmentUrl: attachmentUrl || undefined } });
        }}>Save Results</Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Verification — pathologist sign-off (doctor/admin)
// ---------------------------------------------------------------------------
function VerificationTab({ role, verifierName }: { role: string; verifierName: string }) {
  const { data: orders } = useListLabOrders({ status: "resulted" });
  const qc = useQueryClient();
  const verify = useVerifyLabResult({ mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListLabOrdersQueryKey() }) } });
  const canAct = ["admin", "doctor"].includes(role);
  return (
    <Card>
      <CardHeader><CardTitle>Awaiting Verification ({(orders ?? []).length})</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {(orders ?? []).map(o => (
          <Card key={o.id} className="border">
            <CardContent className="p-3 space-y-2">
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-medium">#{o.id} {o.patientName} — {o.testName}</div>
                  <div className="text-xs text-muted-foreground">Sample {o.sampleId} · {(o.results ?? []).length} parameter(s)</div>
                </div>
                <div className="space-x-2">
                  <Button asChild size="sm" variant="outline"><a href={`/api/pdf/lab-report/${o.id}`} target="_blank" rel="noreferrer" data-testid={`btn-preview-${o.id}`}><Printer className="w-4 h-4 mr-1" /> Preview</a></Button>
                  {canAct && <Button size="sm" data-testid={`btn-verify-${o.id}`} disabled={verify.isPending} onClick={() => verify.mutate({ id: o.id, data: { verifiedBy: verifierName || "Verifier" } })}>Verify & Sign</Button>}
                </div>
              </div>
              {(o.results ?? []).length > 0 && (
                <div className="text-xs grid grid-cols-2 md:grid-cols-4 gap-1">
                  {(o.results as Array<{ name: string; value: string; unit?: string | null; flag?: string | null }>).map((r, i) => (
                    <div key={i}>{r.name}: <b className={r.flag && r.flag !== "N" ? "text-red-600" : ""}>{r.value}</b> {r.unit ?? ""} {r.flag && r.flag !== "N" ? `(${r.flag})` : ""}</div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Dispatch — send signed report via SMS/WhatsApp/email
// ---------------------------------------------------------------------------
function DispatchTab({ role }: { role: string }) {
  const { data: orders } = useListLabOrders({ status: "verified" });
  const qc = useQueryClient();
  const dispatch = useDispatchLabReport({ mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListLabOrdersQueryKey() }) } });
  const canAct = ["admin", "labtech", "receptionist", "doctor"].includes(role);
  return (
    <Card>
      <CardHeader><CardTitle>Verified — Ready to Dispatch ({(orders ?? []).length})</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Patient</TableHead><TableHead>Test</TableHead><TableHead>Verified By</TableHead><TableHead>Report</TableHead><TableHead className="text-right">Send</TableHead></TableRow></TableHeader>
          <TableBody>
            {(orders ?? []).map(o => (
              <TableRow key={o.id}>
                <TableCell>{o.patientName}</TableCell>
                <TableCell>{o.testName}</TableCell>
                <TableCell className="text-xs">{o.verifiedBy} · {o.verifiedAt ? new Date(o.verifiedAt).toLocaleString() : ""}</TableCell>
                <TableCell><a className="text-blue-600 underline text-xs" href={`/api/pdf/lab-report/${o.id}`} target="_blank" rel="noreferrer">PDF</a></TableCell>
                <TableCell className="text-right space-x-1">
                  {canAct && (
                    <>
                      <Button size="sm" variant="outline" data-testid={`btn-disp-sms-${o.id}`} onClick={() => dispatch.mutate({ id: o.id, data: { via: "sms" } })}>SMS</Button>
                      <Button size="sm" variant="outline" data-testid={`btn-disp-wa-${o.id}`} onClick={() => dispatch.mutate({ id: o.id, data: { via: "whatsapp" } })}>WhatsApp</Button>
                      <Button size="sm" data-testid={`btn-disp-both-${o.id}`} onClick={() => dispatch.mutate({ id: o.id, data: { via: "both" } })}>Both</Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Catalog — test master CRUD
// ---------------------------------------------------------------------------
function CatalogTab({ role }: { role: string }) {
  const { data: items, isLoading } = useListLabCatalog();
  const canEdit = ["admin", "labtech"].includes(role);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Test Catalog ({(items ?? []).length})</CardTitle>
        {canEdit && <NewCatalogDialog />}
      </CardHeader>
      <CardContent>
        {isLoading ? "Loading…" : (
          <Table>
            <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Sample</TableHead><TableHead>Price</TableHead><TableHead>GST</TableHead><TableHead>TAT (h)</TableHead><TableHead>Params</TableHead><TableHead>Active</TableHead></TableRow></TableHeader>
            <TableBody>
              {(items ?? []).map((c: Catalog) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.code}</TableCell>
                  <TableCell>{c.name}</TableCell>
                  <TableCell>{c.sampleType}</TableCell>
                  <TableCell>₹{c.price.toFixed(2)}</TableCell>
                  <TableCell>{c.gstRate}%</TableCell>
                  <TableCell>{c.turnaroundHours}</TableCell>
                  <TableCell className="text-xs">{(c.parameters ?? []).length}</TableCell>
                  <TableCell>{c.active ? <Badge>Active</Badge> : <Badge variant="secondary">Off</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function NewCatalogDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", category: "", sampleType: "Blood", container: "EDTA", price: "", gstRate: "5", turnaroundHours: "24" });
  const [paramsText, setParamsText] = useState("");
  const qc = useQueryClient();
  const create = useCreateLabCatalogItem({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListLabCatalogQueryKey() }); setOpen(false); } } });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button data-testid="btn-new-catalog"><Plus className="w-4 h-4 mr-1" /> Add Test</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New Catalog Item</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Code</Label><Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} data-testid="cat-code" /></div>
          <div><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} data-testid="cat-name" /></div>
          <div><Label>Category</Label><Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /></div>
          <div><Label>Sample Type</Label><Input value={form.sampleType} onChange={e => setForm({ ...form, sampleType: e.target.value })} /></div>
          <div><Label>Container</Label><Input value={form.container} onChange={e => setForm({ ...form, container: e.target.value })} /></div>
          <div><Label>Price (₹)</Label><Input type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} data-testid="cat-price" /></div>
          <div><Label>GST %</Label><Input type="number" value={form.gstRate} onChange={e => setForm({ ...form, gstRate: e.target.value })} /></div>
          <div><Label>TAT hours</Label><Input type="number" value={form.turnaroundHours} onChange={e => setForm({ ...form, turnaroundHours: e.target.value })} /></div>
        </div>
        <Label>Parameters (one per line: <code>name|unit|refLow|refHigh</code>)</Label>
        <Textarea value={paramsText} onChange={e => setParamsText(e.target.value)} placeholder={"Hemoglobin|g/dL|13|17\nWBC|10^3/uL|4|11"} data-testid="cat-params" />
        <DialogFooter>
          <Button disabled={!form.code || !form.name || create.isPending} data-testid="btn-create-catalog" onClick={() => {
            const parameters = paramsText.split("\n").map(s => s.trim()).filter(Boolean).map(line => {
              const [name, unit, low, high] = line.split("|").map(s => s?.trim());
              return { name, unit: unit || null, refLow: low ? Number(low) : null, refHigh: high ? Number(high) : null };
            });
            create.mutate({ data: {
              code: form.code, name: form.name, category: form.category || undefined,
              sampleType: form.sampleType, container: form.container || undefined,
              price: form.price ? Number(form.price) : undefined,
              gstRate: form.gstRate ? Number(form.gstRate) : undefined,
              turnaroundHours: form.turnaroundHours ? Number(form.turnaroundHours) : undefined,
              parameters: parameters.length ? parameters : undefined,
              active: true,
            } });
          }}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
