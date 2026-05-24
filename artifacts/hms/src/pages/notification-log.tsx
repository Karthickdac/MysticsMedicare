import { useListNotificationLog, useListNotificationEvents } from "@workspace/api-client-react";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Bell, MessageCircle, Phone, Filter, X } from "lucide-react";

type Filters = {
  patientId?: number;
  eventKey?: string;
  channel?: string;
  status?: string;
};

const PAGE_SIZE = 25;

export default function NotificationLog() {
  const [filters, setFilters] = useState<Filters>({});
  const [page, setPage] = useState(0);
  const { data: events } = useListNotificationEvents();

  const params = useMemo(() => {
    const p: Record<string, string | number> = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
    if (filters.patientId) p.patientId = filters.patientId;
    if (filters.eventKey) p.eventKey = filters.eventKey;
    if (filters.channel) p.channel = filters.channel;
    if (filters.status) p.status = filters.status;
    return p as any;
  }, [filters, page]);

  const { data: logs, isLoading, isFetching } = useListNotificationLog(params);

  function update<K extends keyof Filters>(k: K, v: Filters[K]) {
    setPage(0);
    setFilters((f) => ({ ...f, [k]: v }));
  }
  function clearAll() { setFilters({}); setPage(0); }
  const hasFilters = !!(filters.patientId || filters.eventKey || filters.channel || filters.status);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Bell className="w-6 h-6 text-primary" />
          Notification Log
        </h1>
        <p className="text-muted-foreground">History of all automated messages sent to patients.</p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Filter className="w-4 h-4" /> Filters
            {hasFilters && (
              <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={clearAll}>
                <X className="w-3 h-3 mr-1" /> Clear
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Patient ID</Label>
              <Input
                type="number"
                value={filters.patientId ?? ""}
                onChange={(e) => update("patientId", e.target.value ? Number(e.target.value) : undefined)}
                placeholder="e.g. 241"
              />
            </div>
            <div>
              <Label className="text-xs">Event</Label>
              <Select value={filters.eventKey ?? "__all__"} onValueChange={(v) => update("eventKey", v === "__all__" ? undefined : v)}>
                <SelectTrigger><SelectValue placeholder="All events" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All events</SelectItem>
                  {(events ?? []).map((e) => (
                    <SelectItem key={e.key} value={e.key}>{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Channel</Label>
              <Select value={filters.channel ?? "__all__"} onValueChange={(v) => update("channel", v === "__all__" ? undefined : v)}>
                <SelectTrigger><SelectValue placeholder="All channels" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All channels</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={filters.status ?? "__all__"} onValueChange={(v) => update("status", v === "__all__" ? undefined : v)}>
                <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All statuses</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sent At</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Message Preview</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
                  </TableRow>
                ))
              ) : !logs || logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No notifications found</TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {new Date(log.sentAt).toLocaleString('en-IN', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                      })}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{log.patientName || "-"}</div>
                      <div className="text-xs text-muted-foreground">{log.recipientPhone}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{log.eventKey}</TableCell>
                    <TableCell>
                      {log.channel === 'whatsapp' ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20"><MessageCircle className="w-3 h-3 mr-1" /> WhatsApp</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20"><Phone className="w-3 h-3 mr-1" /> SMS</Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-muted-foreground" title={log.renderedBody}>
                      {log.renderedBody}
                    </TableCell>
                    <TableCell>
                      <Badge variant={log.status === 'sent' ? 'default' : 'destructive'}>
                        {log.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm">
        <div className="text-muted-foreground">
          Page {page + 1} {isFetching && "(loading…)"}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!logs || logs.length < PAGE_SIZE}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
