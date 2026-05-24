import { useState } from "react";
import {
  useListRadiologyOrders,
  useCreateRadiologyOrder,
  useScheduleRadiology,
  useCaptureRadiologyImages,
  useRecordRadiologyReport,
  useVerifyRadiologyReport,
  useDispatchRadiologyReport,
  useListRadiologyCatalog,
  useCreateRadiologyCatalogItem,
  useListPatients,
  useMe,
  getListRadiologyOrdersQueryKey,
  getListRadiologyCatalogQueryKey,
  type RadiologyOrder,
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
import { Cross, Plus, CalendarClock, Camera, FileText, FileCheck, Send, BookOpen, Printer } from "lucide-react";

type Order = RadiologyOrder;

function statusBadge(s: string) {
  const m: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    scheduled: "bg-blue-100 text-blue-800",
    captured: "bg-indigo-100 text-indigo-800",
    reported: "bg-purple-100 text-purple-800",
    verified: "bg-emerald-100 text-emerald-800",
    dispatched: "bg-gray-200 text-gray-800",
  };
  return <Badge className={m[s] ?? ""}>{s}</Badge>;
}

export default function RadiologyPage() {
  const { data: me } = useMe();
  const role = me?.role ?? "";
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Cross className="w-6 h-6 text-primary" /> Radiology</h1>
        <p className="text-muted-foreground">Order, schedule, capture, report, verify and dispatch imaging.</p>
      </div>
      <Tabs defaultValue="orders" className="space-y-4">
        <TabsList>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="schedule"><CalendarClock className="w-4 h-4 mr-1" /> Schedule</TabsTrigger>
          <TabsTrigger value="capture"><Camera className="w-4 h-4 mr-1" /> Capture</TabsTrigger>
          <TabsTrigger value="report"><FileText className="w-4 h-4 mr-1" /> Report</TabsTrigger>
          <TabsTrigger value="verify"><FileCheck className="w-4 h-4 mr-1" /> Verify</TabsTrigger>
          <TabsTrigger value="dispatch"><Send className="w-4 h-4 mr-1" /> Dispatch</TabsTrigger>
          <TabsTrigger value="catalog"><BookOpen className="w-4 h-4 mr-1" /> Catalog</TabsTrigger>
        </TabsList>
        <TabsContent value="orders"><OrdersTab role={role} /></TabsContent>
        <TabsContent value="schedule"><ScheduleTab role={role} /></TabsContent>
        <TabsContent value="capture"><CaptureTab role={role} /></TabsContent>
        <TabsContent value="report"><ReportTab role={role} reporterName={me?.name ?? ""} /></TabsContent>
        <TabsContent value="verify"><VerifyTab role={role} verifierName={me?.name ?? ""} /></TabsContent>
        <TabsContent value="dispatch"><DispatchTab role={role} /></TabsContent>
        <TabsContent value="catalog"><CatalogTab role={role} /></TabsContent>
      </Tabs>
    </div>
  );
}

