import React, { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Activity, Users, Calendar, Clock, BedDouble, TestTube, Cross, ShieldPlus,
  IndianRupee, Package, Scissors, Syringe, FileSignature, ClipboardCheck,
  Video, MessageSquare, ListTree, UserCog, Settings, Bell, Search, Menu,
  LogOut, Sun, Moon, Stethoscope, Sparkles, Command as CommandIcon, ChevronDown,
  Wallet, BarChart3, Shield,
} from "lucide-react";

import { useMe, useLogout, useGetDashboardSummary, useListBills, useListNotificationLog } from "@workspace/api-client-react";
import { useBranding } from "@/lib/use-branding";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/theme-provider";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { CommandPalette, useCommandPaletteHotkey } from "./command-palette";

type Item = { icon: React.ComponentType<{ className?: string }>; label: string; href: string; roles?: string[] };
type Group = { label: string; items: Item[] };

const ALL_GROUPS: Group[] = [
  {
    label: "Clinical",
    items: [
      { icon: Activity, label: "Dashboard", href: "/dashboard" },
      { icon: Users, label: "Patients", href: "/patients", roles: ["admin", "doctor", "nurse", "receptionist", "labtech", "pharmacist"] },
      { icon: Calendar, label: "Appointments", href: "/appointments", roles: ["admin", "doctor", "nurse", "receptionist"] },
      { icon: Clock, label: "OPD Queue", href: "/opd", roles: ["admin", "doctor", "nurse", "receptionist"] },
    ],
  },
  {
    label: "IPD",
    items: [
      { icon: BedDouble, label: "IPD Wards", href: "/ipd", roles: ["admin", "doctor", "nurse"] },
      { icon: BedDouble, label: "Bed Manager", href: "/beds", roles: ["admin", "nurse", "doctor", "receptionist"] },
      { icon: Scissors, label: "OT Bookings", href: "/ot", roles: ["admin", "doctor", "nurse"] },
    ],
  },
  {
    label: "Diagnostics",
    items: [
      { icon: TestTube, label: "Laboratory", href: "/lab", roles: ["admin", "doctor", "labtech", "nurse"] },
      { icon: Cross, label: "Radiology", href: "/radiology", roles: ["admin", "doctor", "nurse"] },
      { icon: Video, label: "Video Library", href: "/videos", roles: ["admin", "doctor", "nurse"] },
    ],
  },
  {
    label: "Pharmacy",
    items: [
      { icon: ShieldPlus, label: "Pharmacy", href: "/pharmacy", roles: ["admin", "pharmacist", "doctor"] },
      { icon: ClipboardCheck, label: "Prescriptions", href: "/prescriptions", roles: ["admin", "doctor", "pharmacist", "nurse"] },
      { icon: ShieldPlus, label: "Drug Library", href: "/drugs", roles: ["admin", "pharmacist", "doctor"] },
      { icon: Package, label: "Inventory", href: "/inventory", roles: ["admin", "pharmacist"] },
    ],
  },
  {
    label: "Preventive",
    items: [
      { icon: Syringe, label: "Vaccinations", href: "/vaccinations", roles: ["admin", "doctor", "nurse"] },
      { icon: Stethoscope, label: "Checkups", href: "/checkups", roles: ["admin", "doctor", "nurse"] },
      { icon: FileSignature, label: "Consent Forms", href: "/consent", roles: ["admin", "doctor", "nurse"] },
    ],
  },
  {
    label: "Billing",
    items: [
      { icon: IndianRupee, label: "Billing", href: "/billing", roles: ["admin", "accountant", "cashier", "receptionist"] },
      { icon: Wallet, label: "Cashier Drawer", href: "/billing/cashier", roles: ["admin", "accountant", "cashier"] },
      { icon: BarChart3, label: "Billing Reports", href: "/billing/reports", roles: ["admin", "accountant"] },
    ],
  },
  {
    label: "People",
    items: [
      { icon: UserCog, label: "Staff Directory", href: "/staff", roles: ["admin"] },
      { icon: Calendar, label: "Duty Roster", href: "/roster", roles: ["admin", "nurse", "doctor"] },
    ],
  },
  {
    label: "Admin",
    items: [
      { icon: MessageSquare, label: "Templates", href: "/notifications/templates", roles: ["admin"] },
      { icon: Bell, label: "Notification Log", href: "/notifications/log", roles: ["admin"] },
      { icon: Shield, label: "Roles & Permissions", href: "/admin/roles", roles: ["admin"] },
      { icon: BarChart3, label: "Reports Hub", href: "/admin/reports", roles: ["admin", "accountant"] },
      { icon: ListTree, label: "Audit Log", href: "/audit", roles: ["admin"] },
      { icon: Settings, label: "Settings", href: "/settings" },
    ],
  },
];

