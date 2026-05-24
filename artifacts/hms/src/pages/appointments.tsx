import { useMemo, useState } from "react";
import {
  useListAppointments,
  useListStaff,
  useUpdateAppointment,
  useMe,
  type Appointment,
  getListAppointmentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Plus, Stethoscope, MoreHorizontal, CalendarClock, Ban, UserX, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";
import { PageHeader } from "@/components/primitives/page-header";
import { FilterBar } from "@/components/primitives/filter-bar";
import { DataTable, type Column } from "@/components/primitives/data-table";
import { EmptyState } from "@/components/primitives/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const STATUSES = ["scheduled", "completed", "cancelled", "no_show"];

const statusTone: Record<string, string> = {
  scheduled: "bg-info/10 text-info border-info/30",
  completed: "bg-success/10 text-success border-success/30",
  cancelled: "bg-muted text-muted-foreground",
  no_show: "bg-destructive/10 text-destructive border-destructive/30",
};

// Roles allowed to mutate an appointment (status, reschedule). Receptionists and
// nurses can reschedule/cancel; only clinicians close out as complete/no-show.
const EDIT_ROLES = new Set(["admin", "doctor", "nurse", "receptionist"]);
const CLINICAL_ROLES = new Set(["admin", "doctor", "nurse"]);

type ActionMode = "reschedule" | "cancel";

function toDateTimeLocal(iso: string) {
  // datetime-local expects YYYY-MM-DDTHH:mm in local time
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function Appointments() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useMe();
  const role = me?.role ?? "";
  const canEdit = EDIT_ROLES.has(role);
  const canClinical = CLINICAL_ROLES.has(role);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [doctorId, setDoctorId] = useState<string>("");
  const [department, setDepartment] = useState<string>("");

  const params: Record<string, string | number> = {};
  if (status) params.status = status;
  if (doctorId) params.doctorId = Number(doctorId);
  if (department) params.department = department;

  const { data, isLoading } = useListAppointments(params);
  const { data: staffAll } = useListStaff();
  const staff = useMemo(() => (staffAll ?? []).filter((s) => s.role === "doctor" && s.status !== "inactive"), [staffAll]);
  const updateAppt = useUpdateAppointment();

  // Department list derived from doctor roster so filters stay aligned with
  // who's actually bookable rather than a hard-coded enum.
  const departments = useMemo(() => {
    const set = new Set<string>();
    staff?.forEach((s) => s.department && set.add(s.department));
    data?.forEach((a) => a.department && set.add(a.department));
    return Array.from(set).sort();
  }, [staff, data]);

  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data?.filter((a) =>
      [a.patientName, a.doctorName, a.department, a.reason].some((x) => x?.toLowerCase().includes(q)),
    );
  }, [data, search]);

  // Row-action dialog state: shared by Reschedule + Cancel because both need
  // a small form (new time / reason). No-show + Complete fire immediately.
  const [actionMode, setActionMode] = useState<ActionMode | null>(null);
  const [actionAppt, setActionAppt] = useState<Appointment | null>(null);
  const [newWhen, setNewWhen] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  const openReschedule = (a: Appointment) => {
    setActionAppt(a);
    setNewWhen(toDateTimeLocal(a.scheduledAt));
    setActionMode("reschedule");
  };
  const openCancel = (a: Appointment) => {
    setActionAppt(a);
    setCancelReason("");
    setActionMode("cancel");
  };
  const closeDialog = () => { setActionMode(null); setActionAppt(null); };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListAppointmentsQueryKey() });

  const patchAppointment = (id: number, body: { scheduledAt?: string; status?: string; reason?: string }, ok: string) => {
    updateAppt.mutate(
      { id, data: body },
      {
        onSuccess: () => { toast({ title: ok }); invalidate(); closeDialog(); },
        onError: (e: unknown) => {
          const msg = e instanceof Error ? e.message : "Update failed";
          toast({ title: "Update failed", description: msg, variant: "destructive" });
        },
      },
    );
  };

  const submitReschedule = () => {
    if (!actionAppt || !newWhen) return;
    patchAppointment(actionAppt.id, { scheduledAt: new Date(newWhen).toISOString() }, "Appointment rescheduled");
  };
  const submitCancel = () => {
    if (!actionAppt) return;
    patchAppointment(actionAppt.id, { status: "cancelled", reason: cancelReason || actionAppt.reason || "" }, "Appointment cancelled");
  };
  const markNoShow = (a: Appointment) => patchAppointment(a.id, { status: "no_show" }, "Marked as no-show");
  const markComplete = (a: Appointment) => patchAppointment(a.id, { status: "completed" }, "Appointment completed");

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
    {
      key: "actions",
      header: "",
      cell: (a) => {
        if (!canEdit || a.status === "cancelled" || a.status === "completed") {
          return <span className="text-muted-foreground/40">—</span>;
        }
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => openReschedule(a)}>
                <CalendarClock className="w-4 h-4 mr-2" /> Reschedule
              </DropdownMenuItem>
              {canClinical && (
                <DropdownMenuItem onClick={() => markComplete(a)}>
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Mark completed
                </DropdownMenuItem>
              )}
              {canClinical && (
                <DropdownMenuItem onClick={() => markNoShow(a)}>
                  <UserX className="w-4 h-4 mr-2" /> Mark no-show
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => openCancel(a)} className="text-destructive focus:text-destructive">
                <Ban className="w-4 h-4 mr-2" /> Cancel…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const hasFilters = !!status || !!search || !!doctorId || !!department;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <PageHeader
        eyebrow="OPD"
        title="Appointments"
        description="Schedule, track and manage patient visits."
        icon={Calendar}
        actions={
          canEdit ? (
            <Button asChild className="bg-brand-gradient text-white shadow-md hover:opacity-95">
              <Link href="/appointments/new"><Plus className="w-4 h-4 mr-2" />New Appointment</Link>
            </Button>
          ) : null
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search patient, doctor, department…"
        hasFilters={hasFilters}
        onClear={() => { setStatus(""); setSearch(""); setDoctorId(""); setDepartment(""); }}
      >
        <Select value={doctorId || "__all__"} onValueChange={(v) => setDoctorId(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-[180px] h-9 bg-background"><SelectValue placeholder="Any doctor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Any doctor</SelectItem>
            {staff?.map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={department || "__all__"} onValueChange={(v) => setDepartment(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-[180px] h-9 bg-background"><SelectValue placeholder="Any department" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Any department</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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

      <Dialog open={actionMode === "reschedule"} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reschedule appointment</DialogTitle>
            <DialogDescription>
              {actionAppt && <>Moving {actionAppt.patientName}'s visit with Dr. {actionAppt.doctorName}.</>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">New date & time</label>
            <Input type="datetime-local" value={newWhen} onChange={(e) => setNewWhen(e.target.value)} />
            <p className="text-xs text-muted-foreground">Conflicts within ±15 minutes will be rejected by the server.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={submitReschedule} disabled={!newWhen || updateAppt.isPending}>
              {updateAppt.isPending ? "Saving…" : "Reschedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={actionMode === "cancel"} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel appointment</DialogTitle>
            <DialogDescription>
              {actionAppt && <>This will notify {actionAppt.patientName} that the visit is cancelled.</>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Reason (optional)</label>
            <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="e.g. Doctor unavailable" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Keep appointment</Button>
            <Button variant="destructive" onClick={submitCancel} disabled={updateAppt.isPending}>
              {updateAppt.isPending ? "Cancelling…" : "Cancel appointment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
