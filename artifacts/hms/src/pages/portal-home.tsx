import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/primitives/empty-state";
import {
  Calendar, Stethoscope, Receipt, ArrowRight, FileText, Bell, AlertCircle, Plus, X, Pencil, FlaskConical, Scan,
} from "lucide-react";
import { PortalShell, useApi, portalApi, fmtDateTime, fmtDate, formatINR } from "./portal-shell";
import type { PortalMe } from "./portal-shell";

type Appt = {
  id: number; scheduledAt: string; department: string; status: string;
  doctorId?: number | null; doctorName: string | null; reason: string | null;
  tokenNumber?: number | null; createdAt?: string;
};
type Bill = {
  id: number; billNumber: string; status: string; total: number;
  paidAmount?: number; refundedAmount?: number; createdAt: string;
};
type Encounter = {
  id: number; type: string; status: string; doctorName: string | null;
  diagnosis: string | null; startedAt: string;
};
type Report = { kind: "lab" | "radiology"; id: number; name: string; at: string; pdfUrl: string };
type HomeData = {
  me: PortalMe;
  upcomingAppointments: Appt[];
  recentEncounters: Encounter[];
  pendingBills: Bill[];
  recentReports: Report[];
  notificationCount: number;
};

function balanceOf(b: Bill): number {
  return Math.max(0, b.total - (b.paidAmount ?? 0) + (b.refundedAmount ?? 0));
}

