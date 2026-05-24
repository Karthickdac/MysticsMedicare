import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";

export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  children,
  onClear,
  hasFilters,
  right,
}: {
  search?: string;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;
  children?: React.ReactNode;
  onClear?: () => void;
  hasFilters?: boolean;
  right?: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-card-border rounded-xl p-3 flex flex-col md:flex-row md:items-center gap-3 shadow-sm">
      {onSearchChange && (
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={search ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-9 bg-background border-input"
          />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      <div className="flex items-center gap-2 md:ml-auto">
        {hasFilters && onClear && (
          <Button variant="ghost" size="sm" onClick={onClear} className="h-9">
            <X className="w-3.5 h-3.5 mr-1" /> Clear
          </Button>
        )}
        {right}
      </div>
    </div>
  );
}
