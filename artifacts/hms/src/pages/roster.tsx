import { useMemo, useState } from "react";
import {
  useListRosterShifts,
  useCreateRosterShift,
  useDeleteRosterShift,
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar, Plus, Trash2, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Shift = RosterShift;

const SHIFTS = ["Morning", "Evening", "Night", "OnCall", "Leave"] as const;
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

export default function Roster() {
  const { data: shifts, isLoading } = useListRosterShifts();
  const { data: staff } = useListStaff();
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [department, setDepartment] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<{ staffId?: number; date?: string }>({});
  const deleteMut = useDeleteRosterShift();
  const qc = useQueryClient();
  const { toast } = useToast();

  const departments = useMemo(() => {
    const set = new Set<string>();
    (staff ?? []).forEach((s) => set.add(s.department));
    return Array.from(set).sort();
  }, [staff]);

  const weekDays = useMemo(() => Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i)), [weekStart]);
  const weekDayKeys = useMemo(() => weekDays.map(isoOnly), [weekDays]);

  // Shifts visible in the current week + selected department, indexed by staff/date.
  const filteredShifts = useMemo(() => {
    return (shifts ?? []).filter((s) => {
      if (department !== "all" && s.department !== department) return false;
      return weekDayKeys.includes(s.date);
    });
  }, [shifts, department, weekDayKeys]);

  const visibleStaff = useMemo(() => {
    const list = (staff ?? []).filter((s) => s.status === "active");
    return department === "all" ? list : list.filter((s) => s.department === department);
  }, [staff, department]);

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

  // Conflict scan — Leave/OnCall mixed with any other shift OR duplicate band.
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

  function openAdd(staffId?: number, date?: string) {
    setPrefill({ staffId, date });
    setOpen(true);
  }

  function deleteShift(s: Shift) {
    deleteMut.mutate({ id: s.id }, {
      onSuccess: () => { toast({ title: "Shift removed" }); qc.invalidateQueries({ queryKey: getListRosterShiftsQueryKey() }); },
      onError: (e) => toast({ title: "Failed", description: (e as Error).message, variant: "destructive" }),
    });
  }

  const headerLabel = `${weekDays[0].toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} – ${weekDays[6].toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Calendar className="w-6 h-6 text-primary" />Duty Roster</h1>
          <p className="text-muted-foreground">Weekly shift planner with conflict detection.</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="flex items-center border rounded-md">
            <Button variant="ghost" size="icon" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft className="w-4 h-4" /></Button>
            <span className="px-3 text-sm font-medium tabular-nums">{headerLabel}</span>
            <Button variant="ghost" size="icon" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight className="w-4 h-4" /></Button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>This week</Button>
          <Select value={department} onValueChange={setDepartment}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => openAdd()}><Plus className="w-4 h-4 mr-2" />Add shift</Button>
        </div>
      </div>

      {conflicts.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
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
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-3 py-2 sticky left-0 bg-muted/30 z-10 min-w-[180px]">Staff</th>
                  {weekDays.map((d, i) => (
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
                    {weekDayKeys.map((date) => {
                      const cellShifts = grid.get(`${p.id}|${date}`) ?? [];
                      return (
                        <td key={date} className="px-1 py-1 align-top">
                          <div className="space-y-1">
                            {cellShifts.map((s) => (
                              <div key={s.id} className={`group flex items-center justify-between gap-1 text-xs px-2 py-1 rounded border ${SHIFT_TONES[s.shift] ?? ""}`} title={s.notes ?? ""}>
                                <span className="font-medium">{s.shift}</span>
                                <button onClick={() => deleteShift(s)} className="opacity-0 group-hover:opacity-100 transition" aria-label="Delete shift">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                            <button onClick={() => openAdd(p.id, date)} className="w-full text-[10px] uppercase tracking-wider text-muted-foreground hover:text-primary border border-dashed border-transparent hover:border-primary/40 rounded py-0.5">+</button>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {open && (
        <AddShiftDialog
          staff={staff ?? []}
          defaultStaffId={prefill.staffId}
          defaultDate={prefill.date ?? isoOnly(new Date())}
          onClose={() => setOpen(false)}
          onSaved={() => { qc.invalidateQueries({ queryKey: getListRosterShiftsQueryKey() }); setOpen(false); }}
        />
      )}
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
