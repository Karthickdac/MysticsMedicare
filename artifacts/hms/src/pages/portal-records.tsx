import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/primitives/empty-state";
import { FolderHeart, FileText, FlaskConical, Scan, Pill, Activity, Syringe, Download, Stethoscope } from "lucide-react";
import { PortalShell, useApi, fmtDateTime, fmtDate } from "./portal-shell";

type Encounter = {
  id: number; type: string; status: string; doctorName: string | null;
  chiefComplaint: string | null; diagnosis: string | null; notes: string | null;
  startedAt: string; endedAt: string | null; dischargePdfUrl: string | null;
};
type Prescription = {
  id: number; drug: string; dosage: string | null; frequency: string | null;
  duration: string | null; instructions: string | null; status: string;
  createdAt: string; pdfUrl: string;
};
type Lab = {
  id: number; testName: string; category: string | null; status: string;
  collectedAt: string | null; verifiedAt: string | null;
};
type Rad = {
  id: number; modality: string; bodyPart: string; status: string;
  scheduledAt: string | null; performedAt: string | null;
};
type Vacc = { id: number; vaccineName: string; doseNumber: number | null; administeredAt: string; nextDueDate: string | null };
type Vital = {
  id: number; bp: string | null; pulse: number | null; temperature: number | null;
  spo2: number | null; respiratoryRate: number | null; weight: number | null;
  height: number | null; recordedAt: string;
};

export default function PortalRecords() {
  const [tab, setTab] = useState("encounters");
  return (
    <PortalShell active="records">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><FolderHeart className="w-6 h-6 text-primary" /> Medical Records</h1>
          <p className="text-sm text-muted-foreground">All your visits, prescriptions, reports, and vitals.</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-3 sm:grid-cols-6 gap-1">
          <TabsTrigger value="encounters"><Stethoscope className="w-3.5 h-3.5 mr-1" />Visits</TabsTrigger>
          <TabsTrigger value="prescriptions"><Pill className="w-3.5 h-3.5 mr-1" />Rx</TabsTrigger>
          <TabsTrigger value="lab"><FlaskConical className="w-3.5 h-3.5 mr-1" />Lab</TabsTrigger>
          <TabsTrigger value="radiology"><Scan className="w-3.5 h-3.5 mr-1" />Radiology</TabsTrigger>
          <TabsTrigger value="vaccinations"><Syringe className="w-3.5 h-3.5 mr-1" />Vaccines</TabsTrigger>
          <TabsTrigger value="vitals"><Activity className="w-3.5 h-3.5 mr-1" />Vitals</TabsTrigger>
        </TabsList>

        <TabsContent value="encounters" className="mt-4"><EncountersList /></TabsContent>
        <TabsContent value="prescriptions" className="mt-4"><PrescriptionsList /></TabsContent>
        <TabsContent value="lab" className="mt-4"><LabList /></TabsContent>
        <TabsContent value="radiology" className="mt-4"><RadList /></TabsContent>
        <TabsContent value="vaccinations" className="mt-4"><VaccinationsList /></TabsContent>
        <TabsContent value="vitals" className="mt-4"><VitalsList /></TabsContent>
      </Tabs>
    </PortalShell>
  );
}

