import {
  useGetDashboardSummary,
  useGetDashboardActivity,
  useGetDashboardCharts,
  useListBills,
  useMe,
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users, Calendar, BedDouble, TestTube, AlertTriangle, UserPlus, Clock,
  IndianRupee, Activity, Sparkles, FilePlus2, Pill, TrendingUp, ArrowRight,
  Stethoscope,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
  Cell, Pie, PieChart, BarChart, Bar,
} from "recharts";
import { StatCard } from "@/components/primitives/stat-card";
import { PageHeader } from "@/components/primitives/page-header";

const CHART_COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

function inr(n?: number | string | null) {
  const v = typeof n === "number" ? n : Number(n ?? 0);
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default function Dashboard() {
  const { data: session } = useMe();
  const role = session?.role ?? "";
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: activity, isLoading: loadingActivity } = useGetDashboardActivity();
  const { data: charts, isLoading: loadingCharts } = useGetDashboardCharts();

  const isCashier = role === "cashier" || role === "accountant";
  const isDoctor = role === "doctor";
  const isNurse = role === "nurse";

  // Real pending-bills count for cashier/accountant KPI (avoids using prescriptions as a proxy).
  // Only the cashier branch reads this; other roles get a cheap empty list call when they don't.
  const { data: pendingBillsData, isLoading: loadingPendingBills } = useListBills({ status: "pending" });
  const pendingBillsCount = pendingBillsData?.length ?? 0;

  const greeting = useGreeting();

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl bg-brand-gradient text-white p-6 md:p-8 shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(255,255,255,0.18),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_70%,rgba(255,255,255,0.12),transparent_50%)]" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] uppercase text-white/80 mb-2">
              <Sparkles className="w-3.5 h-3.5" /> Command Center
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              {greeting}, {session?.name?.split(" ")[0] || "there"}.
            </h1>
            <p className="text-white/85 mt-1 text-sm md:text-base">
              {summary
                ? `${summary.todayAppointments} appointments today · ${summary.occupiedBeds}/${summary.totalBeds} beds occupied · ${inr(summary.revenueToday)} collected.`
                : "Loading today's operational snapshot…"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary" className="bg-white text-primary hover:bg-white/90 font-semibold shadow-md">
              <Link href="/patients/new"><UserPlus className="w-4 h-4 mr-1.5" />Register Patient</Link>
            </Button>
            <Button asChild variant="outline" className="bg-white/10 text-white border-white/30 hover:bg-white/20 hover:text-white">
              <Link href="/appointments"><Calendar className="w-4 h-4 mr-1.5" />New Appointment</Link>
            </Button>
            <Button asChild variant="outline" className="bg-white/10 text-white border-white/30 hover:bg-white/20 hover:text-white">
              <Link href="/billing/new"><FilePlus2 className="w-4 h-4 mr-1.5" />New Bill</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* KPI grid (role-aware) */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {isCashier ? (
          <>
            <StatCard label="Revenue Today" value={inr(summary?.revenueToday)} icon={IndianRupee} tone="success" loading={loadingSummary} hint="Paid bills" />
            <StatCard label="Revenue This Month" value={inr(summary?.revenueMonth)} icon={TrendingUp} tone="primary" loading={loadingSummary} hint="Month to date" />
            <StatCard label="Pending Bills" value={pendingBillsCount} icon={IndianRupee} tone="warning" loading={loadingPendingBills} hint="Unpaid invoices" />
            <StatCard label="Today's Patients" value={summary?.todayAppointments} icon={Users} tone="info" loading={loadingSummary} />
          </>
        ) : (
          <>
            <StatCard label="Total Patients" value={summary?.totalPatients} icon={Users} tone="info" loading={loadingSummary} delta="+12% vs last month" trend="up" />
            <StatCard label="Today's Appointments" value={summary?.todayAppointments} icon={Calendar} tone="primary" loading={loadingSummary} />
            <StatCard
              label="Bed Occupancy"
              value={summary ? `${summary.occupiedBeds}/${summary.totalBeds}` : "–"}
              icon={BedDouble}
              tone="warning"
              loading={loadingSummary}
              hint={summary && summary.totalBeds > 0 ? `${Math.round((summary.occupiedBeds / summary.totalBeds) * 100)}% occupied` : undefined}
            />
            <StatCard label="Critical Alerts" value={summary?.criticalAlerts ?? 0} icon={AlertTriangle} tone="destructive" loading={loadingSummary} hint="Pending labs & meds" />
          </>
        )}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-card-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base font-semibold">Hospital Activity</CardTitle>
              <CardDescription>Patient registrations & revenue, last 7 days</CardDescription>
            </div>
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">Week</Badge>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {loadingCharts || !charts ? (
                <Skeleton className="w-full h-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={charts.patientTrend.map((p, i) => ({
                      label: p.label,
                      patients: p.value,
                      revenue: charts.revenueTrend[i]?.value ?? 0,
                    }))}
                    margin={{ top: 10, right: 4, left: -16, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--chart-3))" stopOpacity={0.40} />
                        <stop offset="100%" stopColor="hsl(var(--chart-3))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    <Area type="monotone" dataKey="patients" stroke="hsl(var(--chart-1))" strokeWidth={2.5} fill="url(#g1)" name="Patients" />
                    <Area type="monotone" dataKey="revenue" stroke="hsl(var(--chart-3))" strokeWidth={2.5} fill="url(#g2)" name="Revenue (₹)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-card-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Bed Occupancy</CardTitle>
            <CardDescription>Live ward status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] flex items-center justify-center">
              {loadingCharts || !charts ? (
                <Skeleton className="w-full h-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={charts.bedOccupancy}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={56}
                      outerRadius={88}
                      paddingAngle={3}
                      cornerRadius={6}
                    >
                      {charts.bedOccupancy.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            {charts && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                {charts.bedOccupancy.map((b, i) => (
                  <div key={b.name} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="capitalize text-muted-foreground">{b.name}</span>
                    <span className="ml-auto font-semibold tabular-nums">{b.value}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Department breakdown */}
        <Card className="border-card-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Appointments by Department</CardTitle>
            <CardDescription>Top loaded clinics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              {loadingCharts || !charts ? (
                <Skeleton className="w-full h-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.departmentBreakdown.slice(0, 6)} layout="vertical" margin={{ top: 0, right: 12, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={110} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                    <Bar dataKey="value" fill="hsl(var(--chart-1))" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quick queues */}
        <Card className="border-card-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Operational Queues</CardTitle>
            <CardDescription>Items needing action</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <QueueRow icon={Clock} tone="primary" label="OPD Queue" value={summary?.todayAppointments} href="/opd" loading={loadingSummary} />
            <QueueRow icon={TestTube} tone="info" label="Pending Labs" value={summary?.pendingLabOrders} href="/lab" loading={loadingSummary} />
            <QueueRow icon={Pill} tone="success" label="Pending Prescriptions" value={summary?.pendingPrescriptions} href="/pharmacy" loading={loadingSummary} />
            <QueueRow icon={IndianRupee} tone="warning" label="Today's Collections" value={summary ? inr(summary.revenueToday) : undefined} href="/billing" loading={loadingSummary} />
          </CardContent>
        </Card>

        {/* Activity feed */}
        <Card className="border-card-border shadow-sm flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-auto max-h-[420px] scrollbar-thin">
            {loadingActivity ? (
              <div className="p-4 space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {activity?.map((item) => (
                  <div key={item.id} className="px-4 py-3 flex gap-3 hover:bg-muted/40 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                      {item.type === "admission" ? <BedDouble className="w-4 h-4" /> :
                       item.type === "lab" ? <TestTube className="w-4 h-4" /> :
                       item.type === "appointment" ? <Calendar className="w-4 h-4" /> :
                       item.type === "bill_created" ? <IndianRupee className="w-4 h-4" /> :
                       <Activity className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">
                        {item.title}
                        {item.patientName && <span className="font-normal text-muted-foreground ml-1">· {item.patientName}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">{item.description}</div>
                      <div className="text-[10px] text-muted-foreground/70 mt-1 uppercase font-semibold tracking-wider">
                        {new Date(item.createdAt).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                ))}
                {!activity?.length && (
                  <div className="p-8 text-center text-muted-foreground text-sm">No recent activity</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Role-specific tip strip */}
      {(isDoctor || isNurse) && (
        <Card className="bg-accent border-accent-border">
          <CardContent className="p-4 flex items-center gap-3">
            <Stethoscope className="w-5 h-5 text-primary shrink-0" />
            <div className="text-sm flex-1">
              <span className="font-semibold text-primary">Tip:</span>
              <span className="text-foreground/80 ml-1">Press <kbd className="font-mono text-xs bg-card border px-1.5 py-0.5 rounded">⌘K</kbd> to jump to any patient, encounter, or module instantly.</span>
            </div>
            <Button asChild variant="ghost" size="sm" className="text-primary">
              <Link href="/opd">Open OPD Queue <ArrowRight className="w-3.5 h-3.5 ml-1" /></Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function QueueRow({ icon: Icon, tone, label, value, href, loading }: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "primary" | "info" | "success" | "warning";
  label: string;
  value?: React.ReactNode;
  href: string;
  loading?: boolean;
}) {
  const tones = {
    primary: "bg-primary/10 text-primary",
    info: "bg-info/10 text-info",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
  };
  return (
    <Link href={href} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/60 transition group">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${tones[tone]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground truncate">{label}</div>
      </div>
      <div className="font-bold text-foreground tabular-nums">
        {loading ? <Skeleton className="h-5 w-12" /> : value ?? 0}
      </div>
      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition" />
    </Link>
  );
}

function useGreeting() {
  const h = new Date().getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Working late";
}
