import { useMemo, useState } from "react";
import { useListBills, type Bill } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, IndianRupee, Receipt } from "lucide-react";
import { Link, useLocation } from "wouter";
import { PageHeader } from "@/components/primitives/page-header";
import { FilterBar } from "@/components/primitives/filter-bar";
import { DataTable, type Column } from "@/components/primitives/data-table";
import { EmptyState } from "@/components/primitives/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatCard } from "@/components/primitives/stat-card";

const STATUSES = ["draft", "pending", "paid", "cancelled", "refunded"];
const statusTone: Record<string, string> = {
  paid: "bg-success/10 text-success border-success/30",
  pending: "bg-warning/10 text-warning border-warning/30",
  draft: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground line-through",
  refunded: "bg-destructive/10 text-destructive border-destructive/30",
};

function inr(n: number | string | undefined) {
  const v = typeof n === "number" ? n : Number(n ?? 0);
  return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Billing() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const { data: bills, isLoading } = useListBills(status ? { status } : {});

  const filtered = useMemo(() => {
    if (!search) return bills;
    const q = search.toLowerCase();
    return bills?.filter((b) => [b.billNumber, b.patientName].some((x) => x?.toLowerCase().includes(q)));
  }, [bills, search]);

  const totals = useMemo(() => {
    const all = bills ?? [];
    const paid = all.filter((b) => b.status === "paid").reduce((s, b) => s + Number(b.total), 0);
    const pending = all.filter((b) => b.status === "pending").reduce((s, b) => s + Number(b.total), 0);
    return { paid, pending, count: all.length };
  }, [bills]);

  const cols: Column<Bill>[] = [
    {
      key: "no",
      header: "Bill #",
      cell: (b) => <span className="font-mono text-xs font-medium">{b.billNumber}</span>,
      exportValue: (b) => b.billNumber,
    },
    {
      key: "date",
      header: "Date",
      cell: (b) => (
        <span className="text-sm">{new Date(b.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
      ),
      exportValue: (b) => new Date(b.createdAt).toISOString().slice(0, 10),
    },
    {
      key: "patient",
      header: "Patient",
      cell: (b) => <span className="font-medium">{b.patientName}</span>,
      exportValue: (b) => b.patientName ?? "",
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      cell: (b) => <span className="font-mono font-semibold tabular-nums">{inr(b.total)}</span>,
      exportValue: (b) => b.total,
    },
    {
      key: "status",
      header: "Status",
      cell: (b) => <Badge variant="outline" className={statusTone[b.status] ?? ""}>{b.status}</Badge>,
      exportValue: (b) => b.status,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (b) => (
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/billing/${b.id}`}>Open</Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <PageHeader
        eyebrow="Cashier"
        title="Billing"
        description="GST invoices, receipts and collections."
        icon={IndianRupee}
        actions={
          <Button asChild className="bg-brand-gradient text-white shadow-md hover:opacity-95">
            <Link href="/billing/new"><Plus className="w-4 h-4 mr-2" />Create Bill</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Collected" value={inr(totals.paid)} icon={IndianRupee} tone="success" loading={isLoading} hint="Paid bills (filtered)" />
        <StatCard label="Outstanding" value={inr(totals.pending)} icon={Receipt} tone="warning" loading={isLoading} hint="Pending bills (filtered)" />
        <StatCard label="Bills (current view)" value={totals.count} icon={Receipt} tone="primary" loading={isLoading} />
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search bill # or patient…"
        hasFilters={!!status || !!search}
        onClear={() => { setStatus(""); setSearch(""); }}
      >
        <Select value={status || "__all__"} onValueChange={(v) => setStatus(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-[160px] h-9 bg-background"><SelectValue placeholder="Any status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Any status</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </FilterBar>

      <DataTable
        columns={cols}
        data={filtered}
        loading={isLoading}
        rowKey={(b) => b.id}
        pageSize={25}
        exportable
        csvName="bills.csv"
        onRowClick={(b) => setLocation(`/billing/${b.id}`)}
        empty={
          <EmptyState
            icon={Receipt}
            title="No bills found"
            description={search || status ? "Try clearing the filters." : "Create your first bill to get started."}
            action={<Button asChild><Link href="/billing/new"><Plus className="w-4 h-4 mr-2" />Create Bill</Link></Button>}
          />
        }
      />
    </div>
  );
}
