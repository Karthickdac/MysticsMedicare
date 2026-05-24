import {
  useListPrescriptions, useListDrugs, useCreatePrescription, useListPatients,
  useDispensePrescription,
  getListPrescriptionsQueryKey, getGetPharmacyQueueQueryKey,
  type Prescription,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Check, ClipboardCheck, Plus, Printer } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";

// Lightweight, static drug-interaction table. Real systems would call an
// interaction service (e.g. First Databank, RxNorm DDI). Keys are lowercased
// active ingredient names; value lists ingredients that conflict + reason.
const INTERACTIONS: Record<string, { with: string; reason: string }[]> = {
  warfarin: [
    { with: "aspirin", reason: "Major bleeding risk" },
    { with: "ibuprofen", reason: "Increased anticoagulant effect" },
    { with: "amiodarone", reason: "Raises INR significantly" },
  ],
  aspirin: [
    { with: "warfarin", reason: "Major bleeding risk" },
    { with: "ibuprofen", reason: "Reduced cardioprotective effect" },
  ],
  metformin: [
    { with: "alcohol", reason: "Lactic acidosis risk" },
  ],
  ciprofloxacin: [
    { with: "warfarin", reason: "Potentiates anticoagulant effect" },
    { with: "theophylline", reason: "Increases theophylline toxicity" },
  ],
  amiodarone: [
    { with: "warfarin", reason: "Raises INR significantly" },
    { with: "simvastatin", reason: "Increased rhabdomyolysis risk" },
  ],
};

function checkInteractions(drug: string, otherDrugsForPatient: string[]) {
  const key = drug.toLowerCase().split(/\s+/)[0] ?? "";
  const entries = INTERACTIONS[key] ?? [];
  const conflicts: { with: string; reason: string }[] = [];
  for (const e of entries) {
    if (otherDrugsForPatient.some((d) => d.toLowerCase().includes(e.with))) {
      conflicts.push(e);
    }
  }
  return conflicts;
}

const formSchema = z.object({
  patientId: z.coerce.number().min(1, "Select patient"),
  encounterId: z.coerce.number().int().positive().optional(),
  drug: z.string().min(1, "Select drug"),
  dosage: z.string().min(1, "Dosage is required"),
  frequency: z.string().optional(),
  duration: z.string().optional(),
  instructions: z.string().optional(),
});

