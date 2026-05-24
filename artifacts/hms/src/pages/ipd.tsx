import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  useListBeds,
  useUpdateBedStatus,
  useTransferAdmission,
  useListAdmissions,
  useGetIpdCensus,
  useMe,
  getListBedsQueryKey,
  getListAdmissionsQueryKey,
  getGetIpdCensusQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { BedDouble, MoreVertical, Plus, UserPlus, ArrowRightLeft, Sparkles, Wrench } from "lucide-react";

// Mutate-bed roles match the API gate: status changes are ward/admin work,
// transfers can be initiated by clinicians.
const CAN_CHANGE_STATUS = new Set(["admin", "nurse"]);
const CAN_TRANSFER = new Set(["admin", "doctor", "nurse"]);
const CAN_ADMIT = new Set(["admin", "doctor", "receptionist"]);

const STATUS_CLASS: Record<string, string> = {
  available: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  occupied: "bg-blue-500/10 text-blue-700 border-blue-500/30",
  cleaning: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  maintenance: "bg-red-500/10 text-red-700 border-red-500/30",
};

export default function Ipd() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useMe();
  const role = me?.role ?? "";

  const { data: beds, isLoading } = useListBeds();
  const { data: admissions } = useListAdmissions({ status: "active" });
  const { data: census } = useGetIpdCensus();

  const updateStatus = useUpdateBedStatus();
  const transfer = useTransferAdmission();

  const [transferOpen, setTransferOpen] = useState(false);
  const [transferAdmissionId, setTransferAdmissionId] = useState<number | null>(null);
  const [transferToBedId, setTransferToBedId] = useState<string>("");
  const [transferReason, setTransferReason] = useState("");

  // Map of bedId → active admission so the menu can route to the patient page.
  const bedToAdm = useMemo(() => {
    const m = new Map<number, number>();
    for (const a of admissions ?? []) if (a.bedId) m.set(a.bedId, a.id);
    return m;
  }, [admissions]);

  const wardFilter = useMemo(() => Array.from(new Set((beds ?? []).map((b) => b.ward))).sort(), [beds]);
  const [wardSel, setWardSel] = useState<string>("all");

  const filtered = (beds ?? []).filter((b) => wardSel === "all" || b.ward === wardSel);
  const byWard = filtered.reduce<Record<string, typeof filtered>>((acc, b) => {
    (acc[b.ward] ??= []).push(b);
    return acc;
  }, {});

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListBedsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListAdmissionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetIpdCensusQueryKey() });
  };

  const changeStatus = async (bedId: number, status: "available" | "cleaning" | "maintenance") => {
    try {
      await updateStatus.mutateAsync({ id: bedId, data: { status } });
      toast({ title: "Bed updated", description: `Marked as ${status}` });
      invalidate();
    } catch (err) {
      toast({ title: "Update failed", description: (err as Error).message, variant: "destructive" });
    }
  };

  const openTransfer = (bedId: number) => {
    const admId = bedToAdm.get(bedId);
    if (!admId) {
      toast({ title: "No active admission on this bed", variant: "destructive" });
      return;
    }
    setTransferAdmissionId(admId);
    setTransferToBedId("");
    setTransferReason("");
    setTransferOpen(true);
  };

  const submitTransfer = async () => {
    if (!transferAdmissionId || !transferToBedId) return;
    try {
      await transfer.mutateAsync({
        id: transferAdmissionId,
        data: { toBedId: Number(transferToBedId), reason: transferReason || undefined },
      });
      toast({ title: "Patient transferred" });
      setTransferOpen(false);
      invalidate();
    } catch (err) {
      toast({ title: "Transfer failed", description: (err as Error).message, variant: "destructive" });
    }
  };

  const availableBeds = (beds ?? []).filter((b) => b.status === "available");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">IPD Bed Board</h1>
          <p className="text-muted-foreground">In-patient occupancy, admissions, transfers, and cleaning workflow.</p>
        </div>
        {CAN_ADMIT.has(role) && (
          <Button onClick={() => setLocation("/ipd/admit")}>
            <UserPlus className="w-4 h-4 mr-2" />
            New Admission
          </Button>
        )}
      </div>

      {/* Census KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { k: "Total beds", v: census?.totalBeds ?? "—" },
          { k: "Occupied", v: census?.occupied ?? "—" },
          { k: "Available", v: census?.available ?? "—" },
          { k: "Cleaning", v: census?.cleaning ?? "—" },
          {
            k: "Occupancy",
            v: census ? `${Math.round((census.occupancyRate ?? 0) * 100)}%` : "—",
          },
        ].map((c) => (
          <Card key={c.k}>
            <CardContent className="p-4">
              <p className="text-xs uppercase text-muted-foreground tracking-wider">{c.k}</p>
              <p className="text-2xl font-semibold mt-1">{c.v}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {census && (
        <p className="text-xs text-muted-foreground">
          {census.activeAdmissions} active admissions · avg LOS{" "}
          {census.avgLengthOfStayDays?.toFixed(1) ?? "—"} days
        </p>
      )}

      {/* Ward filter */}
      <div className="flex items-center gap-3">
        <Label className="text-sm">Ward</Label>
        <Select value={wardSel} onValueChange={setWardSel}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All wards</SelectItem>
            {wardFilter.map((w) => (
              <SelectItem key={w} value={w}>
                {w}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="space-y-8">
          {Object.entries(byWard).map(([ward, wardBeds]) => (
            <div key={ward}>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <BedDouble className="w-5 h-5 text-primary" />
                {ward}
                <Badge variant="outline" className="ml-2">
                  {wardBeds.filter((b) => b.status === "occupied").length}/{wardBeds.length}
                </Badge>
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                {wardBeds.map((bed) => {
                  const admId = bedToAdm.get(bed.id);
                  return (
                    <Card
                      key={bed.id}
                      className={`border ${STATUS_CLASS[bed.status] ?? ""} relative`}
                    >
                      <CardContent className="p-3 flex flex-col items-center text-center h-32 justify-center">
                        <span className="text-[10px] font-semibold absolute top-1.5 left-2 opacity-70">{bed.code}</span>
                        <div className="absolute top-1 right-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {admId && (
                                <DropdownMenuItem onSelect={() => setLocation(`/ipd/admissions/${admId}`)}>
                                  Open admission
                                </DropdownMenuItem>
                              )}
                              {admId && CAN_TRANSFER.has(role) && (
                                <DropdownMenuItem onSelect={() => openTransfer(bed.id)}>
                                  <ArrowRightLeft className="w-4 h-4 mr-2" />
                                  Transfer
                                </DropdownMenuItem>
                              )}
                              {bed.status === "available" && CAN_ADMIT.has(role) && (
                                <DropdownMenuItem onSelect={() => setLocation(`/ipd/admit?bedId=${bed.id}`)}>
                                  <Plus className="w-4 h-4 mr-2" />
                                  Admit patient
                                </DropdownMenuItem>
                              )}
                              {CAN_CHANGE_STATUS.has(role) && bed.status !== "occupied" && (
                                <>
                                  <DropdownMenuSeparator />
                                  {bed.status !== "available" && (
                                    <DropdownMenuItem onSelect={() => changeStatus(bed.id, "available")}>
                                      Mark available
                                    </DropdownMenuItem>
                                  )}
                                  {bed.status !== "cleaning" && (
                                    <DropdownMenuItem onSelect={() => changeStatus(bed.id, "cleaning")}>
                                      <Sparkles className="w-4 h-4 mr-2" />
                                      Mark cleaning
                                    </DropdownMenuItem>
                                  )}
                                  {bed.status !== "maintenance" && (
                                    <DropdownMenuItem onSelect={() => changeStatus(bed.id, "maintenance")}>
                                      <Wrench className="w-4 h-4 mr-2" />
                                      Mark maintenance
                                    </DropdownMenuItem>
                                  )}
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <BedDouble className="w-6 h-6 mb-1 opacity-80" />
                        {bed.patientName ? (
                          <>
                            <Link
                              href={admId ? `/ipd/admissions/${admId}` : "#"}
                              className="text-xs font-semibold truncate w-full hover:underline"
                            >
                              {bed.patientName}
                            </Link>
                            <p className="text-[10px] uppercase tracking-wider opacity-70 truncate w-full">
                              {bed.admittedAt && new Date(bed.admittedAt).toLocaleDateString("en-IN")}
                            </p>
                          </>
                        ) : (
                          <span className="text-[11px] font-semibold uppercase tracking-wider opacity-80">
                            {bed.status}
                          </span>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer patient</DialogTitle>
            <DialogDescription>Move the patient to another available bed. The current bed will be marked for cleaning.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Target bed</Label>
              <Select value={transferToBedId} onValueChange={setTransferToBedId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick available bed" />
                </SelectTrigger>
                <SelectContent>
                  {availableBeds.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.ward} · {b.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reason</Label>
              <Textarea value={transferReason} onChange={(e) => setTransferReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitTransfer} disabled={!transferToBedId || transfer.isPending}>
              {transfer.isPending ? "Transferring…" : "Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
