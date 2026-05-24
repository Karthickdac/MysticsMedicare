import { useMemo, useState } from "react";
import {
  useGetCollectionsReport,
  useGetGstr1Report,
  useGetOutstandingReport,
  useListStaff,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/primitives/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, BarChart3 } from "lucide-react";

function inr(n: number | null | undefined) {
  if (n == null) return "—";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const escape = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = [headers, ...rows].map((r) => r.map(escape).join(",")).join("\n");
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function todayIso() { return new Date().toISOString().slice(0, 10); }
function monthStartIso() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }

export default function BillingReports() {
  const [from, setFrom] = useState(monthStartIso());
  const [to, setTo] = useState(todayIso());

  return (
    <div className="p-6 space-y-6 max-w-[1500px] mx-auto">
      <PageHeader
        eyebrow="Finance"
        title="Billing Reports"
        description="Collections, GSTR-1, and outstanding receivables — exportable to CSV."
        icon={BarChart3}
      />

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-4">
          <div><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <p className="text-xs text-muted-foreground">Filters apply to Collections and GSTR-1. Outstanding shows all open balances.</p>
        </CardContent>
      </Card>

      <Tabs defaultValue="collections">
        <TabsList>
          <TabsTrigger value="collections">Daily Collections</TabsTrigger>
          <TabsTrigger value="gstr1">GSTR-1</TabsTrigger>
          <TabsTrigger value="outstanding">Outstanding</TabsTrigger>
        </TabsList>
        <TabsContent value="collections"><CollectionsTab from={from} to={to} /></TabsContent>
        <TabsContent value="gstr1"><Gstr1Tab from={from} to={to} /></TabsContent>
        <TabsContent value="outstanding"><OutstandingTab /></TabsContent>
      </Tabs>
    </div>
  );
}

const GROUP_DIMS = ["date", "mode", "doctor", "department"] as const;
type GroupDim = typeof GROUP_DIMS[number];