// Topbar notifications popover. Reads the latest notification log entries
// (most-recent first) and surfaces them in a dropdown panel; clicking
// "View all" deep-links to the full log page. The bell badge prefers the
// `criticalAlerts` summary metric so cashier/admin see ops alerts even
// when no SMS/email has fired yet.
function NotificationsBell({ criticalAlerts }: { criticalAlerts?: number }) {
  const [open, setOpen] = useState(false);
  const { data: logs, isLoading } = useListNotificationLog(undefined, {
    query: { enabled: open, queryKey: ["notification-log", "topbar"] as const },
  });
  const recent = (logs ?? []).slice(0, 6);
  const badge = criticalAlerts ?? 0;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-muted-foreground"
          aria-label={`Notifications${badge ? ` (${badge} unread)` : ""}`}
        >
          <Bell className="w-5 h-5" />
          {badge > 0 && (
            <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center ring-2 ring-card">
              {badge}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/40">
          <div className="text-sm font-semibold">Notifications</div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Latest activity
          </span>
        </div>
        <div className="max-h-[360px] overflow-y-auto scrollbar-thin divide-y divide-border">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading…</div>
          ) : recent.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              You're all caught up.
            </div>
          ) : (
            recent.map((n) => (
              <div key={n.id} className="px-3 py-2.5 hover:bg-muted/40 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                    {n.eventKey.replace(/_/g, " ")}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(n.sentAt).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div className="text-sm text-foreground mt-0.5 line-clamp-2">
                  {n.renderedBody}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1 flex gap-2">
                  <span>{n.channel.toUpperCase()}</span>
                  <span>·</span>
                  <span className={n.status === "failed" ? "text-destructive" : ""}>{n.status}</span>
                  {n.patientName && (<><span>·</span><span>{n.patientName}</span></>)}
                </div>
              </div>
            ))
          )}
        </div>
        <div className="border-t border-border px-3 py-2 bg-muted/30 flex justify-end">
          <Button asChild variant="ghost" size="sm" onClick={() => setOpen(false)}>
            <Link href="/notifications/log">View all</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  useCommandPaletteHotkey(() => setPaletteOpen(true));
  useBranding();

  return (
    <SidebarProvider>
      <div className="min-h-screen w-full flex bg-background">
        <AppSidebar onOpenPalette={() => setPaletteOpen(true)} />
        <div className="flex-1 flex flex-col min-w-0 h-[100dvh]">
          <Topbar onOpenPalette={() => setPaletteOpen(true)} />
          <main className="flex-1 overflow-auto bg-muted/30 scrollbar-thin">{children}</main>
        </div>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      </div>
    </SidebarProvider>
  );
}

