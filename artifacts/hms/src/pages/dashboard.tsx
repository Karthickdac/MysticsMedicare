import { useGetDashboardSummary, useGetDashboardActivity, useGetDashboardCharts } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Calendar, BedDouble, TestTube, AlertTriangle, UserPlus, Clock, IndianRupee, Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();
  const { data: activity, isLoading: isLoadingActivity } = useGetDashboardActivity();
  const { data: charts, isLoading: isLoadingCharts } = useGetDashboardCharts();

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Command Center</h1>
          <p className="text-muted-foreground">Welcome back. Here's what's happening today.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" className="bg-background">
            <Link href="/patients/new">
              <UserPlus className="w-4 h-4 mr-2" />
              Register Patient
            </Link>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard 
          title="Total Patients" 
          value={summary?.totalPatients} 
          icon={Users} 
          isLoading={isLoadingSummary} 
          trend="+12% from last month"
          color="text-blue-500"
          bg="bg-blue-500/10"
        />
        <KpiCard 
          title="Today's Appointments" 
          value={summary?.todayAppointments} 
          icon={Calendar} 
          isLoading={isLoadingSummary} 
          color="text-primary"
          bg="bg-primary/10"
        />
        <KpiCard 
          title="Bed Occupancy" 
          value={summary ? `${summary.occupiedBeds} / ${summary.totalBeds}` : undefined} 
          icon={BedDouble} 
          isLoading={isLoadingSummary} 
          trend={summary && summary.totalBeds > 0 ? `${Math.round((summary.occupiedBeds / summary.totalBeds) * 100)}% occupied` : undefined}
          color="text-amber-500"
          bg="bg-amber-500/10"
        />
        <KpiCard 
          title="Critical Alerts" 
          value={summary?.criticalAlerts} 
          icon={AlertTriangle} 
          isLoading={isLoadingSummary} 
          color="text-destructive"
          bg="bg-destructive/10"
          alert={summary && summary.criticalAlerts > 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart Area */}
        <Card className="lg:col-span-2 shadow-sm border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="space-y-1">
              <CardTitle className="text-base font-semibold">Hospital Activity</CardTitle>
              <CardDescription>Patient inflow over the last 7 days</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingCharts ? (
              <div className="h-[300px] flex items-end gap-2 pt-4">
                {[40, 70, 45, 90, 65, 85, 100].map((h, i) => (
                  <Skeleton key={i} className="w-full rounded-t-sm" style={{ height: `${h}%` }} />
                ))}
              </div>
            ) : (
              <div className="h-[300px] flex items-end gap-2 pt-4">
                {charts?.patientTrend?.map((pt, i) => {
                  const max = Math.max(...charts.patientTrend.map(p => p.value));
                  const height = max > 0 ? (pt.value / max) * 100 : 0;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                      <div className="w-full relative flex-1 flex items-end rounded-t-md overflow-hidden bg-muted/50 hover:bg-muted transition-colors">
                        <div 
                          className="w-full bg-primary rounded-t-md transition-all duration-500" 
                          style={{ height: `${Math.max(5, height)}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground font-medium">{pt.label.substring(0, 3)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activity Feed */}
        <Card className="shadow-sm border-border flex flex-col">
          <CardHeader className="pb-3 border-b border-border">
            <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-auto">
            {isLoadingActivity ? (
              <div className="p-4 space-y-4">
                {[1, 2, 3, 4, 5].map(i => (
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
                  <div key={item.id} className="p-4 flex gap-3 hover:bg-muted/30 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                      {item.type === 'admission' ? <BedDouble className="w-4 h-4" /> :
                       item.type === 'lab' ? <TestTube className="w-4 h-4" /> :
                       item.type === 'appointment' ? <Calendar className="w-4 h-4" /> :
                       <Activity className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground">
                        {item.title}
                        {item.patientName && <span className="font-normal text-muted-foreground ml-1">· {item.patientName}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 truncate">{item.description}</div>
                      <div className="text-[10px] text-muted-foreground/70 mt-1.5 uppercase font-semibold tracking-wider">
                        {new Date(item.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </div>
                    </div>
                  </div>
                ))}
                {activity?.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground text-sm">
                    No recent activity
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
         <Card className="shadow-sm border-border bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center">
                <TestTube className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pending Labs</p>
                <div className="text-xl font-bold text-foreground">{isLoadingSummary ? <Skeleton className="w-10 h-6" /> : summary?.pendingLabOrders}</div>
              </div>
            </div>
            <Button variant="ghost" size="sm" asChild className="text-blue-600 hover:text-blue-700 hover:bg-blue-500/10">
              <Link href="/lab">View Queue</Link>
            </Button>
          </CardContent>
        </Card>
        
        <Card className="shadow-sm border-border bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pending Prescriptions</p>
                <div className="text-xl font-bold text-foreground">{isLoadingSummary ? <Skeleton className="w-10 h-6" /> : summary?.pendingPrescriptions}</div>
              </div>
            </div>
            <Button variant="ghost" size="sm" asChild className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10">
              <Link href="/pharmacy">View Queue</Link>
            </Button>
          </CardContent>
        </Card>
        
        <Card className="shadow-sm border-border bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-violet-500/10 text-violet-600 flex items-center justify-center">
                <IndianRupee className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Today's Revenue</p>
                <div className="text-xl font-bold text-foreground">
                  {isLoadingSummary ? <Skeleton className="w-20 h-6" /> : `₹${summary?.revenueToday?.toLocaleString('en-IN') || 0}`}
                </div>
              </div>
            </div>
            <Button variant="ghost" size="sm" asChild className="text-violet-600 hover:text-violet-700 hover:bg-violet-500/10">
              <Link href="/billing">View Bills</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ title, value, icon: Icon, isLoading, trend, color, bg, alert }: any) {
  return (
    <Card className={`shadow-sm border-border ${alert ? 'border-destructive/50 ring-1 ring-destructive/20' : ''}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <h3 className="text-3xl font-bold tracking-tight text-foreground">{value ?? 0}</h3>
            )}
          </div>
          <div className={`w-10 h-10 rounded-lg ${bg} ${color} flex items-center justify-center shrink-0`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
        {trend && !isLoading && (
          <div className="mt-3 flex items-center text-xs text-muted-foreground">
            {trend}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
