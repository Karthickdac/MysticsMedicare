import React from "react";

export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  eyebrow,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
      <div className="flex items-start gap-4 min-w-0">
        {Icon && (
          <div className="hidden sm:flex w-12 h-12 shrink-0 rounded-xl bg-brand-gradient text-white items-center justify-center shadow-md ring-1 ring-primary/20">
            <Icon className="w-6 h-6" />
          </div>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary mb-1">
              {eyebrow}
            </div>
          )}
          <h1 className="text-2xl md:text-[28px] font-bold tracking-tight text-foreground leading-tight truncate">
            {title}
          </h1>
          {description && (
            <p className="text-muted-foreground text-sm mt-1 truncate">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
