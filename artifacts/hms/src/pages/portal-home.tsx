import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, Calendar, Receipt, LogOut, Stethoscope } from "lucide-react";
import { EmptyState } from "@/components/primitives/empty-state";

type Me = { id: number; name: string; mrn: string; phone: string } | null;
type Appt = { id: number; scheduledAt: string; department: string; status: string; doctorName: string | null; reason: string | null };
type Bill = { id: number; billNumber: string; status: string; total: number; createdAt: string };

const base = import.meta.env.BASE_URL;

function useApi<T>(path: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`${base}api${path}`, { credentials: "include" })
      .then(async (r) => (r.ok ? (r.json() as Promise<T>) : null))
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, loading };
}

export function PortalShell({ children, active }: { children: React.ReactNode; active: "appointments" | "bills" }) {
  const [, setLocation] = useLocation();
  const { data: me } = useApi<Me>("/portal/me", []);

  useEffect(() => {
    if (me === null) {
      const t = setTimeout(() => {
        fetch(`${base}api/portal/me`, { credentials: "include" }).then((r) => {
          if (!r.ok) setLocation("/portal/login");
        });
      }, 0);
      return () => clearTimeout(t);
    }
    return;
  }, [me, setLocation]);

  async function logout() {
    await fetch(`${base}api/portal/logout`, { method: "POST", credentials: "include" });
    setLocation("/portal/login");
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Brand banner */}
      <div className="bg-sidebar-gradient text-white">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-gradient flex items-center justify-center shadow-md ring-1 ring-white/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold tracking-tight text-base leading-tight">Mystics MediCare</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/60 font-semibold">Patient Portal</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {me && (
              <div className="text-right hidden sm:block">
                <div className="text-sm font-medium">{me.name}</div>
                <div className="text-[10px] uppercase tracking-wider text-white/60">{me.mrn}</div>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={logout} className="bg-white/10 border-white/30 text-white hover:bg-white/20 hover:text-white">
              <LogOut className="w-4 h-4 mr-1.5" /> Sign out
            </Button>
          </div>
        </div>
      </div>

      <nav className="bg-card border-b border-border">
        <div className="max-w-4xl mx-auto px-6 flex gap-1">
          <PortalTab href="/portal/appointments" icon={Calendar} label="My Appointments" active={active === "appointments"} />
          <PortalTab href="/portal/bills" icon={Receipt} label="My Bills" active={active === "bills"} />
        </div>
      </nav>

      <main className="max-w-4xl mx-auto p-6">{children}</main>
    </div>
  );
}

function PortalTab({ href, icon: Icon, label, active }: { href: string; icon: React.ComponentType<{ className?: string }>; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 py-3.5 px-4 text-sm font-medium border-b-2 transition ${active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </Link>
  );
}

export function PortalAppointments() {
  const { data, loading } = useApi<Appt[]>("/portal/appointments", []);
  return (
    <PortalShell active="appointments">
      <Card className="border-card-border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Calendar className="w-5 h-5 text-primary" /> My Appointments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && <Skeleton className="h-32 w-full" />}
          {!loading && data && data.length === 0 && (
            <EmptyState icon={Calendar} title="No appointments yet" description="When you book one, it will show up here." />
          )}
          {!loading && data?.map((a) => (
            <div key={a.id} className="flex items-center justify-between border border-border rounded-lg p-4 hover:bg-muted/40 transition">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Stethoscope className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold truncate">{a.department}{a.doctorName ? ` — ${a.doctorName}` : ""}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(a.scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </div>
                  {a.reason && <div className="text-xs text-muted-foreground mt-1 italic">"{a.reason}"</div>}
                </div>
              </div>
              <Badge
                variant="outline"
                className={
                  a.status === "scheduled"
                    ? "bg-info/10 text-info border-info/30"
                    : a.status === "completed"
                    ? "bg-success/10 text-success border-success/30"
                    : "bg-muted text-muted-foreground"
                }
              >
                {a.status}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </PortalShell>
  );
}

export function PortalBills() {
  const { data, loading } = useApi<Bill[]>("/portal/bills", []);
  return (
    <PortalShell active="bills">
      <Card className="border-card-border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Receipt className="w-5 h-5 text-primary" /> My Bills</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && <Skeleton className="h-32 w-full" />}
          {!loading && data && data.length === 0 && (
            <EmptyState icon={Receipt} title="No bills yet" description="Your invoices and receipts will appear here." />
          )}
          {!loading && data?.map((b) => (
            <div key={b.id} className="flex items-center justify-between border border-border rounded-lg p-4 hover:bg-muted/40 transition">
              <div>
                <div className="font-semibold font-mono text-sm">{b.billNumber}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(b.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="font-mono font-bold text-foreground tabular-nums">
                  ₹{b.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
                <Badge
                  variant="outline"
                  className={
                    b.status === "paid"
                      ? "bg-success/10 text-success border-success/30"
                      : "bg-destructive/10 text-destructive border-destructive/30"
                  }
                >
                  {b.status}
                </Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </PortalShell>
  );
}