function OrdersTab({ role }: { role: string }) {
  const { data } = useListRadiologyOrders({});
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>All Orders</CardTitle>
        {["admin", "doctor", "radiologist", "receptionist"].includes(role) && <NewOrderDialog />}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Patient</TableHead><TableHead>Modality</TableHead><TableHead>Body Part</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead><TableHead>Scheduled</TableHead></TableRow></TableHeader>
          <TableBody>
            {(data ?? []).map(o => (
              <TableRow key={o.id} data-testid={`row-rad-${o.id}`}>
                <TableCell className="font-mono text-xs">#{o.id}</TableCell>
                <TableCell>{o.patientName}</TableCell>
                <TableCell>{o.modality}</TableCell>
                <TableCell>{o.bodyPart}</TableCell>
                <TableCell>{o.priority}</TableCell>
                <TableCell>{statusBadge(o.status)}</TableCell>
                <TableCell className="text-xs">{o.scheduledAt ? new Date(o.scheduledAt).toLocaleString() : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function NewOrderDialog() {
  const [open, setOpen] = useState(false);
  const [patientId, setPatientId] = useState("");
  const [catalogId, setCatalogId] = useState("");
  const [modality, setModality] = useState("");
  const [bodyPart, setBodyPart] = useState("");
  const [priority, setPriority] = useState("routine");
  const [scheduledAt, setScheduledAt] = useState("");
  const [autoBill, setAutoBill] = useState(true);
  const { data: patients } = useListPatients({});
  const { data: catalog } = useListRadiologyCatalog();
  const qc = useQueryClient();
  const create = useCreateRadiologyOrder({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListRadiologyOrdersQueryKey() }); setOpen(false); } } });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button data-testid="btn-new-rad"><Plus className="w-4 h-4 mr-1" /> New Order</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New Radiology Order</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Patient</Label>
            <Select value={patientId} onValueChange={setPatientId}>
              <SelectTrigger data-testid="rad-patient"><SelectValue placeholder="Choose patient" /></SelectTrigger>
              <SelectContent>{(patients ?? []).map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Catalog</Label>
            <Select value={catalogId} onValueChange={setCatalogId}>
              <SelectTrigger data-testid="rad-catalog"><SelectValue placeholder="From catalog (optional)" /></SelectTrigger>
              <SelectContent>{(catalog ?? []).filter(c => c.active).map(c => <SelectItem key={c.id} value={String(c.id)}>{c.modality} {c.bodyPart} — {c.name} (₹{c.price})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {!catalogId && (
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Modality</Label><Input value={modality} onChange={e => setModality(e.target.value)} placeholder="X-Ray / CT / MRI" /></div>
              <div><Label>Body Part</Label><Input value={bodyPart} onChange={e => setBodyPart(e.target.value)} /></div>
            </div>
          )}
          <div><Label>Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="routine">Routine</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="stat">STAT</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Scheduled at (optional)</Label><Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} /></div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={autoBill} onCheckedChange={(v) => setAutoBill(!!v)} /> Auto-create bill from catalog
          </label>
        </div>
        <DialogFooter>
          <Button disabled={!patientId || (!catalogId && (!modality || !bodyPart)) || create.isPending} data-testid="btn-create-rad" onClick={() => {
            create.mutate({ data: {
              patientId: Number(patientId),
              catalogId: catalogId ? Number(catalogId) : undefined,
              modality: !catalogId ? modality : undefined,
              bodyPart: !catalogId ? bodyPart : undefined,
              priority: priority as "routine" | "urgent" | "stat",
              scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
              autoBill: autoBill && !!catalogId,
            } });
          }}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleTab({ role }: { role: string }) {
  const { data } = useListRadiologyOrders({});
  const pending = (data ?? []).filter(o => o.status === "pending");
  const qc = useQueryClient();
  const schedule = useScheduleRadiology({ mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListRadiologyOrdersQueryKey() }) } });
  const canAct = ["admin", "radiologist", "technologist", "receptionist"].includes(role);
  return (
    <Card>
      <CardHeader><CardTitle>Pending Scheduling ({pending.length})</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Patient</TableHead><TableHead>Modality</TableHead><TableHead className="text-right">Schedule</TableHead></TableRow></TableHeader>
          <TableBody>{pending.map(o => <ScheduleRow key={o.id} o={o} canAct={canAct} onSubmit={(at, tech) => schedule.mutate({ id: o.id, data: { scheduledAt: at, technologist: tech || undefined } })} />)}</TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ScheduleRow({ o, canAct, onSubmit }: { o: Order; canAct: boolean; onSubmit: (at: string, tech: string) => void }) {
  const [at, setAt] = useState("");
  const [tech, setTech] = useState("");
  return (
    <TableRow>
      <TableCell>{o.patientName}</TableCell>
      <TableCell>{o.modality} — {o.bodyPart}</TableCell>
      <TableCell className="text-right space-x-2">
        <Input type="datetime-local" value={at} onChange={e => setAt(e.target.value)} className="inline-block w-48" data-testid={`sch-at-${o.id}`} />
        <Input placeholder="Technologist" value={tech} onChange={e => setTech(e.target.value)} className="inline-block w-40" />
        {canAct && <Button size="sm" disabled={!at} data-testid={`btn-sch-${o.id}`} onClick={() => onSubmit(new Date(at).toISOString(), tech)}>Schedule</Button>}
      </TableCell>
    </TableRow>
  );
}

function CaptureTab({ role }: { role: string }) {
  const { data } = useListRadiologyOrders({});
  const ready = (data ?? []).filter(o => o.status === "pending" || o.status === "scheduled");
  const qc = useQueryClient();
  const capture = useCaptureRadiologyImages({ mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListRadiologyOrdersQueryKey() }) } });
  const canAct = ["admin", "radiologist", "technologist"].includes(role);
  return (
    <Card>
      <CardHeader><CardTitle>Ready for Capture ({ready.length})</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Patient</TableHead><TableHead>Modality</TableHead><TableHead>Scheduled</TableHead><TableHead className="text-right">Capture</TableHead></TableRow></TableHeader>
          <TableBody>{ready.map(o => <CaptureRow key={o.id} o={o} canAct={canAct} onSubmit={(img, pacs, tech) => capture.mutate({ id: o.id, data: { imageUrl: img || undefined, pacsUrl: pacs || undefined, technologist: tech || undefined } })} />)}</TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CaptureRow({ o, canAct, onSubmit }: { o: Order; canAct: boolean; onSubmit: (img: string, pacs: string, tech: string) => void }) {
  const [img, setImg] = useState("");
  const [pacs, setPacs] = useState("");
  const [tech, setTech] = useState(o.technologist ?? "");
  return (
    <TableRow>
      <TableCell>{o.patientName}</TableCell>
      <TableCell>{o.modality} — {o.bodyPart}</TableCell>
      <TableCell className="text-xs">{o.scheduledAt ? new Date(o.scheduledAt).toLocaleString() : "—"}</TableCell>
      <TableCell className="text-right space-x-2">
        <Input placeholder="Image URL" value={img} onChange={e => setImg(e.target.value)} className="inline-block w-44" data-testid={`cap-img-${o.id}`} />
        <Input placeholder="PACS URL" value={pacs} onChange={e => setPacs(e.target.value)} className="inline-block w-44" />
        <Input placeholder="Tech" value={tech} onChange={e => setTech(e.target.value)} className="inline-block w-28" />
        {canAct && <Button size="sm" data-testid={`btn-cap-${o.id}`} onClick={() => onSubmit(img, pacs, tech)}>Capture</Button>}
      </TableCell>
    </TableRow>
  );
}

function ReportTab({ role, reporterName }: { role: string; reporterName: string }) {
  const { data } = useListRadiologyOrders({});
  const captured = (data ?? []).filter(o => o.status === "captured");
  const canAct = ["admin", "radiologist", "doctor"].includes(role);
  return (
    <div className="space-y-3">
      {captured.map(o => <ReportEditor key={o.id} o={o} canAct={canAct} reporterName={reporterName} />)}
      {captured.length === 0 && <Card><CardContent className="p-6 text-center text-muted-foreground">No captured studies awaiting reporting.</CardContent></Card>}
    </div>
  );
}

function ReportEditor({ o, canAct, reporterName }: { o: Order; canAct: boolean; reporterName: string }) {
  const [findings, setFindings] = useState(o.findings ?? "");
  const [impression, setImpression] = useState(o.impression ?? "");
  const [radiologist, setRadiologist] = useState(o.radiologist ?? reporterName);
  const qc = useQueryClient();
  const save = useRecordRadiologyReport({ mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListRadiologyOrdersQueryKey() }) } });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">#{o.id} {o.patientName} — {o.modality} {o.bodyPart}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {o.imageUrl && <a className="text-blue-600 underline text-xs" href={o.imageUrl} target="_blank" rel="noreferrer">Open image</a>}
        <div><Label>Findings</Label><Textarea rows={4} value={findings} onChange={e => setFindings(e.target.value)} data-testid={`rep-find-${o.id}`} /></div>
        <div><Label>Impression</Label><Textarea rows={2} value={impression} onChange={e => setImpression(e.target.value)} data-testid={`rep-imp-${o.id}`} /></div>
        <div><Label>Radiologist</Label><Input value={radiologist} onChange={e => setRadiologist(e.target.value)} /></div>
        {canAct && <Button disabled={save.isPending} data-testid={`btn-rep-${o.id}`} onClick={() => save.mutate({ id: o.id, data: { findings, impression, radiologist } })}>Save Report</Button>}
      </CardContent>
    </Card>
  );
}

