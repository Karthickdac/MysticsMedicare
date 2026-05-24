import React from "react";
import { Inbox } from "lucide-react";

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className = "",
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-12 px-6 ${className}`}>
      <div className="w-14 h-14 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center mb-4 ring-1 ring-border">
        <Icon className="w-6 h-6" />
      </div>
      <div className="text-base font-semibold text-foreground">{title}</div>
      {description && <div className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", description, retry }: { title?: React.ReactNode; description?: React.ReactNode; retry?: () => void }) {
  return (
    <EmptyState
      title={title}
      description={description}
      action={retry ? (
        <button onClick={retry} className="text-sm font-medium text-primary hover:underline">Try again</button>
      ) : undefined}
    />
  );
}
