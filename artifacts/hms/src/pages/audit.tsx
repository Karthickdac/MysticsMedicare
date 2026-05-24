import { useMemo, useState } from "react";
import { useListAuditLog } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListTree, Download, ChevronLeft, ChevronRight, Search, X } from "lucide-react";

const PAGE_SIZE = 50;

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function Audit() {
  const [entity, setEntity] = useState("");
  const [action, setAction] = useState("");
  const [q, setQ] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(0);

  const params = useMemo(() => {
    const p: Record<string, string | number> = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
    if (entity) p.entity = entity;
    if (action) p.action = action;
    if (q.trim()) p.q = q.trim();
    if (fromDate) p.fromDate = fromDate;
    if (toDate) p.toDate = toDate;
    return p;
  }, [entity, action, q, fromDate, toDate, page]);

  const { data: logs, isLoading, isFetching, refetch } = useListAuditLog(params);
  const rows = logs ?? [];
  const hasMore = rows.length === PAGE_SIZE;

  function reset() {
    setEntity(""); setAction(""); setQ(""); setFromDate(""); setToDate(""); setPage(0);
  }

  function exportCsv() {
    const head = ["timestamp", "user", "action", "entity", "entity_id", "ip", "details"];
    const lines = [head.join(",")];
    for (const r of rows) {
      lines.push([r.createdAt, r.userName, r.action, r.entity, r.entityId ?? "", r.ipAddress ?? "", r.details ?? ""].map(csvEscape).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-${new Date().toISOString().slice(0, 10)}-page${page + 1}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const actionTone = (a: string) => {
    const k = a.toLowerCase();
    if (k.includes("create") || k.includes("add")) return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
    if (k.includes("update") || k.includes("edit") || k.includes("patch")) return "bg-blue-500/10 text-blue-600 border-blue-500/20";
    if (k.includes("delete") || k.includes("void") || k.includes("remove")) return "bg-red-500/10 text-red-600 border-red-500/20";
    if (k.includes("login")) return "bg-indigo-500/10 text-indigo-600 border-indigo-500/20";
    return "bg-gray-500/10 text-gray-600 border-gray-500/20";
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><ListTree className="w-6 h-6 text-primary" />Audit Log</h1>
          <p className="text-muted-foreground">Tamper-evident activity trail for compliance and forensics.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>Refresh</Button>
          <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}><Download className="w-4 h-4 mr-2" />Export CSV</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-6 gap-3 border-b">
          <div className="md:col-span-2 space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Search</Label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} className="pl-9" placeholder="User, entity, details…" data-testid="input-audit-search" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Entity</Label>
            <Select value={entity || "all"} onValueChange={(v) => { setEntity(v === "all" ? "" : v); setPage(0); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {["patient","appointment","encounter","bill","admission","prescription","lab","radiology","pharmacy_sale","staff","role","hospital_settings","session"].map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Action</Label>
            <Select value={action || "all"} onValueChange={(v) => { setAction(v === "all" ? "" : v); setPage(0); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {["create","update","delete","login","logout","void","refund","collect","dispense"].map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">From</Label>
            <Input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(0); }} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">To</Label>
            <Input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(0); }} />
          </div>
          <div className="md:col-span-6 flex justify-between items-center">
            <Button variant="ghost" size="sm" onClick={reset}><X className="w-3.5 h-3.5 mr-1.5" />Clear filters</Button>
            <div className="text-xs text-muted-foreground">Page <span className="tabular-nums">{page + 1}</span> · showing {rows.length} entries</div>
          </div>
        </CardContent>

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 6 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>)}</TableRow>
              )) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">No audit entries match these filters</TableCell></TableRow>
              ) : rows.map((log) => (
                <TableRow key={log.id} className="text-sm" data-testid={`row-audit-${log.id}`}>
                  <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                    {new Date(log.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </TableCell>
                  <TableCell className="font-medium">{log.userName}</TableCell>
                  <TableCell><Badge variant="outline" className={`uppercase text-[10px] tracking-wider ${actionTone(log.action)}`}>{log.action}</Badge></TableCell>
                  <TableCell className="font-mono text-xs text-primary">{log.entity}{log.entityId != null ? ` #${log.entityId}` : ""}</TableCell>
                  <TableCell className="max-w-md truncate text-muted-foreground" title={log.details ?? ""}>{log.details ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground/70">{log.ipAddress ?? "system"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>

        <div className="p-3 flex items-center justify-between border-t bg-muted/20">
          <Button variant="outline" size="sm" disabled={page === 0 || isFetching} onClick={() => setPage((p) => Math.max(0, p - 1))}><ChevronLeft className="w-4 h-4 mr-1" />Prev</Button>
          <span className="text-xs text-muted-foreground">{hasMore ? "More entries available" : "End of results"}</span>
          <Button variant="outline" size="sm" disabled={!hasMore || isFetching} onClick={() => setPage((p) => p + 1)}>Next<ChevronRight className="w-4 h-4 ml-1" /></Button>
        </div>
      </Card>
    </div>
  );
}
