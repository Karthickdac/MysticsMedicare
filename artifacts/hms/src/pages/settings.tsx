import { useEffect, useMemo, useState } from "react";
import {
  useGetHospitalSettings,
  useUpdateHospitalSettings,
  getGetHospitalSettingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings as SettingsIcon, Plus, Trash2, Save, Building2, Receipt, Clock, CalendarOff } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

const DAYS = [
  { key: "mon", label: "Monday" }, { key: "tue", label: "Tuesday" }, { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" }, { key: "fri", label: "Friday" }, { key: "sat", label: "Saturday" }, { key: "sun", label: "Sunday" },
] as const;

type DayCfg = { open?: string; close?: string; closed?: boolean };
type Holiday = { date: string; label: string };

export default function Settings() {
  const { data, isLoading } = useGetHospitalSettings();
  const update = useUpdateHospitalSettings();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [form, setForm] = useState<Record<string, string>>({});
  const [hours, setHours] = useState<Record<string, DayCfg>>({});
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [newHoliday, setNewHoliday] = useState<Holiday>({ date: "", label: "" });

  useEffect(() => {
    if (!data) return;
    setForm({
      name: data.name ?? "",
      legalName: data.legalName ?? "",
      gstin: data.gstin ?? "",
      pan: data.pan ?? "",
      address: data.address ?? "",
      city: data.city ?? "",
      state: data.state ?? "",
      pincode: data.pincode ?? "",
      phone: data.phone ?? "",
      email: data.email ?? "",
      website: data.website ?? "",
      logoUrl: data.logoUrl ?? "",
      primaryColor: data.primaryColor ?? "#0ea5e9",
      invoicePrefix: data.invoicePrefix ?? "INV",
      receiptPrefix: data.receiptPrefix ?? "RCT",
    });
    setHours((data.workingHours as Record<string, DayCfg>) ?? {});
    setHolidays((data.holidays as Holiday[]) ?? []);
  }, [data]);

  const dirty = useMemo(() => true, []); // keep button always enabled — server is the source of truth

  function set(field: string, value: string) { setForm((f) => ({ ...f, [field]: value })); }
  function setDay(key: string, patch: Partial<DayCfg>) {
    setHours((h) => ({ ...h, [key]: { ...(h[key] ?? {}), ...patch } }));
  }
  function addHoliday() {
    if (!newHoliday.date || !newHoliday.label.trim()) return;
    setHolidays((h) => [...h, newHoliday].sort((a, b) => a.date.localeCompare(b.date)));
    setNewHoliday({ date: "", label: "" });
  }
  function removeHoliday(i: number) { setHolidays((h) => h.filter((_, idx) => idx !== i)); }

  function save() {
    const payload = {
      ...form,
      workingHours: hours,
      holidays,
    };
    update.mutate({ data: payload }, {
      onSuccess: () => { toast({ title: "Settings saved" }); qc.invalidateQueries({ queryKey: getGetHospitalSettingsQueryKey() }); },
      onError: (e) => toast({ title: "Save failed", description: (e as Error).message, variant: "destructive" }),
    });
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><SettingsIcon className="w-6 h-6 text-primary" />Hospital settings</h1>
          <p className="text-muted-foreground">Organization profile, branding, billing prefixes, working hours, and holidays.</p>
        </div>
        <Button onClick={save} disabled={!dirty || isLoading || update.isPending} data-testid="button-save-settings">
          <Save className="w-4 h-4 mr-2" />{update.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>

      <Tabs defaultValue="org">
        <TabsList>
          <TabsTrigger value="org"><Building2 className="w-4 h-4 mr-2" />Organization</TabsTrigger>
          <TabsTrigger value="billing"><Receipt className="w-4 h-4 mr-2" />Billing</TabsTrigger>
          <TabsTrigger value="hours"><Clock className="w-4 h-4 mr-2" />Working hours</TabsTrigger>
          <TabsTrigger value="holidays"><CalendarOff className="w-4 h-4 mr-2" />Holidays</TabsTrigger>
        </TabsList>

        <TabsContent value="org" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Organization profile</CardTitle><CardDescription>Appears on invoices, prescriptions, and the patient portal.</CardDescription></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Row label="Display name"><Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} data-testid="input-name" /></Row>
              <Row label="Legal entity"><Input value={form.legalName ?? ""} onChange={(e) => set("legalName", e.target.value)} /></Row>
              <Row label="GSTIN"><Input value={form.gstin ?? ""} onChange={(e) => set("gstin", e.target.value)} placeholder="22AAAAA0000A1Z5" /></Row>
              <Row label="PAN"><Input value={form.pan ?? ""} onChange={(e) => set("pan", e.target.value)} placeholder="AAAAA0000A" /></Row>
              <Row label="Phone"><Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></Row>
              <Row label="Email"><Input value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} type="email" /></Row>
              <Row label="Website" className="col-span-2"><Input value={form.website ?? ""} onChange={(e) => set("website", e.target.value)} /></Row>
              <Row label="Address" className="col-span-2"><Input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} /></Row>
              <Row label="City"><Input value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} /></Row>
              <Row label="State"><Input value={form.state ?? ""} onChange={(e) => set("state", e.target.value)} /></Row>
              <Row label="PIN code"><Input value={form.pincode ?? ""} onChange={(e) => set("pincode", e.target.value)} /></Row>
              <Row label="Logo URL"><Input value={form.logoUrl ?? ""} onChange={(e) => set("logoUrl", e.target.value)} placeholder="https://…" /></Row>
              <Row label="Primary brand color">
                <div className="flex gap-2 items-center">
                  <Input type="color" value={form.primaryColor ?? "#0ea5e9"} onChange={(e) => set("primaryColor", e.target.value)} className="w-16 p-1 h-9" />
                  <Input value={form.primaryColor ?? ""} onChange={(e) => set("primaryColor", e.target.value)} className="flex-1" />
                </div>
              </Row>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Number prefixes</CardTitle><CardDescription>Prefixes used when generating new bill / receipt numbers.</CardDescription></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Row label="Invoice prefix"><Input value={form.invoicePrefix ?? ""} onChange={(e) => set("invoicePrefix", e.target.value)} /></Row>
              <Row label="Receipt prefix"><Input value={form.receiptPrefix ?? ""} onChange={(e) => set("receiptPrefix", e.target.value)} /></Row>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hours" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Working hours</CardTitle><CardDescription>Drives appointment slot generation and roster defaults.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {DAYS.map((d) => {
                const cfg = hours[d.key] ?? {};
                return (
                  <div key={d.key} className="grid grid-cols-[120px_1fr_1fr_120px] gap-3 items-center">
                    <div className="font-medium">{d.label}</div>
                    <Input type="time" disabled={cfg.closed} value={cfg.open ?? ""} onChange={(e) => setDay(d.key, { open: e.target.value })} />
                    <Input type="time" disabled={cfg.closed} value={cfg.close ?? ""} onChange={(e) => setDay(d.key, { close: e.target.value })} />
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={!!cfg.closed} onChange={(e) => setDay(d.key, { closed: e.target.checked })} />
                      Closed
                    </label>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="holidays" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Holiday calendar</CardTitle><CardDescription>Block non-emergency appointments on listed dates.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-[160px_1fr_120px] gap-2 items-end">
                <div><Label className="text-xs uppercase tracking-wider">Date</Label><Input type="date" value={newHoliday.date} onChange={(e) => setNewHoliday((h) => ({ ...h, date: e.target.value }))} /></div>
                <div><Label className="text-xs uppercase tracking-wider">Label</Label><Input value={newHoliday.label} onChange={(e) => setNewHoliday((h) => ({ ...h, label: e.target.value }))} placeholder="e.g. Republic Day" /></div>
                <Button type="button" variant="outline" onClick={addHoliday}><Plus className="w-4 h-4 mr-2" />Add</Button>
              </div>
              <div className="divide-y border rounded-md">
                {holidays.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">No holidays configured.</div>
                ) : holidays.map((h, i) => (
                  <div key={i} className="flex justify-between items-center p-2.5 hover:bg-muted/30">
                    <div><span className="font-mono text-xs mr-3">{h.date}</span><span>{h.label}</span></div>
                    <Button size="icon" variant="ghost" onClick={() => removeHoliday(i)} className="text-destructive"><Trash2 className="w-4 h-4" /></Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