function AppSidebar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const [location] = useLocation();
  const { data: session } = useMe();
  const role = (session?.role as string | undefined) ?? "";
  const [filter, setFilter] = useState("");
  const branding = useBranding();

  const navGroups = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return ALL_GROUPS.map((g) => ({
      ...g,
      items: g.items
        .filter((it) => !it.roles || it.roles.includes(role))
        .filter((it) => !f || it.label.toLowerCase().includes(f) || g.label.toLowerCase().includes(f)),
    })).filter((g) => g.items.length > 0);
  }, [filter, role]);

  // Collapsed-group state persists per user in localStorage. Filter input
  // auto-expands all groups so search results stay visible.
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem("hms.sidebar.collapsed");
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });
  const isFiltering = filter.trim().length > 0;
  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      try { localStorage.setItem("hms.sidebar.collapsed", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  return (
    <Sidebar variant="sidebar" className="border-r border-sidebar-border bg-sidebar-gradient">
      <SidebarHeader className="h-16 flex items-center px-4 border-b border-sidebar-border gap-2 bg-transparent">
        {branding?.logoUrl ? (
          <img
            src={branding.logoUrl}
            alt={branding.name ?? "Logo"}
            className="w-9 h-9 rounded-xl object-cover shadow-md ring-1 ring-white/20 bg-white"
          />
        ) : (
          <div className="w-9 h-9 rounded-xl bg-brand-gradient text-white flex items-center justify-center shadow-md ring-1 ring-white/20">
            <Sparkles className="w-5 h-5" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[15px] tracking-tight truncate text-sidebar-foreground leading-tight">
            {branding?.name ?? "MediCare HMS"}
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/50 font-semibold">
            Pro · Clinical OS
          </div>
        </div>
      </SidebarHeader>

      <div className="px-3 pt-3 pb-1">
        <button
          onClick={onOpenPalette}
          className="w-full text-left flex items-center gap-2 px-3 h-9 rounded-lg bg-sidebar-accent/50 hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-foreground border border-sidebar-border text-sm transition"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="flex-1 truncate text-xs">Search & commands…</span>
          <kbd className="text-[10px] font-mono bg-sidebar/80 px-1.5 py-0.5 rounded border border-sidebar-border">⌘K</kbd>
        </button>
        <div className="relative mt-2">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-sidebar-foreground/40" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter menu"
            className="w-full h-8 pl-7 pr-2 bg-sidebar/50 border border-sidebar-border rounded-md text-xs text-sidebar-foreground placeholder:text-sidebar-foreground/40 focus:outline-none focus:ring-1 focus:ring-sidebar-ring"
          />
        </div>
      </div>

      <SidebarContent className="scrollbar-thin">
        {navGroups.map((group) => {
          const isOpen = isFiltering || !collapsedGroups[group.label];
          return (
            <SidebarGroup key={group.label}>
              <Collapsible open={isOpen} onOpenChange={() => !isFiltering && toggleGroup(group.label)}>
                <CollapsibleTrigger
                  className="w-full flex items-center justify-between text-[10px] font-bold tracking-[0.16em] uppercase text-sidebar-foreground/40 hover:text-sidebar-foreground/70 px-3 py-1.5 transition-colors group/grouphdr"
                  aria-label={`Toggle ${group.label} section`}
                  disabled={isFiltering}
                >
                  <span>{group.label}</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenu>
                    {group.items.map((item) => {
                      const active = location === item.href || (item.href !== "/dashboard" && location.startsWith(item.href));
                      return (
                        <SidebarMenuItem key={item.href}>
                          <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                            <Link href={item.href} className="flex items-center gap-3 relative">
                              {active && <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-1 h-5 bg-sidebar-primary rounded-r-full shadow-[0_0_8px_hsl(var(--sidebar-primary))]" />}
                              <item.icon className="w-4 h-4" />
                              <span>{item.label}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </CollapsibleContent>
              </Collapsible>
            </SidebarGroup>
          );
        })}
        {navGroups.length === 0 && (
          <div className="px-4 py-6 text-xs text-sidebar-foreground/40 text-center">No matching menu items.</div>
        )}
      </SidebarContent>
    </Sidebar>
  );
}

function Topbar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const { toggleSidebar } = useSidebar();
  const { theme, setTheme } = useTheme();
  const { data: session } = useMe();
  const [, setLocation] = useLocation();
  const logoutMutation = useLogout();
  const { data: summary } = useGetDashboardSummary();
  const { data: pendingBills } = useListBills({ status: "pending" });
  const pendingBillsCount = pendingBills?.length ?? 0;

  // Environment badge — surfaces dev vs production at a glance so staff
  // never confuse the staging console with the live hospital deployment.
  const envMode = import.meta.env.MODE;
  const envLabel = envMode === "production" ? "Prod" : envMode === "test" ? "Test" : "Dev";
  const envTone =
    envMode === "production"
      ? "bg-success/10 text-success border-success/30"
      : "bg-warning/15 text-warning border-warning/30";

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => setLocation("/login"),
    });
  };

  return (
    <header className="h-16 shrink-0 border-b border-border bg-card/80 backdrop-blur-xl flex items-center justify-between px-4 sticky top-0 z-20">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Button variant="ghost" size="icon" onClick={toggleSidebar} className="lg:hidden">
          <Menu className="w-5 h-5" />
        </Button>
        <button
          onClick={onOpenPalette}
          className="hidden sm:flex items-center gap-2 h-9 px-3 max-w-md w-full bg-muted/60 hover:bg-muted border border-input rounded-lg text-muted-foreground text-sm transition"
        >
          <Search className="w-4 h-4" />
          <span className="flex-1 text-left truncate">Search patients, navigate, or run a command…</span>
          <kbd className="text-[10px] font-mono bg-card px-1.5 py-0.5 rounded border border-border flex items-center gap-0.5">
            <CommandIcon className="w-3 h-3" />K
          </kbd>
        </button>
      </div>

      <div className="hidden md:flex items-center gap-1.5 mr-3">
        <Pill icon={Calendar} tone="primary" label="OPD today" value={summary?.todayAppointments} />
        <Pill icon={BedDouble} tone="warning" label="Beds" value={summary ? `${summary.occupiedBeds}/${summary.totalBeds}` : undefined} />
        <Pill icon={IndianRupee} tone="info" label="Pending bills" value={pendingBillsCount} />
      </div>

      <div className="flex items-center gap-1">
        <Badge variant="outline" className={`hidden lg:inline-flex font-medium text-[10px] tracking-wider uppercase ${envTone}`}>
          {envLabel}
        </Badge>
        <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="text-muted-foreground">
          {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </Button>
        <NotificationsBell criticalAlerts={summary?.criticalAlerts} />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-9 w-9 rounded-full ml-1 p-0">
              <Avatar className="h-9 w-9 ring-2 ring-primary/30">
                <AvatarFallback className="bg-brand-gradient text-white font-bold text-sm">
                  {session?.name?.substring(0, 2).toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-60" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <span className="text-sm font-semibold">{session?.name || "User"}</span>
                <span className="text-xs text-muted-foreground">{session?.email || "user@example.com"}</span>
                <span className="mt-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary w-fit uppercase tracking-wider">
                  {session?.role || "Staff"}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onOpenPalette}>
              <CommandIcon className="mr-2 h-4 w-4" />
              <span>Command palette</span>
              <kbd className="ml-auto text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">⌘K</kbd>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings" className="cursor-pointer flex w-full">
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive cursor-pointer">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function Pill({ icon: Icon, tone, label, value }: { icon: React.ComponentType<{ className?: string }>; tone: "primary" | "warning" | "info"; label: string; value: React.ReactNode }) {
  const tones = {
    primary: "text-primary bg-primary/10 border-primary/20",
    warning: "text-warning bg-warning/10 border-warning/20",
    info: "text-info bg-info/10 border-info/20",
  };
  return (
    <div className={`flex items-center gap-1.5 h-8 px-2.5 rounded-md border ${tones[tone]} text-xs font-medium`}>
      <Icon className="w-3.5 h-3.5" />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-bold text-foreground tabular-nums">{value ?? "–"}</span>
    </div>
  );
}