function ListCard({ title, icon: Icon, children, loading, empty }: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  loading: boolean;
  empty: boolean;
}) {
  return (
    <Card className="border-card-border shadow-sm">
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Icon className="w-4 h-4 text-primary" /> {title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {loading && <Skeleton className="h-24 w-full" />}
        {!loading && empty && <EmptyState icon={Icon} title="Nothing here yet" />}
        {children}
      </CardContent>
    </Card>
  );
}

function EncountersList() {
  const { data, loading } = useApi<Encounter[]>("/portal/encounters", []);
  return (
    <ListCard title="Visit history" icon={Stethoscope} loading={loading} empty={!data || data.length === 0}>
      {data?.map((e) => (
        <div key={e.id} className="border border-border rounded-lg p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold capitalize">{e.type}{e.doctorName ? ` · ${e.doctorName}` : ""}</div>
              <div className="text-xs text-muted-foreground">{fmtDateTime(e.startedAt)}{e.endedAt ? ` → ${fmtDate(e.endedAt)}` : ""}</div>
            </div>
            <Badge variant="outline" className="capitalize text-[10px]">{e.status}</Badge>
          </div>
          {e.chiefComplaint && <div className="text-sm mt-2"><span className="text-muted-foreground">Complaint:</span> {e.chiefComplaint}</div>}
          {e.diagnosis && <div className="text-sm mt-1"><span className="text-muted-foreground">Diagnosis:</span> {e.diagnosis}</div>}
          {e.notes && <div className="text-sm mt-1 text-foreground/80">{e.notes}</div>}
          {e.dischargePdfUrl && (
            <a href={e.dischargePdfUrl} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="mt-3"><Download className="w-3 h-3 mr-1.5" /> Discharge summary</Button>
            </a>
          )}
        </div>
      ))}
    </ListCard>
  );
}

function PrescriptionsList() {
  const { data, loading } = useApi<Prescription[]>("/portal/prescriptions", []);
  return (
    <ListCard title="Prescriptions" icon={Pill} loading={loading} empty={!data || data.length === 0}>
      {data?.map((p) => (
        <div key={p.id} className="border border-border rounded-lg p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold">{p.drug}{p.dosage ? ` · ${p.dosage}` : ""}</div>
              <div className="text-xs text-muted-foreground">{[p.frequency, p.duration].filter(Boolean).join(" · ") || "—"}</div>
              <div className="text-xs text-muted-foreground mt-1">{fmtDate(p.createdAt)}</div>
              {p.instructions && <div className="text-sm mt-2 text-foreground/80 italic">"{p.instructions}"</div>}
            </div>
            <div className="flex flex-col gap-2 items-end">
              <Badge variant="outline" className="capitalize text-[10px]">{p.status}</Badge>
              <a href={p.pdfUrl} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm"><Download className="w-3 h-3 mr-1.5" /> PDF</Button>
              </a>
            </div>
          </div>
        </div>
      ))}
    </ListCard>
  );
}

function LabList() {
  const { data, loading } = useApi<Lab[]>("/portal/lab-reports", []);
  return (
    <ListCard title="Lab reports" icon={FlaskConical} loading={loading} empty={!data || data.length === 0}>
      {data?.map((l) => (
        <div key={l.id} className="flex items-center justify-between border border-border rounded-lg p-4 gap-3">
          <div className="min-w-0">
            <div className="font-semibold truncate">{l.testName}</div>
            <div className="text-xs text-muted-foreground">{l.category ?? "—"} · verified {fmtDate(l.verifiedAt)}</div>
          </div>
          <a href={`/api/portal/lab-reports/${l.id}/pdf`} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm"><FileText className="w-3 h-3 mr-1.5" /> PDF</Button>
          </a>
        </div>
      ))}
    </ListCard>
  );
}

function RadList() {
  const { data, loading } = useApi<Rad[]>("/portal/radiology-reports", []);
  return (
    <ListCard title="Radiology reports" icon={Scan} loading={loading} empty={!data || data.length === 0}>
      {data?.map((r) => (
        <div key={r.id} className="flex items-center justify-between border border-border rounded-lg p-4 gap-3">
          <div className="min-w-0">
            <div className="font-semibold truncate">{r.modality} · {r.bodyPart}</div>
            <div className="text-xs text-muted-foreground">{r.performedAt ? `Performed ${fmtDate(r.performedAt)}` : "—"}</div>
          </div>
          <a href={`/api/portal/radiology-reports/${r.id}/pdf`} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm"><FileText className="w-3 h-3 mr-1.5" /> PDF</Button>
          </a>
        </div>
      ))}
    </ListCard>
  );
}

function VaccinationsList() {
  const { data, loading } = useApi<Vacc[]>("/portal/vaccinations", []);
  return (
    <ListCard title="Vaccinations" icon={Syringe} loading={loading} empty={!data || data.length === 0}>
      {data?.map((v) => (
        <div key={v.id} className="flex items-center justify-between border border-border rounded-lg p-4 gap-3">
          <div className="min-w-0">
            <div className="font-semibold">{v.vaccineName}{v.doseNumber ? ` · Dose ${v.doseNumber}` : ""}</div>
            <div className="text-xs text-muted-foreground">Given {fmtDate(v.administeredAt)}{v.nextDueDate ? ` · Next due ${v.nextDueDate}` : ""}</div>
          </div>
        </div>
      ))}
    </ListCard>
  );
}

function VitalsList() {
  const { data, loading } = useApi<Vital[]>("/portal/vitals", []);
  return (
    <ListCard title="Vitals history" icon={Activity} loading={loading} empty={!data || data.length === 0}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-muted-foreground">
            <tr className="border-b border-border">
              <th className="text-left py-2 pr-3">Date</th>
              <th className="text-left py-2 pr-3">BP</th>
              <th className="text-left py-2 pr-3">Pulse</th>
              <th className="text-left py-2 pr-3">Temp</th>
              <th className="text-left py-2 pr-3">SpO₂</th>
              <th className="text-left py-2 pr-3">RR</th>
              <th className="text-left py-2 pr-3">Wt/Ht</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((v) => (
              <tr key={v.id} className="border-b border-border/50">
                <td className="py-2 pr-3 text-xs text-muted-foreground">{fmtDate(v.recordedAt)}</td>
                <td className="py-2 pr-3">{v.bp ?? "—"}</td>
                <td className="py-2 pr-3">{v.pulse ?? "—"}</td>
                <td className="py-2 pr-3">{v.temperature ?? "—"}</td>
                <td className="py-2 pr-3">{v.spo2 ?? "—"}</td>
                <td className="py-2 pr-3">{v.respiratoryRate ?? "—"}</td>
                <td className="py-2 pr-3">{v.weight ?? "—"}/{v.height ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ListCard>
  );
}
