import React, { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Columns3, Download, Rows3, Rows4 } from "lucide-react";
import { EmptyState } from "./empty-state";

export type Column<T> = {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  className?: string;
  headerClassName?: string;
  align?: "left" | "right" | "center";
  hidden?: boolean;
};

export type DataTableProps<T> = {
  columns: Column<T>[];
  data: T[] | undefined;
  loading?: boolean;
  rowKey: (row: T) => string | number;
  empty?: React.ReactNode;
  toolbar?: React.ReactNode;
  caption?: React.ReactNode;
  onRowClick?: (row: T) => void;
  pageSize?: number;
  csvName?: string;
  exportable?: boolean;
  className?: string;
};

function toCsv<T>(rows: T[], cols: Column<T>[]): string {
  const header = cols.map((c) => '"' + String(c.header ?? c.key).replace(/"/g, '""') + '"').join(",");
  const lines = rows.map((r) =>
    cols
      .map((c) => {
        const v = c.cell(r);
        const flat = typeof v === "string" || typeof v === "number" ? String(v) : "";
        return '"' + flat.replace(/"/g, '""') + '"';
      })
      .join(","),
  );
  return [header, ...lines].join("\n");
}

export function DataTable<T>({
  columns,
  data,
  loading,
  rowKey,
  empty,
  toolbar,
  caption,
  onRowClick,
  pageSize,
  csvName = "export.csv",
  exportable = false,
  className = "",
}: DataTableProps<T>) {
  const [hidden, setHidden] = useState<Record<string, boolean>>(
    Object.fromEntries(columns.filter((c) => c.hidden).map((c) => [c.key, true])),
  );
  const [dense, setDense] = useState(false);
  const [page, setPage] = useState(0);

  const visibleCols = useMemo(() => columns.filter((c) => !hidden[c.key]), [columns, hidden]);
  const paged = useMemo(() => {
    if (!data) return undefined;
    if (!pageSize) return data;
    return data.slice(page * pageSize, page * pageSize + pageSize);
  }, [data, page, pageSize]);
  const totalPages = data && pageSize ? Math.max(1, Math.ceil(data.length / pageSize)) : 1;

  function exportCsv() {
    if (!data) return;
    const csv = toCsv(data, visibleCols);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = csvName;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={`bg-card border border-card-border rounded-xl shadow-sm overflow-hidden ${className}`}>
      {(toolbar || exportable) && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/30">
          <div className="text-sm text-muted-foreground">{toolbar}</div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setDense((d) => !d)} title="Density">
              {dense ? <Rows4 className="w-4 h-4" /> : <Rows3 className="w-4 h-4" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" title="Columns">
                  <Columns3 className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {columns.map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.key}
                    checked={!hidden[c.key]}
                    onCheckedChange={(v) => setHidden((h) => ({ ...h, [c.key]: !v }))}
                  >
                    {typeof c.header === "string" ? c.header : c.key}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {exportable && (
              <Button variant="ghost" size="sm" onClick={exportCsv} disabled={!data?.length} title="Export CSV">
                <Download className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      )}
      <div className="overflow-x-auto scrollbar-thin">
        <Table>
          {caption}
          <TableHeader className="sticky top-0 bg-card/95 backdrop-blur z-10">
            <TableRow className="hover:bg-transparent border-b border-border">
              {visibleCols.map((c) => (
                <TableHead
                  key={c.key}
                  className={`text-[11px] font-semibold uppercase tracking-wider text-muted-foreground ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""} ${c.headerClassName ?? ""}`}
                >
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {visibleCols.map((c) => (
                    <TableCell key={c.key} className={dense ? "py-2" : ""}>
                      <Skeleton className="h-4 w-full max-w-[180px]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : !paged || paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleCols.length} className="p-0">
                  {empty ?? <EmptyState title="No results" description="No records match the current filters." />}
                </TableCell>
              </TableRow>
            ) : (
              paged.map((row) => (
                <TableRow
                  key={rowKey(row)}
                  className={`group transition-colors ${onRowClick ? "cursor-pointer" : ""}`}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {visibleCols.map((c) => (
                    <TableCell
                      key={c.key}
                      className={`${dense ? "py-2" : "py-3"} ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""} ${c.className ?? ""}`}
                    >
                      {c.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {pageSize && data && data.length > pageSize && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border bg-muted/30 text-sm">
          <div className="text-muted-foreground text-xs">
            Page {page + 1} of {totalPages} · {data.length} records
          </div>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
