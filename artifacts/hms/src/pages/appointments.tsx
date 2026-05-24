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
import {
  Calendar, Plus, Stethoscope, MoreHorizontal, CalendarClock, Ban, UserX,
  CheckCircle2, List as ListIcon, LayoutGrid, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Link } from "wouter";
import { PageHeader } from "@/components/primitives/page-header";
import { FilterBar } from "@/components/primitives/filter-bar";
import { DataTable, type Column } from "@/components/primitives/data-table";
import { EmptyState } from "@/components/primitives/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const STATUSES = ["scheduled", "completed", "cancelled", "no_show"];

const statusTone: Record<string, string> = {
  scheduled: "bg-info/10 text-info border-info/30",
  in_progress: "bg-warning/10 text-warning border-warning/30",
  completed: "bg-success/10 text-success border-success/30",
  cancelled: "bg-muted text-muted-foreground",
  no_show: "bg-destructive/10 text-destructive border-destructive/30",
};

// Role policy per Task #6:
//   admin / doctor → full (book, reschedule, cancel, set clinical status)
//   receptionist   → booking-only (book, reschedule, cancel)
//   nurse          → read + vitals (cannot mutate appointments here)
const BOOKING_ROLES = new Set(["admin", "doctor", "receptionist"]);
const STATUS_ROLES = new Set(["admin", "doctor"]);