export default function Prescriptions() {
  const { data: prescriptions, isLoading } = useListPrescriptions({});
  const { data: drugs } = useListDrugs();
  const { data: patients } = useListPatients({});
  const [open, setOpen] = useState(false);
  const createMutation = useCreatePrescription();
  const dispenseMutation = useDispensePrescription();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<number | null>(null);

  // Prefill from query string so encounter-detail can deep-link
  // "?patientId=NN&encounterId=MM" and immediately open the dialog with the
  // encounter association preserved on save.
  const prefill = useMemo(() => {
    if (typeof window === "undefined") return { patientId: 0, encounterId: undefined as number | undefined };
    const q = new URLSearchParams(window.location.search);
    const enc = Number(q.get("encounterId") ?? "0");
    return {
      patientId: Number(q.get("patientId") ?? "0") || 0,
      encounterId: enc > 0 ? enc : undefined,
    };
  }, []);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      patientId: prefill.patientId,
      encounterId: prefill.encounterId,
      drug: "", dosage: "", frequency: "", duration: "", instructions: "",
    },
  });

  useEffect(() => {
    if (prefill.patientId) setOpen(true);
  }, [prefill.patientId]);

  const selectedPatientId = form.watch("patientId");
  const selectedDrug = form.watch("drug");
  // Cross-reference against the patient's active prescriptions for interaction
  // warnings. Dispensed prescriptions are excluded.
  const activeDrugsForPatient = useMemo(() => {
    if (!selectedPatientId) return [] as string[];
    return (prescriptions ?? [])
      .filter((p) => p.patientId === selectedPatientId && p.status !== "dispensed")
      .map((p) => p.drug);
  }, [prescriptions, selectedPatientId]);
  const interactionWarnings = useMemo(
    () => (selectedDrug ? checkInteractions(selectedDrug, activeDrugsForPatient) : []),
    [selectedDrug, activeDrugsForPatient],
  );

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    createMutation.mutate(
      { data },
      {
        onSuccess: () => {
          toast({ title: "Prescription added" });
          queryClient.invalidateQueries({ queryKey: getListPrescriptionsQueryKey() });
          setOpen(false);
          form.reset({ patientId: 0, encounterId: undefined, drug: "", dosage: "", frequency: "", duration: "", instructions: "" });
        },
      },
    );
  };

  const handleDispense = (p: Prescription) => {
    setBusyId(p.id);
    dispenseMutation.mutate(
      { id: p.id },
      {
        onSuccess: () => {
          toast({ title: `Dispensed ${p.drug}` });
          queryClient.invalidateQueries({ queryKey: getListPrescriptionsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetPharmacyQueueQueryKey() });
        },
        onError: (e: unknown) => {
          const msg = e instanceof Error ? e.message : "Dispense failed";
          toast({ title: "Could not dispense", description: msg, variant: "destructive" });
        },
        onSettled: () => setBusyId(null),
      },
    );
  };

  const printPrescription = (p: Prescription) => {
    const win = window.open("", "_blank", "width=720,height=900");
    if (!win) return;
    const safe = (s: string | null | undefined) => (s ?? "—").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] ?? c));
    win.document.write(`<!doctype html><html><head><title>Rx ${p.id}</title>
<style>
  body{font-family:ui-sans-serif,system-ui;margin:0;padding:32px;color:#111}
  h1{font-size:18px;margin:0 0 4px}
  .muted{color:#666;font-size:12px}
  .rx{font-size:64px;color:#5028ed;font-weight:700;line-height:1}
  table{width:100%;border-collapse:collapse;margin-top:18px}
  td{padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top}
  .label{color:#666;width:120px;text-transform:uppercase;font-size:11px;letter-spacing:.04em}
  .sig{margin-top:48px;border-top:1px solid #333;padding-top:6px;width:240px;text-align:center;font-size:12px;color:#555}
</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:flex-start">
  <div>
    <h1>Mystics MediCare Pro</h1>
    <div class="muted">Prescription · ID ${p.id} · ${new Date(p.createdAt).toLocaleString("en-IN")}</div>
  </div>
  <div class="rx">℞</div>
</div>
<table>
  <tr><td class="label">Patient</td><td>${safe(p.patientName)}</td></tr>
  <tr><td class="label">Prescribed by</td><td>${safe(p.prescribedBy)}</td></tr>
  <tr><td class="label">Drug</td><td><strong>${safe(p.drug)}</strong></td></tr>
  <tr><td class="label">Dosage</td><td>${safe(p.dosage)}</td></tr>
  <tr><td class="label">Frequency</td><td>${safe(p.frequency)}</td></tr>
  <tr><td class="label">Duration</td><td>${safe(p.duration)}</td></tr>
  <tr><td class="label">Instructions</td><td>${safe(p.instructions)}</td></tr>
</table>
<div class="sig">Doctor Signature</div>
<script>window.onload=()=>window.print()</script>
</body></html>`);
    win.document.close();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-primary" />
            Prescriptions
          </h1>
          <p className="text-muted-foreground">All prescription records.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> New Prescription</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add Prescription</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="patientId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Patient</FormLabel>
                      <Select onValueChange={(v) => field.onChange(Number(v))} value={field.value ? field.value.toString() : ""}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {patients?.map((p) => (
                            <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="drug"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Drug</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select drug" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {drugs?.map((d) => (
                            <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {interactionWarnings.length > 0 && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                    <div className="flex items-center gap-2 font-medium text-destructive mb-1">
                      <AlertTriangle className="w-4 h-4" /> Possible interaction
                    </div>
                    <ul className="text-xs text-destructive/90 space-y-0.5 list-disc list-inside">
                      {interactionWarnings.map((w, i) => (
                        <li key={i}>vs <span className="font-mono">{w.with}</span> — {w.reason}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="dosage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Dosage</FormLabel>
                        <FormControl><Input placeholder="e.g. 500mg" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="frequency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Frequency</FormLabel>
                        <FormControl><Input placeholder="e.g. 1-0-1" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="duration"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Duration</FormLabel>
                      <FormControl><Input placeholder="e.g. 5 days" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="instructions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Instructions</FormLabel>
                      <FormControl><Input placeholder="e.g. After meals" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={createMutation.isPending} className="w-full">
                  {createMutation.isPending ? "Adding…" : "Save Prescription"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Drug</TableHead>
                <TableHead>Dosage</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : prescriptions?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No prescriptions found</TableCell>
                </TableRow>
              ) : (
                prescriptions?.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{new Date(p.createdAt).toLocaleDateString("en-IN")}</TableCell>
                    <TableCell className="font-medium">{p.patientName}</TableCell>
                    <TableCell>{p.drug}</TableCell>
                    <TableCell>{p.dosage} - {p.frequency} ({p.duration})</TableCell>
                    <TableCell>
                      <Badge variant={p.status === "dispensed" ? "default" : "secondary"}>{p.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => printPrescription(p)} className="h-8 px-2">
                          <Printer className="w-4 h-4 mr-1" /> Print
                        </Button>
                        {p.status !== "dispensed" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDispense(p)}
                            disabled={busyId === p.id || dispenseMutation.isPending}
                            className="h-8 px-2"
                          >
                            <Check className="w-4 h-4 mr-1" /> Dispense
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