function VerifyTab({ role, verifierName }: { role: string; verifierName: string }) {
  const { data } = useListRadiologyOrders({});
  const reported = (data ?? []).filter(o => o.status === "reported");
  const qc = useQueryClient();
  const verify = useVerifyRadiologyReport({ mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListRadiologyOrdersQueryKey() }) } });
  const canAct = ["admin", "radiologist"].includes(role);
  return (
    <Card>
      <CardHeader><CardTitle>Awaiting Verification ({reported.length})</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {reported.map(o => (
          <Card key={o.id}><CardContent className="p-3 flex justify-between items-center">
            <div>
              <div className="font-medium">#{o.id} {o.patientName} — {o.modality} {o.bodyPart}</div>
              <div className="text-xs text-muted-foreground">{o.impression ?? o.findings ?? ""}</div>
            </div>
            <div className="space-x-2">
              <Button asChild size="sm" variant="outline"><a href={`/api/pdf/radiology-report/${o.id}`} target="_blank" rel="noreferrer"><Printer className="w-4 h-4 mr-1" /> Preview</a></Button>
              {canAct && <Button size="sm" data-testid={`btn-ver-${o.id}`} disabled={verify.isPending} onClick={() => verify.mutate({ id: o.id, data: { verifiedBy: verifierName || "Verifier" } })}>Verify & Sign</Button>}
            </div>
          </CardContent></Card>
        ))}
      </CardContent>
    </Card>
  );
}

