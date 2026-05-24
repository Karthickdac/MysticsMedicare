import { useMemo, useState } from "react";
import {
  useListRosterShifts,
  useCreateRosterShift,
  useDeleteRosterShift,
  useBulkCreateRosterShifts,
  useCopyRosterWeek,
  useListStaff,
  getListRosterShiftsQueryKey,
  type RosterShift,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Calendar, Plus, Trash2, AlertTriangle, ChevronLeft, ChevronRight,
  Copy, Printer, Download, LayoutGrid, Users,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Shift = RosterShift;

const SHIFTS = ["Morning", "Evening", "Night", "OnCall", "Leave"] as const;
const SHIFT_HOURS: Record<string, number> = { Morning: 8, Evening: 8, Night: 8, OnCall: 12, Leave: 0 };
const SHIFT_TONES: Record<string, string> = {
  Morning: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-700/40",
  Evening: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-500/15 dark:text-blue-200 dark:border-blue-700/40",
  Night: "bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-500/20 dark:text-indigo-200 dark:border-indigo-700/40",
  OnCall: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300 dark:bg-fuchsia-500/15 dark:text-fuchsia-200 dark:border-fuchsia-700/40",
  Leave: "bg-slate-200 text-slate-700 border-slate-300 dark:bg-slate-700/30 dark:text-slate-200 dark:border-slate-600/40",
};

function isoOnly(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfWeek(d: Date) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const dow = (x.getDay() + 6) % 7; // Monday=0
  return addDays(x, -dow);
}
function startOfMonth(d: Date) { const x = new Date(d.getFullYear(), d.getMonth(), 1); x.setHours(0,0,0,0); return x; }
function endOfMonth(d: Date) { const x = new Date(d.getFullYear(), d.getMonth() + 1, 0); x.setHours(0,0,0,0); return x; }

type ViewMode = "week" | "month";

export default function Roster() {
  const { data: shifts, isLoading } = useListRosterShifts();
  const { data: staff } = useListStaff();
  const [view, setView] = useState<ViewMode>("week");
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [monthAnchor, setMonthAnchor] = useState(startOfMonth(new Date()));
  const [department, setDepartment] = useState<string>("all");
  const [openAdd, setOpenAdd] = useState(false);
  const [openBulk, setOpenBulk] = useState(false);
  const [prefill, setPrefill] = useState<{ staffId?: number; date?: string }>({});
  const deleteMut = useDeleteRosterShift();
  const copyWeek = useCopyRosterWeek();
  const qc = useQueryClient();
  const { toast } = useToast();

  const departments = useMemo(() => {
    const set = new Set<string>();
    (staff ?? []).forEach((s) => set.add(s.department));
    return Array.from(set).sort();
  }, [staff]);

  const visibleStaff = useMemo(() => {
    const list = (staff ?? []).filter((s) => s.status === "active");
    return department === "all" ? list : list.filter((s) => s.department === department);
  }, [staff, department]);

  const periodStart = view === "week" ? weekStart : startOfMonth(monthAnchor);
  const periodEnd = view === "week" ? addDays(weekStart, 6) : endOfMonth(monthAnchor);
  const periodDays = useMemo(() => {
    const days: Date[] = [];
    for (let d = new Date(periodStart); d <= periodEnd; d = addDays(d, 1)) days.push(new Date(d));
    return days;
  }, [periodStart, periodEnd]);
  const periodKeys = useMemo(() => periodDays.map(isoOnly), [periodDays]);

  const filteredShifts = useMemo(() => {
    return (shifts ?? []).filter((s) => {
      if (department !== "all" && s.department !== department) return false;
      return periodKeys.includes(s.date);
    });
  }, [shifts, department, periodKeys]);

  const grid = useMemo(() => {
    const m = new Map<string, Shift[]>();
    for (const s of filteredShifts) {
      const key = `${s.staffId}|${s.date}`;
      const arr = m.get(key) ?? [];
      arr.push(s);
      m.set(key, arr);
    }
    return m;
  }, [filteredShifts]);

  const conflicts = useMemo(() => {
    const out: Array<{ staffName: string; date: string; reason: string }> = [];
    for (const [key, arr] of grid) {
      if (arr.length < 2) continue;
      const [staffIdStr, date] = key.split("|");
      const exclusive = arr.find((x) => x.shift === "Leave" || x.shift === "OnCall");
      const bandCount = new Map<string, number>();
      for (const s of arr) bandCount.set(s.shift, (bandCount.get(s.shift) ?? 0) + 1);
      const dup = Array.from(bandCount.entries()).find(([, n]) => n > 1);
      const name = (staff ?? []).find((p) => p.id === Number(staffIdStr))?.name ?? `Staff #${staffIdStr}`;
      if (exclusive) out.push({ staffName: name, date, reason: `${exclusive.shift} conflicts with other shifts` });
      else if (dup) out.push({ staffName: name, date, reason: `Duplicate ${dup[0]} shift` });
    }
    return out;
  }, [grid, staff]);

  // Per-staff summary for the visible period.
  const summary = useMemo(() => {
    const out: Array<{ staffId: number; name: string; total: number; hours: number; leave: number; oncall: number }> = [];
    for (const p of visibleStaff) {
      let total = 0, hours = 0, leave = 0, oncall = 0;
      for (const d of periodKeys) {
        const cell = grid.get(`${p.id}|${d}`) ?? [];
        for (const s of cell) {
          total++;
          hours += SHIFT_HOURS[s.shift] ?? 0;
          if (s.shift === "Leave") leave++;
          if (s.shift === "OnCall") oncall++;
        }
      }
      out.push({ staffId: p.id, name: p.name, total, hours, leave, oncall });
    }
    return out.sort((a, b) => b.hours - a.hours);
  }, [visibleStaff, periodKeys, grid]);

  function deleteShift(s: Shift) {
    deleteMut.mutate({ id: s.id }, {
      onSuccess: () => { toast({ title: "Shift removed" }); qc.invalidateQueries({ queryKey: getListRosterShiftsQueryKey() }); },
      onError: (e) => toast({ title: "Failed", description: (e as Error).message, variant: "destructive" }),
    });
  }

  function onCopyPrevWeek() {
    const target = view === "week" ? weekStart : startOfWeek(monthAnchor);
    const source = addDays(target, -7);
    if (!confirm(`Copy all shifts from week of ${source.toLocaleDateString("en-IN")} into week of ${target.toLocaleDateString("en-IN")}? Conflicts will be skipped.`)) return;
    copyWeek.mutate(
      {
        data: {
          fromWeekStart: isoOnly(source),
          toWeekStart: isoOnly(target),
          ...(department !== "all" ? { department } : {}),
        },
      },
      {
        onSuccess: (r) => {
          toast({ title: "Week copied", description: `${r.created} created, ${r.skipped} skipped` });
          qc.invalidateQueries({ queryKey: getListRosterShiftsQueryKey() });
        },
        onError: (e) => toast({ title: "Copy failed", description: (e as Error).message, variant: "destructive" }),
      },
    );
  }

  function exportCsv() {
    const rows = [["Date", "Day", "Staff", "Role", "Department", "Shift", "Notes"]];
    const staffMap = new Map((staff ?? []).map((s) => [s.id, s]));
    for (const s of filteredShifts) {
      const sm = staffMap.get(s.staffId);
      rows.push([
        s.date,
        new Date(s.date).toLocaleDateString("en-IN", { weekday: "short" }),
        s.staffName,
        sm?.role ?? "",
        s.department,
        s.shift,
        (s.notes ?? "").replace(/"/g, '""'),
      ]);
    }
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `roster-${isoOnly(periodStart)}-to-${isoOnly(periodEnd)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function printRoster() { window.print(); }

  const headerLabel = view === "week"
    ? `${periodDays[0].toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} – ${periodDays[periodDays.length - 1].toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`
    : monthAnchor.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  return (
    <div className="p-6 space-y-6 print:p-2 print:space-y-2">
      <style>{`
        @media print {
          body { background: #fff !important; }
          aside, nav, [data-roster-no-print] { display: none !important; }
          .print-show { display: block !important; }
          .print-table th, .print-table td { border: 1px solid #ddd !important; padding: 2px 4px !important; font-size: 9pt !important; }
        }
      `}</style>

      <div className="flex justify-between items-start gap-4 flex-wrap" data-roster-no-print>
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Calendar className="w-6 h-6 text-primary" />Duty Roster</h1>
          <p className="text-muted-foreground">Weekly / monthly planner — conflicts, copy-prev-week, bulk schedule, print & CSV.</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
            <TabsList>
              <TabsTrigger value="week" data-testid="tab-week"><LayoutGrid className="w-4 h-4 mr-1" />Week</TabsTrigger>
              <TabsTrigger value="month" data-testid="tab-month"><Calendar className="w-4 h-4 mr-1" />Month</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center border rounded-md">
            <Button variant="ghost" size="icon" onClick={() => view === "week" ? setWeekStart(addDays(weekStart, -7)) : setMonthAnchor(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() - 1, 1))}><ChevronLeft className="w-4 h-4" /></Button>
            <span className="px-3 text-sm font-medium tabular-nums">{headerLabel}</span>
            <Button variant="ghost" size="icon" onClick={() => view === "week" ? setWeekStart(addDays(weekStart, 7)) : setMonthAnchor(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 1))}><ChevronRight className="w-4 h-4" /></Button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setWeekStart(startOfWeek(new Date())); setMonthAnchor(startOfMonth(new Date())); }}>Today</Button>
          <Select value={department} onValueChange={setDepartment}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap" data-roster-no-print>
        <Button onClick={() => { setPrefill({}); setOpenAdd(true); }} data-testid="button-add-shift"><Plus className="w-4 h-4 mr-1" />Add shift</Button>
        <Button variant="outline" onClick={() => setOpenBulk(true)} data-testid="button-bulk-shift"><Users className="w-4 h-4 mr-1" />Bulk schedule</Button>
        <Button variant="outline" onClick={onCopyPrevWeek} disabled={copyWeek.isPending} data-testid="button-copy-week"><Copy className="w-4 h-4 mr-1" />{copyWeek.isPending ? "Copying…" : "Copy previous week"}</Button>
        <Button variant="outline" onClick={exportCsv} data-testid="button-export-csv"><Download className="w-4 h-4 mr-1" />Export CSV</Button>
        <Button variant="outline" onClick={printRoster} data-testid="button-print-roster"><Printer className="w-4 h-4 mr-1" />Print</Button>
      </div>

      {conflicts.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5" data-roster-no-print>
          <CardContent className="p-4 flex gap-3 items-start">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-destructive">{conflicts.length} scheduling conflict{conflicts.length === 1 ? "" : "s"}</div>
              <ul className="text-sm mt-1 space-y-0.5">
                {conflicts.slice(0, 6).map((c, i) => <li key={i}>• <span className="font-medium">{c.staffName}</span> on {new Date(c.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} — {c.reason}</li>)}
                {conflicts.length > 6 && <li className="text-muted-foreground">…and {conflicts.length - 6} more</li>}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : visibleStaff.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No active staff in this department.</div>
          ) : view === "week" ? (
            <WeekGrid days={periodDays} dayKeys={periodKeys} visibleStaff={visibleStaff} grid={grid} onAdd={(staffId, date) => { setPrefill({ staffId, date }); setOpenAdd(true); }} onDelete={deleteShift} />
          ) : (
            <MonthGrid monthAnchor={monthAnchor} days={periodDays} dayKeys={periodKeys} shifts={filteredShifts} onAdd={(date) => { setPrefill({ date }); setOpenAdd(true); }} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold flex items-center gap-2"><Users className="w-4 h-4" />Per-staff summary ({view === "week" ? "this week" : "this month"})</h2>
            <div className="text-xs text-muted-foreground">Hours: Morning/Evening/Night = 8h · OnCall = 12h · Leave = 0h</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-4">Staff</th>
                  <th className="py-2 pr-4 text-right">Shifts</th>
                  <th className="py-2 pr-4 text-right">Hours</th>
                  <th className="py-2 pr-4 text-right">On-call</th>
                  <th className="py-2 text-right">Leave</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((s) => (
                  <tr key={s.staffId} className="border-b hover:bg-muted/20">
                    <td className="py-1.5 pr-4 font-medium">{s.name}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums">{s.total}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums font-semibold">{s.hours}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums">{s.oncall}</td>
                    <td className="py-1.5 text-right tabular-nums">{s.leave}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {openAdd && (
        <AddShiftDialog
          staff={staff ?? []}
          defaultStaffId={prefill.staffId}
          defaultDate={prefill.date ?? isoOnly(new Date())}
          onClose={() => setOpenAdd(false)}
          onSaved={() => { qc.invalidateQueries({ queryKey: getListRosterShiftsQueryKey() }); setOpenAdd(false); }}
        />
      )}

      {openBulk && (
        <BulkScheduleDialog
          staff={staff ?? []}
          defaultDepartment={department === "all" ? undefined : department}
          onClose={() => setOpenBulk(false)}
          onSaved={() => { qc.invalidateQueries({ queryKey: getListRosterShiftsQueryKey() }); setOpenBulk(false); }}
        />
      )}
    </div>
  );
}

function WeekGrid({ days, dayKeys, visibleStaff, grid, onAdd, onDelete }: {
  days: Date[]; dayKeys: string[]; visibleStaff: { id: number; name: string; role: string; department: string }[];
  grid: Map<string, Shift[]>; onAdd: (staffId?: number, date?: string) => void; onDelete: (s: Shift) => void;
}) {
  return (
    <table className="w-full text-sm print-table">
      <thead>
        <tr className="border-b bg-muted/30">
          <th className="text-left px-3 py-2 sticky left-0 bg-muted/30 z-10 min-w-[180px]">Staff</th>
          {days.map((d, i) => (
            <th key={i} className="text-center px-2 py-2 min-w-[140px] font-medium">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{d.toLocaleDateString("en-IN", { weekday: "short" })}</div>
              <div className="text-sm tabular-nums">{d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</div>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {visibleStaff.map((p) => (
          <tr key={p.id} className="border-b hover:bg-muted/20">
            <td className="px-3 py-2 sticky left-0 bg-card z-10">
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-muted-foreground capitalize">{p.role} · {p.department}</div>
            </td>
            {dayKeys.map((date) => {
              const cellShifts = grid.get(`${p.id}|${date}`) ?? [];
              return (
                <td key={date} className="px-1 py-1 align-top">
                  <div className="space-y-1">
                    {cellShifts.map((s) => (
                      <div key={s.id} className={`group flex items-center justify-between gap-1 text-xs px-2 py-1 rounded border ${SHIFT_TONES[s.shift] ?? ""}`} title={s.notes ?? ""}>
                        <span className="font-medium">{s.shift}</span>
                        <button onClick={() => onDelete(s)} className="opacity-0 group-hover:opacity-100 transition print:hidden" aria-label="Delete shift">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <button onClick={() => onAdd(p.id, date)} className="w-full text-[10px] uppercase tracking-wider text-muted-foreground hover:text-primary border border-dashed border-transparent hover:border-primary/40 rounded py-0.5 print:hidden">+</button>
                  </div>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MonthGrid({ monthAnchor, days, dayKeys, shifts, onAdd }: {
  monthAnchor: Date; days: Date[]; dayKeys: string[]; shifts: Shift[];
  onAdd: (date: string) => void;
}) {
  const dayToShifts = useMemo(() => {
    const m = new Map<string, Shift[]>();
    for (const s of shifts) {
      const arr = m.get(s.date) ?? [];
      arr.push(s);
      m.set(s.date, arr);
    }
    return m;
  }, [shifts]);

  // Layout: render leading blanks so 1st of month aligns to its weekday (Mon=0).
  const firstDow = (days[0].getDay() + 6) % 7;
  const leadingBlanks = Array.from({ length: firstDow });

  return (
    <div className="p-4">
      <div className="grid grid-cols-7 gap-1 text-xs uppercase tracking-wider text-muted-foreground mb-1">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="px-2 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {leadingBlanks.map((_, i) => <div key={`b${i}`} className="min-h-[100px]" />)}
        {days.map((d, idx) => {
          const key = dayKeys[idx];
          const cell = dayToShifts.get(key) ?? [];
          const byBand = new Map<string, number>();
          for (const s of cell) byBand.set(s.shift, (byBand.get(s.shift) ?? 0) + 1);
          return (
            <div key={key} className="min-h-[100px] border rounded p-1.5 hover:bg-muted/20 transition group cursor-pointer" onClick={() => onAdd(key)}>
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold tabular-nums">{d.getDate()}</span>
                <span className="text-[10px] text-muted-foreground">{cell.length}</span>
              </div>
              <div className="mt-1 space-y-0.5">
                {SHIFTS.map((band) => {
                  const n = byBand.get(band);
                  if (!n) return null;
                  return (
                    <div key={band} className={`text-[10px] px-1.5 py-0.5 rounded border ${SHIFT_TONES[band] ?? ""}`}>
                      {band} · {n}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 text-xs text-muted-foreground">Click any day to add a shift. Switch to Week view to edit individual shifts.</div>
    </div>
  );
}

function AddShiftDialog({ staff, defaultStaffId, defaultDate, onClose, onSaved }: { staff: { id: number; name: string; role: string; department: string }[]; defaultStaffId?: number; defaultDate: string; onClose: () => void; onSaved: () => void }) {
  const [staffId, setStaffId] = useState<number>(defaultStaffId ?? staff[0]?.id ?? 0);
  const initialDept = staff.find((s) => s.id === (defaultStaffId ?? staff[0]?.id))?.department ?? "Emergency";
  const [department, setDepartment] = useState(initialDept);
  const [shift, setShift] = useState<string>("Morning");
  const [date, setDate] = useState(defaultDate);
  const [notes, setNotes] = useState("");
  const create = useCreateRosterShift();
  const { toast } = useToast();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate({ data: { staffId, department, shift, date, notes: notes || undefined } }, {
      onSuccess: () => { toast({ title: "Shift scheduled" }); onSaved(); },
      onError: (e) => toast({ title: "Cannot schedule", description: (e as Error).message, variant: "destructive" }),
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Schedule shift</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider">Staff</Label>
            <Select value={String(staffId)} onValueChange={(v) => {
              const id = Number(v); setStaffId(id);
              const s = staff.find((x) => x.id === id); if (s) setDepartment(s.department);
            }}>
              <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
              <SelectContent>{staff.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name} ({s.role})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider">Department</Label>
              <Input value={department} onChange={(e) => setDepartment(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider">Shift</Label>
              <Select value={shift} onValueChange={setShift}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Morning">Morning (08:00–16:00)</SelectItem>
                  <SelectItem value="Evening">Evening (16:00–00:00)</SelectItem>
                  <SelectItem value="Night">Night (00:00–08:00)</SelectItem>
                  <SelectItem value="OnCall">On-call (full day)</SelectItem>
                  <SelectItem value="Leave">Leave (full day)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider">Notes (optional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. doubling Dr. Sharma's evening cover" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={create.isPending} data-testid="button-save-shift">{create.isPending ? "Saving…" : "Save shift"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BulkScheduleDialog({ staff, defaultDepartment, onClose, onSaved }: { staff: { id: number; name: string; role: string; department: string; status: string }[]; defaultDepartment?: string; onClose: () => void; onSaved: () => void }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [shift, setShift] = useState<string>("Morning");
  const [fromDate, setFromDate] = useState(isoOnly(new Date()));
  const [toDate, setToDate] = useState(isoOnly(addDays(new Date(), 6)));
  const [dows, setDows] = useState<Set<number>>(new Set([1, 2, 3, 4, 5])); // Mon–Fri
  const [deptFilter, setDeptFilter] = useState<string>(defaultDepartment ?? "all");
  const bulk = useBulkCreateRosterShifts();
  const { toast } = useToast();

  const departments = useMemo(() => Array.from(new Set(staff.map((s) => s.department))).sort(), [staff]);
  const visibleStaff = useMemo(() => staff.filter((s) => s.status === "active" && (deptFilter === "all" || s.department === deptFilter)), [staff, deptFilter]);

  function toggle(id: number) {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelected(s);
  }
  function toggleAll() {
    if (selected.size === visibleStaff.length) setSelected(new Set());
    else setSelected(new Set(visibleStaff.map((s) => s.id)));
  }
  function toggleDow(n: number) {
    const s = new Set(dows);
    if (s.has(n)) s.delete(n); else s.add(n);
    setDows(s);
  }

  const dates = useMemo(() => {
    const out: string[] = [];
    const from = new Date(fromDate); const to = new Date(toDate);
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) return out;
    for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
      const dow = (d.getDay() + 6) % 7; // Mon=0
      if (dows.has(dow)) out.push(isoOnly(d));
    }
    return out;
  }, [fromDate, toDate, dows]);

  const totalShifts = selected.size * dates.length;

  function submit() {
    if (!selected.size || !dates.length) {
      toast({ title: "Pick staff and at least one date", variant: "destructive" });
      return;
    }
    const shifts: { staffId: number; department: string; shift: string; date: string }[] = [];
    for (const id of selected) {
      const s = staff.find((x) => x.id === id);
      if (!s) continue;
      for (const date of dates) {
        shifts.push({ staffId: id, department: s.department, shift, date });
      }
    }
    bulk.mutate({ data: { shifts } }, {
      onSuccess: (r) => {
        toast({ title: "Bulk schedule done", description: `${r.created} created · ${r.skipped} skipped (conflicts)` });
        onSaved();
      },
      onError: (e) => toast({ title: "Bulk failed", description: (e as Error).message, variant: "destructive" }),
    });
  }

  const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Bulk schedule shifts</DialogTitle>
          <DialogDescription>Apply the same shift to multiple staff over a date range. Conflicts are skipped.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider">Shift</Label>
              <Select value={shift} onValueChange={setShift}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SHIFTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider">From</Label>
                <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider">To</Label>
                <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider">Days of week</Label>
              <div className="flex gap-1 flex-wrap">
                {DOW_LABELS.map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleDow(i)}
                    className={`px-2.5 py-1 rounded border text-xs ${dows.has(i) ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground"}`}
                  >{label}</button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider">Filter staff by department</Label>
              <Select value={deptFilter} onValueChange={setDeptFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All departments</SelectItem>
                  {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded border p-3 bg-muted/30 text-sm">
              <div><span className="font-semibold">{selected.size}</span> staff × <span className="font-semibold">{dates.length}</span> dates = <span className="font-semibold text-primary">{totalShifts}</span> shift{totalShifts === 1 ? "" : "s"}</div>
              <div className="text-xs text-muted-foreground mt-1">Conflicts (Leave / duplicate band) are skipped automatically.</div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wider">Staff ({visibleStaff.length})</Label>
              <button type="button" onClick={toggleAll} className="text-xs text-primary hover:underline">
                {selected.size === visibleStaff.length ? "Clear" : "Select all"}
              </button>
            </div>
            <div className="border rounded max-h-[320px] overflow-y-auto">
              {visibleStaff.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground text-center">No active staff</div>
              ) : visibleStaff.map((s) => (
                <label key={s.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/30 cursor-pointer border-b last:border-b-0">
                  <Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggle(s.id)} />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground capitalize">{s.role} · {s.department}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={bulk.isPending || !totalShifts} data-testid="button-save-bulk">
            {bulk.isPending ? "Scheduling…" : `Schedule ${totalShifts} shift${totalShifts === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
