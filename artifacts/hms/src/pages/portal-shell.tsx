import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles, Home, Calendar, FolderHeart, Receipt, User, Bell, LogOut,
} from "lucide-react";

export const portalBase = import.meta.env.BASE_URL;

export type PortalMe = {
  id: number;
  name: string;
  mrn: string;
  phone: string;
  email?: string | null;
};

export function portalApi<T>(path: string, init?: RequestInit): Promise<T> {
  return fetch(`${portalBase}api${path}`, {
    credentials: "include",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  }).then(async (r) => {
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new Error(body.error || `Request failed (${r.status})`);
    }
    if (r.status === 204) return null as T;
    return r.json();
  });
}

// Public hospital settings (working hours + holidays) + helpers for portal
// booking flows. Mirrors the staff appointment-new page so the patient sees
// the same constraints the server enforces.
export type PublicHospitalSettings = {
  name?: string;
  workingHours?: Record<string, { open?: string; close?: string; closed?: boolean }> | null;
  holidays?: Array<{ date: string; label?: string }> | null;
};

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function formatWorkingHoursHint(
  wh: PublicHospitalSettings["workingHours"] | undefined,
): string | null {
  if (!wh) return null;
  return DAY_KEYS
    .map((d, i) => {
      const v = wh[d];
      if (!v || v.closed) return `${DAY_LABELS[i]}: Closed`;
      return `${DAY_LABELS[i]}: ${v.open ?? "—"}–${v.close ?? "—"}`;
    })
    .join("  •  ");
}

export function formatHolidayHint(
  hs: PublicHospitalSettings["holidays"] | undefined,
): string | null {
  if (!hs || hs.length === 0) return null;
  return hs.slice(0, 5).map((h) => `${h.date}${h.label ? ` (${h.label})` : ""}`).join(", ");
}

// Returns a predicate that matches dates the hospital is closed on (holiday
// or a DOW marked closed in workingHours). Designed to be passed straight
// to react-day-picker's `disabled` prop so closed days render greyed-out
// inside the calendar instead of only failing after the user picks them.
export function makeClosedDayMatcher(
  settings: PublicHospitalSettings | null | undefined,
): (date: Date) => boolean {
  const closedDows = new Set<number>();
  const wh = settings?.workingHours ?? {};
  DAY_KEYS.forEach((k, i) => { if (wh[k]?.closed) closedDows.add(i); });
  const holidaySet = new Set((settings?.holidays ?? []).map((h) => h.date));
  return (date: Date) => {
    if (closedDows.has(date.getDay())) return true;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return holidaySet.has(`${y}-${m}-${d}`);
  };
}

// Returns a reason string if the hospital is closed on the given YYYY-MM-DD,
// otherwise null. Used to short-circuit submit before round-tripping to the
// server (which returns a generic 400 on closed days).
export function closedReasonFor(
  settings: PublicHospitalSettings | null | undefined,
  dateStr: string,
): string | null {
  if (!settings || !dateStr) return null;
  const holiday = (settings.holidays ?? []).find((h) => h.date === dateStr);
  if (holiday) return `Hospital closed on ${dateStr}${holiday.label ? ` (${holiday.label})` : ""}`;
  const wh = settings.workingHours ?? undefined;
  if (!wh) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dow = new Date(y, m - 1, d).getDay();
  const cfg = wh[DAY_KEYS[dow]];
  if (cfg?.closed) return `Hospital closed on ${DAY_LABELS[dow]}`;
  return null;
}

export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (path === null) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    portalApi<T>(path)
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((e: Error) => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, loading, error, setData };
}

type TabKey = "home" | "appointments" | "records" | "bills" | "profile" | "notifications";

const TABS: { key: TabKey; href: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "home", href: "/portal/home", label: "Home", icon: Home },
  { key: "appointments", href: "/portal/appointments", label: "Appointments", icon: Calendar },
  { key: "records", href: "/portal/records", label: "Records", icon: FolderHeart },
  { key: "bills", href: "/portal/bills", label: "Bills", icon: Receipt },
  { key: "notifications", href: "/portal/notifications", label: "Inbox", icon: Bell },
  { key: "profile", href: "/portal/profile", label: "Profile", icon: User },
];

export function PortalShell({
  children, active, notifBadge,
}: {
  children: React.ReactNode;
  active: TabKey;
  notifBadge?: number;
}) {
  const [, setLocation] = useLocation();
  const { data: me } = useApi<PortalMe>("/portal/me", []);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      fetch(`${portalBase}api/portal/me`, { credentials: "include" }).then((r) => {
        if (!cancelled && !r.ok) setLocation("/portal/login");
      });
    }, 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [setLocation]);

  async function logout() {
    await fetch(`${portalBase}api/portal/logout`, { method: "POST", credentials: "include" });
    setLocation("/portal/login");
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="bg-sidebar-gradient text-white">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
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

      <nav className="bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <PortalTab
              key={t.key}
              href={t.href}
              icon={t.icon}
              label={t.label}
              active={active === t.key}
              badge={t.key === "notifications" ? notifBadge : undefined}
            />
          ))}
        </div>
      </nav>

      <main className="max-w-5xl mx-auto p-6">{children}</main>
    </div>
  );
}

function PortalTab({
  href, icon: Icon, label, active, badge,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 py-3.5 px-4 text-sm font-medium border-b-2 transition whitespace-nowrap ${active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
    >
      <Icon className="w-4 h-4" />
      {label}
      {badge && badge > 0 ? (
        <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{badge}</Badge>
      ) : null}
    </Link>
  );
}

export function formatINR(n: number | string | null | undefined): string {
  const v = typeof n === "number" ? n : Number(n ?? 0);
  return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { dateStyle: "medium" });
}
