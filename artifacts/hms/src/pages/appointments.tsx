import { useMemo, useState } from "react";
import { useListAppointments, type Appointment } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Plus, Stethoscope } from "lucide-react";
import { PageHeader } from "@/components/primitives/page-header";
import { FilterBar } from "@/components/primitives/filter-bar";
import { DataTable, type Column } from "@/components/primitives/data-table";
import { EmptyState } from "@/components/primitives/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUSES = ["scheduled", "completed", "cancelled", "no_show"];

const statusTone: Record<string, string> = {
  scheduled: "bg-info/10 text-info border-info/30",
  completed: "bg-success/10 text-success border-success/30",
  cancelled: "bg-muted text-muted-foreground",
  no_show: "bg-destructive/10 text-destructive border-destructive/30",
};

export default function Appointments() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const { data, isLoading } = useListAppointments(status ? { status } : {});

  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data?.filter((a) =>
      [a.patientName, a.doctorName, a.department, a.reason].some((x) => x?.toLowerCase().includes(q)),
    );
  }, [data, search]);

  const cols: Column<Appointment>[] = [
    {
      key: "when",
      header: "When",
      cell: (a) => (
        <div className="leading-tight">
          <div className="font-medium">
            {new Date(a.scheduledAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
          </div>
          <div className="text-xs text-muted-foreground">
            {new Date(a.scheduledAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      ),
      exportValue: (a) => new Date(a.scheduledAt).toISOString(),
    },
    {
      key: "patient",
      header: "Patient",
      cell: (a) => <span className="font-medium">{a.patientName}</span>,
      exportValue: (a) => a.patientName ?? "",
    },
    {
      key: "doctor",
      header: "Doctor",
      cell: (a) => (
        <div className="flex items-center gap-2 text-sm">
          <Stethoscope className="w-3.5 h-3.5 text-muted-foreground" />
          {a.doctorName ?? "—"}
        </div>
      ),
      exportValue: (a) => a.doctorName ?? "",
    },
    {
      key: "dept",
      header: "Department",
      cell: (a) => <Badge variant="outline">{a.department}</Badge>,
      exportValue: (a) => a.department,
    },
    {
      key: "reason",
      header: "Reason",
      cell: (a) => <span className="text-sm text-muted-foreground truncate max-w-[260px] inline-block">{a.reason ?? "—"}</span>,
      exportValue: (a) => a.reason ?? "",
    },
    {
      key: "status",
      header: "Status",
      cell: (a) => (
        <Badge variant="outline" className={statusTone[a.status] ?? ""}>
          {a.status.replace("_", " ")}
        </Badge>
      ),
      exportValue: (a) => a.status,
    },
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <PageHeader
        eyebrow="OPD"
        title="Appointments"
        description="Schedule, track and manage patient visits."
        icon={Calendar}
        actions={
          <Button className="bg-brand-gradient text-white shadow-md hover:opacity-95">
            <Plus className="w-4 h-4 mr-2" />New Appointment
          </Button>
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search patient, doctor, department…"
        hasFilters={!!status || !!search}
        onClear={() => { setStatus(""); setSearch(""); }}
      >
        <Select value={status || "__all__"} onValueChange={(v) => setStatus(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-[160px] h-9 bg-background"><SelectValue placeholder="Any status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Any status</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterBar>

      <DataTable
        columns={cols}
        data={filtered}
        loading={isLoading}
        rowKey={(a) => a.id}
        pageSize={25}
        exportable
        csvName="appointments.csv"
        empty={<EmptyState icon={Calendar} title="No appointments found" description="Try changing the filters or schedule a new appointment." />}
      />
    </div>
  );
}