// ============================================================================
// Home dashboard
// ============================================================================
export function PortalHome() {
  const { data, loading } = useApi<HomeData>("/portal/home", []);
  return (
    <PortalShell active="home" notifBadge={data?.notificationCount}>
      <div className="space-y-6">
        {/* Greeting */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {loading ? "Welcome back" : `Hello, ${data?.me.name.split(" ")[0]} 👋`}
            </h1>
            <p className="text-sm text-muted-foreground">Your health at a glance.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/portal/book">
              <Button className="bg-brand-gradient text-white shadow-md">
                <Plus className="w-4 h-4 mr-1.5" /> Book appointment
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Upcoming appointments */}
          <Card className="border-card-border shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" /> Upcoming visits</CardTitle>
              <Link href="/portal/appointments"><Button variant="ghost" size="sm" className="text-xs">View all <ArrowRight className="w-3 h-3 ml-1" /></Button></Link>
            </CardHeader>
            <CardContent>
              {loading && <Skeleton className="h-20 w-full" />}
              {!loading && data && data.upcomingAppointments.length === 0 && (
                <EmptyState icon={Calendar} title="No upcoming appointments" />
              )}
              <div className="space-y-2">
                {data?.upcomingAppointments.slice(0, 3).map((a) => (
                  <div key={a.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{a.department}{a.doctorName ? ` · ${a.doctorName}` : ""}</div>
                      <div className="text-xs text-muted-foreground">{fmtDateTime(a.scheduledAt)}</div>
                    </div>
                    <Badge variant="outline" className="bg-info/10 text-info border-info/30 capitalize">{a.status}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Pending bills */}
          <Card className="border-card-border shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><Receipt className="w-4 h-4 text-primary" /> Pending bills</CardTitle>
              <Link href="/portal/bills"><Button variant="ghost" size="sm" className="text-xs">View all <ArrowRight className="w-3 h-3 ml-1" /></Button></Link>
            </CardHeader>
            <CardContent>
              {loading && <Skeleton className="h-20 w-full" />}
              {!loading && data && data.pendingBills.length === 0 && (
                <EmptyState icon={Receipt} title="No outstanding bills" />
              )}
              <div className="space-y-2">
                {data?.pendingBills.slice(0, 3).map((b) => {
                  const bal = balanceOf(b);
                  return (
                    <Link key={b.id} href={`/portal/bills/${b.id}`}>
                      <div className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted/40 cursor-pointer">
                        <div>
                          <div className="text-sm font-mono font-semibold">{b.billNumber}</div>
                          <div className="text-xs text-muted-foreground">{fmtDate(b.createdAt)}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono font-bold tabular-nums">{formatINR(bal)}</div>
                          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 capitalize text-[10px]">{b.status}</Badge>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Recent visits */}
          <Card className="border-card-border shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><Stethoscope className="w-4 h-4 text-primary" /> Recent visits</CardTitle>
              <Link href="/portal/records"><Button variant="ghost" size="sm" className="text-xs">All records <ArrowRight className="w-3 h-3 ml-1" /></Button></Link>
            </CardHeader>
            <CardContent>
              {loading && <Skeleton className="h-20 w-full" />}
              {!loading && data && data.recentEncounters.length === 0 && (
                <EmptyState icon={Stethoscope} title="No visits yet" />
              )}
              <div className="space-y-2">
                {data?.recentEncounters.slice(0, 3).map((e) => (
                  <div key={e.id} className="p-3 border border-border rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold capitalize">{e.type}{e.doctorName ? ` · ${e.doctorName}` : ""}</div>
                      <Badge variant="outline" className="text-[10px] capitalize">{e.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">{fmtDate(e.startedAt)}</div>
                    {e.diagnosis && <div className="text-xs mt-1 text-foreground/80">Dx: {e.diagnosis}</div>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Recent reports */}
          <Card className="border-card-border shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4 text-primary" /> Recent reports</CardTitle>
              <Link href="/portal/records"><Button variant="ghost" size="sm" className="text-xs">View all <ArrowRight className="w-3 h-3 ml-1" /></Button></Link>
            </CardHeader>
            <CardContent>
              {loading && <Skeleton className="h-20 w-full" />}
              {!loading && data && data.recentReports.length === 0 && (
                <EmptyState icon={FileText} title="No reports yet" />
              )}
              <div className="space-y-2">
                {data?.recentReports.slice(0, 4).map((r) => (
                  <a key={`${r.kind}-${r.id}`} href={r.pdfUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted/40">
                    <div className="flex items-center gap-2 min-w-0">
                      {r.kind === "lab" ? <FlaskConical className="w-4 h-4 text-primary shrink-0" /> : <Scan className="w-4 h-4 text-primary shrink-0" />}
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{r.name}</div>
                        <div className="text-xs text-muted-foreground">{fmtDate(r.at)}</div>
                      </div>
                    </div>
                    <FileText className="w-4 h-4 text-muted-foreground" />
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {data && data.notificationCount > 0 && (
          <Card className="border-info/30 bg-info/5">
            <CardContent className="py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-info" />
                <div className="text-sm">You have <strong>{data.notificationCount}</strong> message{data.notificationCount === 1 ? "" : "s"} in your inbox.</div>
              </div>
              <Link href="/portal/notifications"><Button variant="outline" size="sm">Open inbox</Button></Link>
            </CardContent>
          </Card>
        )}
      </div>
    </PortalShell>
  );
}

// ============================================================================
// Appointments (list + cancel + reschedule)
// ============================================================================
export function PortalAppointments() {
  const { data, loading, setData } = useApi<Appt[]>("/portal/appointments", []);
  const [reschedule, setReschedule] = useState<Appt | null>(null);

  async function onCancel(id: number) {
    if (!confirm("Cancel this appointment?")) return;
    try {
      await portalApi(`/portal/appointments/${id}/cancel`, { method: "POST" });
      setData((data ?? []).map((a) => (a.id === id ? { ...a, status: "cancelled" } : a)));
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <PortalShell active="appointments">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold tracking-tight">My Appointments</h1>
        <Link href="/portal/book">
          <Button className="bg-brand-gradient text-white shadow-md"><Plus className="w-4 h-4 mr-1.5" /> Book new</Button>
        </Link>
      </div>
      <Card className="border-card-border shadow-sm">
        <CardContent className="space-y-3 pt-6">
          {loading && <Skeleton className="h-32 w-full" />}
          {!loading && data && data.length === 0 && (
            <EmptyState icon={Calendar} title="No appointments yet" description="Book your first visit using the button above." />
          )}
          {data?.map((a) => {
            const canChange = a.status === "scheduled" || a.status === "confirmed";
            const future = new Date(a.scheduledAt).getTime() > Date.now();
            return (
              <div key={a.id} className="flex items-center justify-between border border-border rounded-lg p-4 hover:bg-muted/40 transition gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Stethoscope className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{a.department}{a.doctorName ? ` — ${a.doctorName}` : ""}</div>
                    <div className="text-xs text-muted-foreground">{fmtDateTime(a.scheduledAt)}</div>
                    {a.reason && <div className="text-xs text-muted-foreground mt-1 italic">"{a.reason}"</div>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      a.status === "scheduled" || a.status === "confirmed"
                        ? "bg-info/10 text-info border-info/30"
                        : a.status === "completed"
                        ? "bg-success/10 text-success border-success/30"
                        : "bg-muted text-muted-foreground"
                    }
                  >
                    {a.status}
                  </Badge>
                  {canChange && future && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setReschedule(a)}><Pencil className="w-3 h-3 mr-1" />Reschedule</Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => onCancel(a.id)}><X className="w-3 h-3 mr-1" />Cancel</Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <RescheduleDialog
        appt={reschedule}
        onClose={() => setReschedule(null)}
        onDone={(id, newIso) => {
          setData((data ?? []).map((a) => (a.id === id ? { ...a, scheduledAt: newIso } : a)));
          setReschedule(null);
        }}
      />
    </PortalShell>
  );
}

function RescheduleDialog({ appt, onClose, onDone }: { appt: Appt | null; onClose: () => void; onDone: (id: number, newIso: string) => void }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (appt) {
      const d = new Date(appt.scheduledAt);
      const pad = (n: number) => String(n).padStart(2, "0");
      setDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
      setTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
      setErr(null);
    }
  }, [appt]);

  async function submit() {
    if (!appt) return;
    setErr(null); setBusy(true);
    try {
      const iso = new Date(`${date}T${time}:00`).toISOString();
      const r = await portalApi<{ id: number; scheduledAt: string }>(`/portal/appointments/${appt.id}/reschedule`, {
        method: "POST",
        body: JSON.stringify({ scheduledAt: iso }),
      });
      onDone(r.id, r.scheduledAt);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={!!appt} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reschedule appointment</DialogTitle>
          <DialogDescription>Pick a new date and time for {appt?.department} with {appt?.doctorName ?? "your doctor"}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Time</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          {err && <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded-md">{err}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !date || !time}>{busy ? "Saving…" : "Confirm"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Book a new appointment
// ============================================================================
type Doctor = { id: number; name: string; department: string | null; specialization: string | null };

export function PortalBook() {
  const [, setLocation] = useLocation();
  const { data: doctors, loading } = useApi<Doctor[]>("/portal/doctors", []);
  const [doctorId, setDoctorId] = useState<string>("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");
  const [taken, setTaken] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const chosenDoctor = doctors?.find((d) => String(d.id) === doctorId);
  const department = chosenDoctor?.department ?? "";

  useEffect(() => {
    if (!doctorId || !date) { setTaken([]); return; }
    portalApi<{ taken: string[] }>(`/portal/doctors/${doctorId}/slots?date=${date}`)
      .then((r) => setTaken(r.taken))
      .catch(() => setTaken([]));
  }, [doctorId, date]);

  const takenSet = new Set(
    taken.map((iso) => {
      const d = new Date(iso);
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }),
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      const iso = new Date(`${date}T${time}:00`).toISOString();
      await portalApi(`/portal/appointments`, {
        method: "POST",
        body: JSON.stringify({
          doctorId: Number(doctorId),
          department,
          scheduledAt: iso,
          reason: reason || undefined,
        }),
      });
      setLocation("/portal/appointments");
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  // Helper: render quick 15-min slot suggestions (9am–5pm) flagged with availability.
  const slotOptions: string[] = [];
  for (let h = 9; h < 17; h++) {
    for (const m of [0, 15, 30, 45]) {
      const pad = (n: number) => String(n).padStart(2, "0");
      slotOptions.push(`${pad(h)}:${pad(m)}`);
    }
  }

  return (
    <PortalShell active="appointments">
      <Card className="border-card-border shadow-sm max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Calendar className="w-5 h-5 text-primary" /> Book an appointment</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-40" /> : (
            <form className="space-y-4" onSubmit={submit}>
              <div>
                <Label>Doctor</Label>
                <Select value={doctorId} onValueChange={setDoctorId}>
                  <SelectTrigger><SelectValue placeholder="Select a doctor" /></SelectTrigger>
                  <SelectContent>
                    {doctors?.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.name}{d.specialization ? ` · ${d.specialization}` : ""}{d.department ? ` (${d.department})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Date</Label>
                  <Input type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => { setDate(e.target.value); setTime(""); }} />
                </div>
                <div>
                  <Label>Time</Label>
                  <Select value={time} onValueChange={setTime} disabled={!doctorId || !date}>
                    <SelectTrigger><SelectValue placeholder="Pick a slot" /></SelectTrigger>
                    <SelectContent>
                      {slotOptions.map((t) => {
                        const isTaken = takenSet.has(t);
                        return (
                          <SelectItem key={t} value={t} disabled={isTaken}>
                            {t}{isTaken ? " · booked" : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Reason for visit (optional)</Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Brief description of your symptoms or concern" maxLength={500} />
              </div>

              {err && <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded-md flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><span>{err}</span>
              </div>}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setLocation("/portal/appointments")}>Cancel</Button>
                <Button type="submit" className="bg-brand-gradient text-white" disabled={busy || !doctorId || !date || !time}>
                  {busy ? "Booking…" : "Confirm booking"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </PortalShell>
  );
}