// Visual status timeline for a single appointment. Highlights the segment
// reached by the current status; cancelled / no_show terminate the timeline.
const TIMELINE_STEPS = ["scheduled", "in_progress", "completed"] as const;
function StatusTimeline({ status }: { status: string }) {
  if (status === "cancelled" || status === "no_show") {
    return (
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-6 rounded-full ${statusTone[status]?.replace("text-", "bg-").split(" ")[0] ?? "bg-muted"}`} />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {status.replace("_", " ")}
        </span>
      </div>
    );
  }
  const idx = Math.max(0, TIMELINE_STEPS.indexOf(status as (typeof TIMELINE_STEPS)[number]));
  return (
    <div className="flex items-center gap-1" title={`Status: ${status}`}>
      {TIMELINE_STEPS.map((step, i) => {
        const reached = i <= idx;
        const current = i === idx;
        return (
          <div key={step} className="flex items-center">
            <span
              className={`h-2 w-2 rounded-full border ${
                reached ? "bg-primary border-primary" : "bg-background border-border"
              } ${current ? "ring-2 ring-primary/30" : ""}`}
              aria-label={step}
            />
            {i < TIMELINE_STEPS.length - 1 && (
              <span className={`h-px w-5 ${i < idx ? "bg-primary" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

type ActionMode = "reschedule" | "cancel";
type ViewMode = "list" | "calendar";

function toDateTimeLocal(iso: string) {
  // datetime-local expects YYYY-MM-DDTHH:mm in local time
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60_000);
  return local.toISOString().slice(0, 16);
}

function toDateInput(d: Date) {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
}

export default function Appointments() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useMe();
  const role = me?.role ?? "";
  const canBook = BOOKING_ROLES.has(role);
  const canSetStatus = STATUS_ROLES.has(role);
  // Anyone with booking or status rights gets the row action menu; nurse does not.
  const canEdit = canBook;

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [doctorId, setDoctorId] = useState<string>("");
  const [department, setDepartment] = useState<string>("");
  const [view, setView] = useState<ViewMode>("list");
  const [calendarDate, setCalendarDate] = useState<string>(() => toDateInput(new Date()));

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
        <div className="space-y-1.5">
          <Badge variant="outline" className={statusTone[a.status] ?? ""}>
            {a.status.replace("_", " ")}
          </Badge>
          <StatusTimeline status={a.status} />
        </div>
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
              {canSetStatus && (
                <DropdownMenuItem onClick={() => markComplete(a)}>
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Mark completed
                </DropdownMenuItem>
              )}
              {canSetStatus && (
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
          canBook ? (
            <Button asChild className="bg-brand-gradient text-white shadow-md hover:opacity-95">
              <Link href="/appointments/new"><Plus className="w-4 h-4 mr-2" />New Appointment</Link>
            </Button>
          ) : null
        }
      />

      {/* View toggle: List = full filterable table; Calendar = day-grid by hour
          x doctor, useful for spotting open slots before booking. */}
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex rounded-md border border-border overflow-hidden">
          <Button
            variant={view === "list" ? "secondary" : "ghost"}
            size="sm"
            className="rounded-none h-9"
            onClick={() => setView("list")}
          >
            <ListIcon className="w-4 h-4 mr-1.5" /> List
          </Button>
          <Button
            variant={view === "calendar" ? "secondary" : "ghost"}
            size="sm"
            className="rounded-none h-9 border-l border-border"
            onClick={() => setView("calendar")}
          >
            <LayoutGrid className="w-4 h-4 mr-1.5" /> Calendar
          </Button>
        </div>
        {view === "calendar" && (
          <DayPicker date={calendarDate} onChange={setCalendarDate} />
        )}
      </div>

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

      {view === "list" ? (
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
      ) : (
        <CalendarView
          appointments={filtered ?? []}
          doctors={staff ?? []}
          date={calendarDate}
          canBook={canBook}
        />
      )}

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

// Day picker for the calendar view. Plain date input + prev/next buttons so we
// don't pull in a heavyweight calendar lib just for navigation.
function DayPicker({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  const shift = (days: number) => {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() + days);
    onChange(toDateInput(d));
  };
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" className="h-9 w-9 p-0" onClick={() => shift(-1)} aria-label="Previous day">
        <ChevronLeft className="w-4 h-4" />
      </Button>
      <Input type="date" value={date} onChange={(e) => onChange(e.target.value)} className="h-9 w-[160px]" />
      <Button variant="outline" size="sm" className="h-9 w-9 p-0" onClick={() => shift(1)} aria-label="Next day">
        <ChevronRight className="w-4 h-4" />
      </Button>
      <Button variant="ghost" size="sm" className="h-9" onClick={() => onChange(toDateInput(new Date()))}>
        Today
      </Button>
    </div>
  );
}

// Calendar view: doctor columns × hour rows for a single day. Each cell holds
// the booked appointments for that doctor at that hour; empty cells deep-link
// to /appointments/new with the slot pre-selected.
const HOURS = Array.from({ length: 12 }, (_, i) => 8 + i); // 08:00 .. 19:00

function CalendarView({
  appointments, doctors, date, canBook,
}: {
  appointments: Appointment[];
  doctors: { id: number; name: string; department?: string }[];
  date: string;
  canBook: boolean;
}) {
  const dayStart = new Date(date + "T00:00:00");
  const dayEnd = new Date(date + "T23:59:59");

  const ofDay = appointments.filter((a) => {
    const t = new Date(a.scheduledAt).getTime();
    return t >= dayStart.getTime() && t <= dayEnd.getTime();
  });

  // Only show doctors that either have a booking that day or are in the active
  // roster, capped at 8 columns to keep the grid readable.
  const presentDoctorIds = new Set(ofDay.map((a) => a.doctorId).filter(Boolean) as number[]);
  const cols = doctors
    .filter((d) => presentDoctorIds.size === 0 || presentDoctorIds.has(d.id) || doctors.length <= 8)
    .slice(0, 8);

  if (cols.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <EmptyState
            icon={Calendar}
            title="No doctors to show"
            description="Choose a doctor in the filter, or seed staff to populate the calendar."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <div className="min-w-[800px]">
          <div
            className="grid border-b border-border bg-muted/30 sticky top-0 z-10"
            style={{ gridTemplateColumns: `64px repeat(${cols.length}, minmax(160px, 1fr))` }}
          >
            <div className="p-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Time</div>
            {cols.map((d) => (
              <div key={d.id} className="p-2 border-l border-border">
                <p className="text-sm font-semibold truncate">{d.name}</p>
                {d.department && <p className="text-xs text-muted-foreground truncate">{d.department}</p>}
              </div>
            ))}
          </div>
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="grid border-b border-border min-h-[68px]"
              style={{ gridTemplateColumns: `64px repeat(${cols.length}, minmax(160px, 1fr))` }}
            >
              <div className="p-2 text-xs font-mono text-muted-foreground border-r border-border">
                {String(hour).padStart(2, "0")}:00
              </div>
              {cols.map((d) => {
                const cellAppts = ofDay.filter(
                  (a) => a.doctorId === d.id && new Date(a.scheduledAt).getHours() === hour,
                );
                const slotIso = `${date}T${String(hour).padStart(2, "0")}:00`;
                const prefill = canBook
                  ? `/appointments/new?${new URLSearchParams({
                      doctorId: String(d.id),
                      department: d.department ?? "",
                      scheduledAt: new Date(slotIso).toISOString(),
                    }).toString()}`
                  : "";
                return (
                  <div key={d.id} className="border-l border-border p-1 space-y-1 relative group">
                    {cellAppts.map((a) => (
                      <Link
                        key={a.id}
                        href={`/encounters/new?appointmentId=${a.id}`}
                        className={`block text-xs p-1.5 rounded border ${statusTone[a.status] ?? "bg-muted"} hover:opacity-80`}
                        title={`${a.patientName} — ${a.reason ?? ""}`}
                      >
                        <div className="font-medium truncate">
                          {new Date(a.scheduledAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · {a.patientName}
                        </div>
                        {a.reason && (
                          <div className="text-[10px] text-muted-foreground truncate">{a.reason}</div>
                        )}
                      </Link>
                    ))}
                    {cellAppts.length === 0 && canBook && (
                      <Link
                        href={prefill}
                        className="absolute inset-0 m-1 rounded border border-dashed border-transparent group-hover:border-primary/40 group-hover:bg-primary/5 flex items-center justify-center text-[11px] text-muted-foreground opacity-0 group-hover:opacity-100 transition"
                      >
                        + Book
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
