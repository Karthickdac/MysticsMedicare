import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDown, ArrowUp } from "lucide-react";

export function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  delta,
  tone = "primary",
  loading,
  hint,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  trend?: "up" | "down";
  delta?: React.ReactNode;
  tone?: "primary" | "success" | "warning" | "destructive" | "info";
  loading?: boolean;
  hint?: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    destructive: "bg-destructive/10 text-destructive",
    info: "bg-info/10 text-info",
  };
  const ring: Record<string, string> = {
    primary: "from-primary/10 to-transparent",
    success: "from-success/10 to-transparent",
    warning: "from-warning/10 to-transparent",
    destructive: "from-destructive/10 to-transparent",
    info: "from-info/10 to-transparent",
  };
  return (
    <div className="relative overflow-hidden rounded-xl border border-card-border bg-card shadow-sm">
      <div className={`absolute inset-x-0 top-0 h-20 bg-gradient-to-b ${ring[tone]} pointer-events-none`} />
      <div className="relative p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">{label}</div>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-3xl font-bold tracking-tight text-foreground">{value}</div>
            )}
            {(delta || hint) && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
                {trend === "up" && <ArrowUp className="w-3 h-3 text-success" />}
                {trend === "down" && <ArrowDown className="w-3 h-3 text-destructive" />}
                <span>{delta ?? hint}</span>
              </div>
            )}
          </div>
          {Icon && (
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${tones[tone]}`}>
              <Icon className="w-5 h-5" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
