import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Hospital, Calendar, Receipt, LogOut } from "lucide-react";

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
    <div className="min-h-screen bg-muted">
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary text-primary-foreground p-2 rounded-lg"><Hospital className="w-5 h-5" /></div>
            <div>
              <div className="font-semibold">MediCare Patient Portal</div>
              {me && <div className="text-xs text-muted-foreground">{me.name} • {me.mrn}</div>}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}><LogOut className="w-4 h-4 mr-2" />Sign out</Button>
        </div>
      </header>
      <nav className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-6 flex gap-2">
          <Link href="/portal/appointments" className={`py-3 px-3 border-b-2 text-sm font-medium ${active === "appointments" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
            <Calendar className="w-4 h-4 inline mr-1" />My Appointments
          </Link>
          <Link href="/portal/bills" className={`py-3 px-3 border-b-2 text-sm font-medium ${active === "bills" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
            <Receipt className="w-4 h-4 inline mr-1" />My Bills
          </Link>
        </div>
      </nav>
      <main className="max-w-4xl mx-auto p-6">{children}</main>
    </div>
  );
}

export function PortalAppointments() {
  const { data, loading } = useApi<Appt[]>("/portal/appointments", []);
  return (
    <PortalShell active="appointments">
      <Card>
        <CardHeader><CardTitle>My Appointments</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {loading && <Skeleton className="h-32 w-full" />}
          {!loading && data && data.length === 0 && <div className="text-muted-foreground text-sm">No appointments yet.</div>}
          {!loading && data?.map((a) => (
            <div key={a.id} className="flex items-center justify-between border rounded-md p-3">
              <div>
                <div className="font-medium">{a.department}{a.doctorName ? ` — ${a.doctorName}` : ""}</div>
                <div className="text-xs text-muted-foreground">{new Date(a.scheduledAt).toLocaleString()}</div>
                {a.reason && <div className="text-xs text-muted-foreground mt-1">{a.reason}</div>}
              </div>
              <Badge variant={a.status === "scheduled" ? "default" : a.status === "completed" ? "secondary" : "outline"}>{a.status}</Badge>
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
      <Card>
        <CardHeader><CardTitle>My Bills</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {loading && <Skeleton className="h-32 w-full" />}
          {!loading && data && data.length === 0 && <div className="text-muted-foreground text-sm">No bills yet.</div>}
          {!loading && data?.map((b) => (
            <div key={b.id} className="flex items-center justify-between border rounded-md p-3">
              <div>
                <div className="font-medium">{b.billNumber}</div>
                <div className="text-xs text-muted-foreground">{new Date(b.createdAt).toLocaleDateString()}</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="font-mono font-semibold">₹{b.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
                <Badge variant={b.status === "paid" ? "default" : "destructive"}>{b.status}</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </PortalShell>
  );
}