function CollectionsTab({ from, to }: { from: string; to: string }) {
  const [doctorId, setDoctorId] = useState<string>("all");
  const [department, setDepartment] = useState<string>("");
  const [groupDims, setGroupDims] = useState<GroupDim[]>(["date", "mode"]);
  const { data: staff } = useListStaff();
  const doctors = useMemo(() => (staff ?? []).filter((s) => s.role === "doctor"), [staff]);
  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const s of doctors) if (s.department) set.add(s.department);
    return Array.from(set).sort();
  }, [doctors]);
  const params = useMemo(() => ({
    from, to,
    ...(doctorId !== "all" ? { doctorId: Number(doctorId) } : {}),
    ...(department ? { department } : {}),
    groupBy: groupDims.join(","),
  }), [from, to, doctorId, department, groupDims]);
  const { data, isLoading } = useGetCollectionsReport(params);
  const rows = data ?? [];
  const total = useMemo(() => rows.reduce((s, r) => s + r.amount, 0), [rows]);
  const showDate = groupDims.includes("date");
  const showMode = groupDims.includes("mode");
  const showDoctor = groupDims.includes("doctor");
  const showDept = groupDims.includes("department");
  const toggleDim = (d: GroupDim) => setGroupDims((cur) => cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]);
  return (
    <Card>
      <CardHeader className="pb-2 space-y-3">
        <div className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Daily Collections</CardTitle>
            <p className="text-xs text-muted-foreground">Total: <strong>{inr(total)}</strong> across {rows.length} rows</p>
          </div>
          <Button variant="outline" size="sm" disabled={rows.length === 0} onClick={() => downloadCsv(
            `collections-${from}-to-${to}.csv`,
            [...(showDate ? ["Date"] : []), ...(showMode ? ["Mode"] : []), ...(showDoctor ? ["Doctor"] : []), ...(showDept ? ["Department"] : []), "Amount", "Count"],
            rows.map((r) => [
              ...(showDate ? [r.date ?? ""] : []),
              ...(showMode ? [r.mode ?? ""] : []),
              ...(showDoctor ? [r.doctorName ?? ""] : []),
              ...(showDept ? [r.department ?? ""] : []),
              r.amount.toFixed(2), r.count,
            ]),
          )}>
            <Download className="w-4 h-4 mr-2" /> CSV
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-3 text-xs">
          <div className="space-y-1">
            <Label className="text-xs">Doctor</Label>
            <Select value={doctorId} onValueChange={setDoctorId}>
              <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All doctors</SelectItem>
                {doctors.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Department</Label>
            <Select value={department || "_all"} onValueChange={(v) => setDepartment(v === "_all" ? "" : v)}>
              <SelectTrigger className="h-8 w-44"><SelectValue placeholder="All departments" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All departments</SelectItem>
                {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Group by</Label>
            <div className="flex gap-1">
              {GROUP_DIMS.map((d) => (
                <Button key={d} type="button" size="sm"
                  variant={groupDims.includes(d) ? "default" : "outline"}
                  className="h-7 px-2 capitalize text-xs"
                  onClick={() => toggleDim(d)}>{d}</Button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? <div className="p-6 text-sm">Loading…</div> : rows.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">No collections in range.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground border-y border-border">
              <tr>
                {showDate && <th className="py-2 px-4 text-left">Date</th>}
                {showMode && <th className="py-2 px-3 text-left">Mode</th>}
                {showDoctor && <th className="py-2 px-3 text-left">Doctor</th>}
                {showDept && <th className="py-2 px-3 text-left">Department</th>}
                <th className="py-2 px-3 text-right">Receipts</th>
                <th className="py-2 px-4 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r, i) => (
                <tr key={i}>
                  {showDate && <td className="py-2 px-4">{r.date ?? "—"}</td>}
                  {showMode && <td className="py-2 px-3 uppercase">{r.mode ?? "—"}</td>}
                  {showDoctor && <td className="py-2 px-3">{r.doctorName ?? "—"}</td>}
                  {showDept && <td className="py-2 px-3">{r.department ?? "—"}</td>}
                  <td className="py-2 px-3 text-right tabular-nums">{r.count}</td>
                  <td className="py-2 px-4 text-right tabular-nums font-medium">{inr(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function Gstr1Tab({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useGetGstr1Report({ from, to });
  const rows = data ?? [];
  const totals = useMemo(() => rows.reduce((acc, r) => ({
    sub: acc.sub + r.subtotal, disc: acc.disc + r.discount,
    cgst: acc.cgst + r.cgst, sgst: acc.sgst + r.sgst, igst: acc.igst + r.igst, total: acc.total + r.total,
  }), { sub: 0, disc: 0, cgst: 0, sgst: 0, igst: 0, total: 0 }), [rows]);
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">GSTR-1 (Tax Invoices)</CardTitle>
          <p className="text-xs text-muted-foreground">{rows.length} invoices • Taxable {inr(totals.sub - totals.disc)} • CGST {inr(totals.cgst)} • SGST {inr(totals.sgst)} • IGST {inr(totals.igst)} • Total {inr(totals.total)}</p>
        </div>
        <Button variant="outline" size="sm" disabled={rows.length === 0} onClick={() => downloadCsv(
          `gstr1-${from}-to-${to}.csv`,
          ["Bill #", "Date", "Patient", "GST Mode", "Subtotal", "Discount", "CGST", "SGST", "IGST", "Total"],
          rows.map((r) => [r.billNumber, r.date, r.patientName, r.gstMode, r.subtotal.toFixed(2), r.discount.toFixed(2), r.cgst.toFixed(2), r.sgst.toFixed(2), r.igst.toFixed(2), r.total.toFixed(2)]),
        )}>
          <Download className="w-4 h-4 mr-2" /> CSV
        </Button>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        {isLoading ? <div className="p-6 text-sm">Loading…</div> : rows.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">No invoices in range.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground border-y border-border">
              <tr>
                <th className="py-2 px-3 text-left">Bill #</th><th className="py-2 px-3 text-left">Date</th><th className="py-2 px-3 text-left">Patient</th><th className="py-2 px-3 text-left">GST</th>
                <th className="py-2 px-3 text-right">Subtotal</th><th className="py-2 px-3 text-right">Disc</th>
                <th className="py-2 px-3 text-right">CGST</th><th className="py-2 px-3 text-right">SGST</th><th className="py-2 px-3 text-right">IGST</th>
                <th className="py-2 px-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="py-2 px-3 font-mono text-xs">{r.billNumber}</td>
                  <td className="py-2 px-3">{r.date}</td>
                  <td className="py-2 px-3">{r.patientName}</td>
                  <td className="py-2 px-3 uppercase text-xs">{r.gstMode}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{inr(r.subtotal)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{r.discount > 0 ? inr(r.discount) : "—"}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{r.cgst > 0 ? inr(r.cgst) : "—"}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{r.sgst > 0 ? inr(r.sgst) : "—"}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{r.igst > 0 ? inr(r.igst) : "—"}</td>
                  <td className="py-2 px-3 text-right tabular-nums font-medium">{inr(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function OutstandingTab() {
  const { data, isLoading } = useGetOutstandingReport();
  const rows = data ?? [];
  const total = useMemo(() => rows.reduce((s, r) => s + r.balance, 0), [rows]);
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Outstanding Receivables</CardTitle>
          <p className="text-xs text-muted-foreground">{rows.length} open bills • Total due <strong>{inr(total)}</strong></p>
        </div>
        <Button variant="outline" size="sm" disabled={rows.length === 0} onClick={() => downloadCsv(
          `outstanding-${todayIso()}.csv`,
          ["Bill #", "Date", "Patient", "Total", "Paid", "Balance", "Age (days)", "Status"],
          rows.map((r) => [r.billNumber, r.date, r.patientName, r.total.toFixed(2), r.paidAmount.toFixed(2), r.balance.toFixed(2), r.ageDays, r.status]),
        )}>
          <Download className="w-4 h-4 mr-2" /> CSV
        </Button>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        {isLoading ? <div className="p-6 text-sm">Loading…</div> : rows.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">No outstanding balances — well done!</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground border-y border-border">
              <tr><th className="py-2 px-3 text-left">Bill #</th><th className="py-2 px-3 text-left">Date</th><th className="py-2 px-3 text-left">Patient</th><th className="py-2 px-3 text-right">Total</th><th className="py-2 px-3 text-right">Paid</th><th className="py-2 px-3 text-right">Balance</th><th className="py-2 px-3 text-right">Age</th><th className="py-2 px-3 text-left">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="py-2 px-3 font-mono text-xs">{r.billNumber}</td>
                  <td className="py-2 px-3">{r.date}</td>
                  <td className="py-2 px-3">{r.patientName}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{inr(r.total)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{inr(r.paidAmount)}</td>
                  <td className="py-2 px-3 text-right tabular-nums font-medium text-destructive">{inr(r.balance)}</td>
                  <td className={`py-2 px-3 text-right tabular-nums ${r.ageDays > 30 ? "text-destructive font-semibold" : ""}`}>{r.ageDays}d</td>
                  <td className="py-2 px-3 uppercase text-xs">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