function DispatchTab({ role }: { role: string }) {
  const { data } = useListRadiologyOrders({});
  const verified = (data ?? []).filter(o => o.status === "verified");
  const qc = useQueryClient();
  const dispatch = useDispatchRadiologyReport({ mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListRadiologyOrdersQueryKey() }) } });
  const canAct = ["admin", "radiologist", "technologist", "receptionist"].includes(role);
  return (
    <Card>
      <CardHeader><CardTitle>Verified — Ready to Dispatch ({verified.length})</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Patient</TableHead><TableHead>Study</TableHead><TableHead>Verified</TableHead><TableHead>Report</TableHead><TableHead className="text-right">Send</TableHead></TableRow></TableHeader>
          <TableBody>{verified.map(o => (
            <TableRow key={o.id}>
              <TableCell>{o.patientName}</TableCell>
              <TableCell>{o.modality} — {o.bodyPart}</TableCell>
              <TableCell className="text-xs">{o.verifiedBy} · {o.verifiedAt ? new Date(o.verifiedAt).toLocaleString() : ""}</TableCell>
              <TableCell><a className="text-blue-600 underline text-xs" href={`/api/pdf/radiology-report/${o.id}`} target="_blank" rel="noreferrer">PDF</a></TableCell>
              <TableCell className="text-right space-x-1">
                {canAct && <>
                  <Button size="sm" variant="outline" data-testid={`btn-dsms-${o.id}`} onClick={() => dispatch.mutate({ id: o.id, data: { via: "sms" } })}>SMS</Button>
                  <Button size="sm" variant="outline" data-testid={`btn-dwa-${o.id}`} onClick={() => dispatch.mutate({ id: o.id, data: { via: "whatsapp" } })}>WhatsApp</Button>
                  <Button size="sm" data-testid={`btn-dboth-${o.id}`} onClick={() => dispatch.mutate({ id: o.id, data: { via: "both" } })}>Both</Button>
                </>}
              </TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CatalogTab({ role }: { role: string }) {
  const { data } = useListRadiologyCatalog();
  const canEdit = ["admin", "radiologist"].includes(role);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Radiology Catalog ({(data ?? []).length})</CardTitle>
        {canEdit && <NewCatalogDialog />}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Modality</TableHead><TableHead>Body Part</TableHead><TableHead>Name</TableHead><TableHead>Price</TableHead><TableHead>GST</TableHead><TableHead>Duration</TableHead><TableHead>Active</TableHead></TableRow></TableHeader>
          <TableBody>{(data ?? []).map(c => (
            <TableRow key={c.id}>
              <TableCell className="font-mono text-xs">{c.code}</TableCell>
              <TableCell>{c.modality}</TableCell>
              <TableCell>{c.bodyPart}</TableCell>
              <TableCell>{c.name}</TableCell>
              <TableCell>₹{c.price.toFixed(2)}</TableCell>
              <TableCell>{c.gstRate}%</TableCell>
              <TableCell>{c.durationMin}m</TableCell>
              <TableCell>{c.active ? <Badge>Active</Badge> : <Badge variant="secondary">Off</Badge>}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function NewCatalogDialog() {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ code: "", modality: "X-Ray", bodyPart: "", name: "", price: "", gstRate: "12", durationMin: "15", prepInstructions: "" });
  const qc = useQueryClient();
  const create = useCreateRadiologyCatalogItem({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListRadiologyCatalogQueryKey() }); setOpen(false); } } });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button data-testid="btn-rad-new-cat"><Plus className="w-4 h-4 mr-1" /> Add Study</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New Radiology Study</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Code</Label><Input value={f.code} onChange={e => setF({ ...f, code: e.target.value })} data-testid="rad-cat-code" /></div>
          <div><Label>Modality</Label>
            <Select value={f.modality} onValueChange={(v) => setF({ ...f, modality: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["X-Ray", "CT", "MRI", "USG", "Mammography", "DEXA", "Fluoroscopy"].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Body Part</Label><Input value={f.bodyPart} onChange={e => setF({ ...f, bodyPart: e.target.value })} /></div>
          <div><Label>Name</Label><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></div>
          <div><Label>Price (₹)</Label><Input type="number" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} /></div>
          <div><Label>GST %</Label><Input type="number" value={f.gstRate} onChange={e => setF({ ...f, gstRate: e.target.value })} /></div>
          <div><Label>Duration (min)</Label><Input type="number" value={f.durationMin} onChange={e => setF({ ...f, durationMin: e.target.value })} /></div>
        </div>
        <Label>Prep instructions</Label>
        <Textarea value={f.prepInstructions} onChange={e => setF({ ...f, prepInstructions: e.target.value })} />
        <DialogFooter>
          <Button disabled={!f.code || !f.modality || !f.bodyPart || !f.name || create.isPending} data-testid="btn-create-rad-cat" onClick={() => create.mutate({ data: {
            code: f.code, modality: f.modality, bodyPart: f.bodyPart, name: f.name,
            price: f.price ? Number(f.price) : undefined,
            gstRate: f.gstRate ? Number(f.gstRate) : undefined,
            durationMin: f.durationMin ? Number(f.durationMin) : undefined,
            prepInstructions: f.prepInstructions || undefined,
            active: true,
          } })}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
