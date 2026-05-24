import { useEffect, useMemo, useState } from "react";
import {
  useGetOpdQueue,
  useGetOpdQueueStats,
  useTokenAction,
  useMe,
  type QueueToken,
  getGetOpdQueueQueryKey,
  getGetOpdQueueStatsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { Activity, BellRing, Check, PhoneCall, RotateCcw, SkipForward, Timer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const POLL_MS = 10_000;
// Token actions (call/recall/skip/complete) drive the consultation flow, so per
// Task #6 they are restricted to admin/doctor. The API enforces this too — UI
// just hides the affordances so non-clinical staff don't see a dead button.
const TOKEN_ACTION_ROLES = new Set(["admin", "doctor"]);

function fmtMins(seconds: number | null | undefined) {
  if (!seconds && seconds !== 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}

export default function OpdQueue() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: queue, isLoading } = useGetOpdQueue(undefined, {
    query: { refetchInterval: POLL_MS, queryKey: getGetOpdQueueQueryKey() },
  });
  const { data: stats } = useGetOpdQueueStats({
    query: { refetchInterval: POLL_MS, queryKey: getGetOpdQueueStatsQueryKey() },
  });
  const tokenAction = useTokenAction();
  const [busyId, setBusyId] = useState<number | null>(null);
  const { data: me } = useMe();
  const canAct = TOKEN_ACTION_ROLES.has(me?.role ?? "");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetOpdQueueQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetOpdQueueStatsQueryKey() });
  };

  const act = (id: number, action: "call" | "recall" | "skip" | "complete", label: string) => {
    setBusyId(id);
    tokenAction.mutate(
      { id, action },
      {
        onSuccess: () => {
          toast({ title: label });
          invalidate();
        },
        onError: (e: unknown) => {
          const msg = e instanceof Error ? e.message : "Action failed";
          toast({ title: "Action failed", description: msg, variant: "destructive" });
        },
        onSettled: () => setBusyId(null),
      },
    );
  };

  const byDept = useMemo(() => {
    const m: Record<string, QueueToken[]> = {};
    (queue ?? []).forEach((t) => {
      (m[t.department] ??= []).push(t);
    });
    return m;
  }, [queue]);

  // Stats are department-keyed; surface a single hospital-wide KPI strip from
  // the per-department breakdown so the board reads at a glance.
  const totals = useMemo(() => {
    const d = stats?.departments ?? [];
    const waiting = d.reduce((s, x) => s + x.waiting, 0);
    const called = d.reduce((s, x) => s + x.called, 0);
    const completed = d.reduce((s, x) => s + x.completed, 0);
    const waitsamples = d.map((x) => x.avgWaitSeconds).filter((x): x is number => typeof x === "number");
    const avgWait = waitsamples.length ? Math.round(waitsamples.reduce((s, n) => s + n, 0) / waitsamples.length) : null;
    return { waiting, called, completed, avgWait };
  }, [stats]);

  useEffect(() => {
    // light auto-refresh fallback if the tab regains focus
    const f = () => invalidate();
    window.addEventListener("focus", f);
    return () => window.removeEventListener("focus", f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) {
    return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">OPD Token Queue</h1>
        <p className="text-muted-foreground">Live board · refreshes every {POLL_MS / 1000}s.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Waiting" value={totals.waiting} icon={Timer} tone="info" />
        <KpiTile label="In consult" value={totals.called} icon={PhoneCall} tone="warning" />
        <KpiTile label="Served today" value={totals.completed} icon={Check} tone="success" />
        <KpiTile label="Avg wait" value={fmtMins(totals.avgWait)} icon={Activity} tone="muted" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Object.entries(byDept).map(([dept, tokens]) => {
          const called = tokens.filter((t) => t.status === "called");
          const waiting = tokens.filter((t) => t.status === "waiting");
          const skipped = tokens.filter((t) => t.status === "skipped");
          const deptStat = stats?.departments.find((d) => d.department === dept);

          return (
            <Card key={dept} className="flex flex-col">
              <CardHeader className="bg-primary/5 pb-4 border-b border-border">
                <CardTitle className="text-lg flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-primary" />
                    {dept}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">
                    avg wait {fmtMins(deptStat?.avgWaitSeconds ?? null)}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 flex-1 flex flex-col">
                <div className="p-6 bg-card text-center border-b border-border">
                  <p className="text-sm text-muted-foreground mb-2">CURRENTLY SERVING</p>
                  {called.length > 0 ? (
                    <div className="space-y-4">
                      {called.map((t) => (
                        <div key={t.id} className="animate-in fade-in zoom-in duration-500">
                          <h2 className="text-6xl font-black text-primary tracking-tighter">#{t.tokenNumber}</h2>
                          <p className="text-lg font-medium mt-2">{t.patientName}</p>
                          {t.doctorName && <p className="text-sm text-muted-foreground">Dr. {t.doctorName}</p>}
                          {canAct && (
                            <div className="flex justify-center gap-2 mt-3">
                              <Button size="sm" variant="outline" onClick={() => act(t.id, "recall", "Re-called")}
                                disabled={busyId === t.id}>
                                <BellRing className="w-3.5 h-3.5 mr-1" /> Recall
                              </Button>
                              <Button size="sm" onClick={() => act(t.id, "complete", "Marked complete")}
                                disabled={busyId === t.id}>
                                <Check className="w-3.5 h-3.5 mr-1" /> Complete
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-3xl font-bold text-muted-foreground/30 py-4">--</div>
                  )}
                </div>

                <div className="p-4 flex-1 bg-muted/20 space-y-3">
                  <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    Waiting ({waiting.length})
                  </p>
                  <div className="space-y-2">
                    {waiting.map((t) => (
                      <div key={t.id} className="flex items-center justify-between p-3 bg-card rounded-md border border-border shadow-sm">
                        <div className="flex items-center gap-3 min-w-0">
                          <Badge variant="secondary" className="font-mono text-sm px-2 shrink-0">#{t.tokenNumber}</Badge>
                          <span className="font-medium text-sm truncate">{t.patientName}</span>
                        </div>
                        {canAct && (
                          <div className="flex items-center gap-1 shrink-0">
                            <Button size="sm" variant="ghost" className="h-8 px-2 text-muted-foreground"
                              onClick={() => act(t.id, "skip", "Token skipped")}
                              disabled={busyId === t.id}>
                              <SkipForward className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 px-2 text-primary"
                              onClick={() => act(t.id, "call", `Called #${t.tokenNumber}`)}
                              disabled={busyId === t.id}>
                              <PhoneCall className="w-4 h-4 mr-1" /> Call
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                    {waiting.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">No waiting patients</p>
                    )}
                  </div>

                  {skipped.length > 0 && (
                    <div className="pt-2 border-t border-border">
                      <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase mb-2">
                        Skipped ({skipped.length})
                      </p>
                      <div className="space-y-1.5">
                        {skipped.map((t) => (
                          <div key={t.id} className="flex items-center justify-between p-2 bg-card rounded-md border border-dashed">
                            <span className="text-xs text-muted-foreground">
                              #{t.tokenNumber} · {t.patientName}
                            </span>
                            {canAct && (
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                                onClick={() => act(t.id, "call", `Re-queued #${t.tokenNumber}`)}
                                disabled={busyId === t.id}>
                                <RotateCcw className="w-3 h-3 mr-1" /> Call
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {Object.keys(byDept).length === 0 && (
          <Card className="md:col-span-2 lg:col-span-3">
            <CardContent className="py-12 text-center text-muted-foreground text-sm">
              No tokens in any queue right now.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function KpiTile({
  label, value, icon: Icon, tone,
}: { label: string; value: number | string; icon: React.ComponentType<{ className?: string }>; tone: "info" | "warning" | "success" | "muted" }) {
  const tones: Record<string, string> = {
    info: "bg-info/10 text-info border-info/30",
    warning: "bg-warning/10 text-warning border-warning/30",
    success: "bg-success/10 text-success border-success/30",
    muted: "bg-muted text-muted-foreground border-border",
  };
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <span className={`w-10 h-10 rounded-md flex items-center justify-center border ${tones[tone]}`}>
          <Icon className="w-5 h-5" />
        </span>
        <div className="leading-tight">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
