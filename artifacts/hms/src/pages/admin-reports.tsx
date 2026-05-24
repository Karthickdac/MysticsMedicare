import { useMemo, useState } from "react";
import { useGetAdminReportsOverview } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarChart3, Download, IndianRupee, Activity, BedDouble, UserCog, Stethoscope } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

function inr(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}
function csvEscape(v: unknown) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function download(name: string, rows: (string | number)[][]) {
  const blob = new Blob([rows.map((r) => r.map(csvEscape).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
function defaultRange() {
  const to = new Date();
  const from = new Date(); from.setDate(to.getDate() - 29);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default function AdminReports() {
  const init = defaultRange();
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const { data, isLoading, isFetching } = useGetAdminReportsOverview({ from, to });

  const setPreset = (days: number) => {
    const t = new Date(); const f = new Date(); f.setDate(t.getDate() - (days - 1));
    setFrom(f.toISOString().slice(0, 10)); setTo(t.toISOString().slice(0, 10));
  };

  const totals = useMemo(() => {
    if (!data) return null;
    const rev = data.revenueByDay.reduce((s, r) => ({
      gross: s.gross + r.gross, net: s.net + r.net, collected: s.collected + r.collected, discount: s.discount + r.discount, tax: s.tax + r.tax,
    }), { gross: 0, net: 0, collected: 0, discount: 0, tax: 0 });
    const opd = data.opdVolume.reduce((s, r) => s + r.count, 0);
    const admissions = data.ipdCensus.reduce((s, r) => s + r.admitted, 0);
    const occupancyAvg = data.ipdCensus.length ? data.ipdCensus.reduce((s, r) => s + r.occupied, 0) / data.ipdCensus.length : 0;
    return { ...rev, opd, admissions, occupancyAvg };
  }, [data]);

  function exportAll() {
    if (!data) return;
    const lines: (string | number)[][] = [];
    lines.push(["# OPD Volume"]); lines.push(["date","count"]);
    data.opdVolume.forEach((r) => lines.push([r.date, r.count]));
    lines.push([]); lines.push(["# IPD Census"]); lines.push(["date","admitted","discharged","occupied","avgLos"]);
    data.ipdCensus.forEach((r) => lines.push([r.date, r.admitted, r.discharged, r.occupied, r.avgLos]));
    lines.push([]); lines.push(["# Revenue by Day"]); lines.push(["date","gross","discount","tax","net","collected"]);
    data.revenueByDay.forEach((r) => lines.push([r.date, r.gross, r.discount, r.tax, r.net, r.collected]));
    lines.push([]); lines.push(["# Top Doctors"]); lines.push(["doctorId","name","encounters","revenue"]);
    data.topDoctors.forEach((r) => lines.push([r.doctorId, r.name, r.encounters, r.revenue]));
    lines.push([]); lines.push(["# Top Services"]); lines.push(["name","count","revenue"]);
    data.topServices.forEach((r) => lines.push([r.name, r.count, r.revenue]));
    lines.push([]); lines.push(["# GST Summary"]); lines.push(["taxableValue","cgst","sgst","igst","totalTax"]);
    lines.push([data.gstSummary.taxableValue, data.gstSummary.cgst, data.gstSummary.sgst, data.gstSummary.igst, data.gstSummary.totalTax]);
    download(`admin-reports-${from}_to_${to}.csv`, lines);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><BarChart3 className="w-6 h-6 text-primary" />Reports hub</h1>
          <p className="text-muted-foreground">OPD volume, IPD census, revenue, doctors & services, and GST summary.</p>
        </div>
        <div className="flex gap-2 items-end flex-wrap">
          <div className="space-y-1"><Label className="text-xs uppercase tracking-wider">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[150px]" /></div>
          <div className="space-y-1"><Label className="text-xs uppercase tracking-wider">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[150px]" /></div>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => setPreset(7)}>7d</Button>
            <Button size="sm" variant="outline" onClick={() => setPreset(30)}>30d</Button>
            <Button size="sm" variant="outline" onClick={() => setPreset(90)}>90d</Button>
          </div>
          <Button variant="outline" onClick={exportAll} disabled={!data}><Download className="w-4 h-4 mr-2" />Export CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi icon={Activity} label="OPD visits" value={isLoading ? "—" : String(totals?.opd ?? 0)} tone="text-blue-600" />
        <Kpi icon={BedDouble} label="Admissions" value={isLoading ? "—" : String(totals?.admissions ?? 0)} tone="text-amber-600" />
        <Kpi icon={UserCog} label="Avg occupancy" value={isLoading ? "—" : (totals?.occupancyAvg ?? 0).toFixed(1)} tone="text-indigo-600" />
        <Kpi icon={IndianRupee} label="Net revenue" value={isLoading ? "—" : inr(totals?.net ?? 0)} tone="text-emerald-600" />
        <Kpi icon={IndianRupee} label="Collected" value={isLoading ? "—" : inr(totals?.collected ?? 0)} tone="text-success" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="OPD volume" description="Outpatient encounters per day">
          {isLoading ? <Skeleton className="h-[260px] w-full" /> : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data?.opdVolume ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#0ea5e9" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="IPD census" description="Admitted / discharged / occupied beds">
          {isLoading ? <Skeleton className="h-[260px] w-full" /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data?.ipdCensus ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="admitted" fill="#10b981" />
                <Bar dataKey="discharged" fill="#f59e0b" />
                <Bar dataKey="occupied" fill="#6366f1" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Revenue & collections" description="Net billed vs amount collected per day" className="lg:col-span-2">
          {isLoading ? <Skeleton className="h-[260px] w-full" /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data?.revenueByDay ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => inr(Number(v)).replace("₹", "₹")} width={90} />
                <Tooltip formatter={(v) => inr(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="net" fill="#0ea5e9" name="Net billed" />
                <Bar dataKey="collected" fill="#10b981" name="Collected" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Top doctors" description="Most active doctors in the range" icon={Stethoscope}>
          {isLoading ? <Skeleton className="h-[260px] w-full" /> : (
            <div className="divide-y">
              {(data?.topDoctors ?? []).length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">No data</div>}
              {(data?.topDoctors ?? []).map((d) => (
                <div key={d.doctorId} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0"><div className="font-medium truncate">{d.name}</div><div className="text-xs text-muted-foreground">{d.encounters} encounter{d.encounters === 1 ? "" : "s"}</div></div>
                  <div className="text-sm font-semibold tabular-nums">{inr(d.revenue)}</div>
                </div>
              ))}
            </div>
          )}
        </ChartCard>

        <ChartCard title="Top services" description="Most-billed catalog items">
          {isLoading ? <Skeleton className="h-[260px] w-full" /> : (
            <div className="divide-y">
              {(data?.topServices ?? []).length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">No data</div>}
              {(data?.topServices ?? []).map((s, i) => (
                <div key={i} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0"><div className="font-medium truncate">{s.name}</div><div className="text-xs text-muted-foreground">{s.count} billing line{s.count === 1 ? "" : "s"}</div></div>
                  <div className="text-sm font-semibold tabular-nums">{inr(s.revenue)}</div>
                </div>
              ))}
            </div>
          )}
        </ChartCard>

        <ChartCard title="GST summary" description="Taxable value and tax breakdown" className="lg:col-span-2">
          {isLoading ? <Skeleton className="h-[120px] w-full" /> : (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Kpi label="Taxable value" value={inr(data?.gstSummary.taxableValue ?? 0)} />
              <Kpi label="CGST" value={inr(data?.gstSummary.cgst ?? 0)} />
              <Kpi label="SGST" value={inr(data?.gstSummary.sgst ?? 0)} />
              <Kpi label="IGST" value={inr(data?.gstSummary.igst ?? 0)} />
              <Kpi label="Total tax" value={inr(data?.gstSummary.totalTax ?? 0)} tone="text-emerald-600" />
            </div>
          )}
        </ChartCard>
      </div>

      {isFetching && <div className="text-xs text-muted-foreground text-right">Refreshing…</div>}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone = "text-foreground" }: { icon?: React.ComponentType<{ className?: string }>; label: string; value: string; tone?: string }) {
  return (
    <Card><CardContent className="p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        {Icon && <Icon className={`w-4 h-4 ${tone}`} />}
      </div>
      <div className={`text-lg font-bold tabular-nums mt-0.5 ${tone}`}>{value}</div>
    </CardContent></Card>
  );
}

function ChartCard({ title, description, icon: Icon, children, className }: { title: string; description?: string; icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">{Icon && <Icon className="w-4 h-4 text-primary" />}{title}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
