import { useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAdmission,
  useListWardRounds,
  useCreateWardRound,
  useListNursingNotes,
  useCreateNursingNote,
  useListMar,
  useRecordMarDose,
  useDischargeAdmission,
  useMe,
  getGetAdmissionQueryKey,
  getListWardRoundsQueryKey,
  getListNursingNotesQueryKey,
  getListMarQueryKey,
  getListAdmissionsQueryKey,
  getListBedsQueryKey,
  getGetIpdCensusQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { FileText, Stethoscope, ClipboardList, Pill, LogOut, MessageCircle } from "lucide-react";

const CAN_DISCHARGE = new Set(["admin", "doctor"]);
const CAN_ROUND = new Set(["admin", "doctor"]);
const CAN_NURSE = new Set(["admin", "doctor", "nurse"]);

function fmt(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN");
}

export default function IpdAdmission() {
  const [, params] = useRoute<{ id: string }>("/ipd/admissions/:id");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useMe();
  const role = me?.role ?? "";
  const id = Number(params?.id);

  const { data: adm, isLoading } = useGetAdmission(id, {
    query: { enabled: !!id, queryKey: getGetAdmissionQueryKey(id) },
  });
  const { data: rounds } = useListWardRounds(id, {
    query: { enabled: !!id, queryKey: getListWardRoundsQueryKey(id) },
  });
  const { data: notes } = useListNursingNotes(id, {
    query: { enabled: !!id, queryKey: getListNursingNotesQueryKey(id) },
  });
  const { data: mar } = useListMar(id, {
    query: { enabled: !!id, queryKey: getListMarQueryKey(id) },
  });

  const createRound = useCreateWardRound();
  const createNote = useCreateNursingNote();
  const recordDose = useRecordMarDose();
  const discharge = useDischargeAdmission();

  const [roundText, setRoundText] = useState("");
  const [noteText, setNoteText] = useState("");
  const [noteCategory, setNoteCategory] = useState("general");
  const [dischargeOpen, setDischargeOpen] = useState(false);
  const [summary, setSummary] = useState("");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetAdmissionQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: getListWardRoundsQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: getListNursingNotesQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: getListMarQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: getListAdmissionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListBedsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetIpdCensusQueryKey() });
  };

  if (isLoading || !adm) {
    return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
  }

  const isDischarged = adm.status === "discharged";
  const losHours = adm.admittedAt
    ? (((isDischarged && adm.dischargedAt ? new Date(adm.dischargedAt).getTime() : Date.now()) - new Date(adm.admittedAt).getTime()) / 3600000)
    : 0;

  const submitRound = async () => {
    if (!roundText.trim()) return;
    try {
      await createRound.mutateAsync({ id, data: { note: roundText } });
      setRoundText("");
      toast({ title: "Round entry added" });
      invalidate();
    } catch (err) {
      toast({ title: "Failed", description: (err as Error).message, variant: "destructive" });
    }
  };

  const submitNote = async () => {
    if (!noteText.trim()) return;
    try {
      await createNote.mutateAsync({ id, data: { note: noteText, category: noteCategory } });
      setNoteText("");
      toast({ title: "Nursing note saved" });
      invalidate();
    } catch (err) {
      toast({ title: "Failed", description: (err as Error).message, variant: "destructive" });
    }
  };

  const recordMar = async (
    prescriptionId: number,
    scheduledAt: string,
    status: "given" | "held" | "refused",
  ) => {
    try {
      await recordDose.mutateAsync({ id, data: { prescriptionId, scheduledAt, status } });
      toast({ title: `Dose ${status}` });
      invalidate();
    } catch (err) {
      toast({ title: "Failed", description: (err as Error).message, variant: "destructive" });
    }
  };

  const submitDischarge = async () => {
    try {
      const result = await discharge.mutateAsync({ id, data: { summary } });
      setDischargeOpen(false);
      toast({
        title: "Patient discharged",
        description: "Bed released; summary ready",
      });
      invalidate();
      const url = (result as { summaryUrl?: string | null }).summaryUrl;
      if (url) window.open(url, "_blank");
    } catch (err) {
      toast({ title: "Discharge failed", description: (err as Error).message, variant: "destructive" });
    }
  };

  const whatsappUrl = (() => {
    const summaryLink = adm.encounterId
      ? `${window.location.origin}/api/pdf/discharge-summary/${adm.encounterId}`
      : "";
    const text = `Hello ${adm.patientName ?? ""}, your discharge summary from MediCare HMS is ready: ${summaryLink}`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  })();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Admission #{adm.id} ·{" "}
            <Link href={`/patients/${adm.patientId}`} className="text-primary hover:underline">
              {adm.patientName}
            </Link>
          </h1>
          <p className="text-muted-foreground text-sm">
            {adm.ward} · Bed {adm.bedCode ?? "—"} · Dr. {adm.doctorName} · Admitted {fmt(adm.admittedAt)}
          </p>
          <div className="flex gap-2 mt-2">
            <Badge variant={isDischarged ? "secondary" : "default"}>{adm.status}</Badge>
            <Badge variant="outline">LOS {losHours < 24 ? `${Math.round(losHours)}h` : `${(losHours / 24).toFixed(1)}d`}</Badge>
            <Badge variant="outline">Advance ₹ {adm.advanceAmount}</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          {adm.encounterId && (
            <Button variant="outline" asChild>
              <a href={`/api/pdf/discharge-summary/${adm.encounterId}`} target="_blank" rel="noreferrer">
                <FileText className="w-4 h-4 mr-2" />
                Discharge PDF
              </a>
            </Button>
          )}
          {isDischarged && (
            <Button variant="outline" asChild>
              <a href={whatsappUrl} target="_blank" rel="noreferrer">
                <MessageCircle className="w-4 h-4 mr-2" />
                WhatsApp summary
              </a>
            </Button>
          )}
          {!isDischarged && CAN_DISCHARGE.has(role) && (
            <Button onClick={() => { setSummary(adm.summary ?? ""); setDischargeOpen(true); }}>
              <LogOut className="w-4 h-4 mr-2" />
              Discharge
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="rounds">Ward Rounds</TabsTrigger>
          <TabsTrigger value="nursing">Nursing Notes</TabsTrigger>
          <TabsTrigger value="mar">MAR</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-3 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Reason for admission</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{adm.reason ?? "—"}</p>
            </CardContent>
          </Card>
          {adm.summary && (
            <Card>
              <CardHeader><CardTitle className="text-base">Discharge summary</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{adm.summary}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="rounds" className="space-y-3 pt-4">
          {!isDischarged && CAN_ROUND.has(role) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Stethoscope className="w-4 h-4" /> New ward round
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Textarea value={roundText} onChange={(e) => setRoundText(e.target.value)} placeholder="Findings, plan, orders…" rows={3} />
                <Button onClick={submitRound} disabled={createRound.isPending || !roundText.trim()}>
                  {createRound.isPending ? "Saving…" : "Add round"}
                </Button>
              </CardContent>
            </Card>
          )}
          <div className="space-y-2">
            {(rounds ?? []).map((r) => (
              <Card key={r.id}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">
                    {fmt(r.createdAt)} · {r.doctorName ?? r.signedBy ?? "—"}
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{r.note}</p>
                </CardContent>
              </Card>
            ))}
            {(!rounds || rounds.length === 0) && (
              <p className="text-sm text-muted-foreground">No rounds yet.</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="nursing" className="space-y-3 pt-4">
          {!isDischarged && CAN_NURSE.has(role) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="w-4 h-4" /> New nursing note
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex gap-2">
                  <div className="w-40">
                    <Label className="text-xs">Category</Label>
                    <Select value={noteCategory} onValueChange={setNoteCategory}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">General</SelectItem>
                        <SelectItem value="observation">Observation</SelectItem>
                        <SelectItem value="handover">Handover</SelectItem>
                        <SelectItem value="incident">Incident</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={3} placeholder="Observation, intervention, response…" />
                <Button onClick={submitNote} disabled={createNote.isPending || !noteText.trim()}>
                  {createNote.isPending ? "Saving…" : "Add note"}
                </Button>
              </CardContent>
            </Card>
          )}
          <div className="space-y-2">
            {(notes ?? []).map((n) => (
              <Card key={n.id}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">
                    {fmt(n.createdAt)} · {n.nurseName ?? "—"} · <Badge variant="outline">{n.category}</Badge>
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{n.note}</p>
                </CardContent>
              </Card>
            ))}
            {(!notes || notes.length === 0) && (
              <p className="text-sm text-muted-foreground">No nursing notes yet.</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="mar" className="space-y-3 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Pill className="w-4 h-4" /> Medication Administration Record (today)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(!mar || mar.length === 0) ? (
                <p className="text-sm text-muted-foreground">No active prescriptions for this admission.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                      <th className="py-2">Drug</th>
                      <th>Dose</th>
                      <th>Scheduled</th>
                      <th>Status</th>
                      <th>By</th>
                      {!isDischarged && CAN_NURSE.has(role) && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {mar.map((row, idx) => (
                      <tr key={`${row.prescriptionId}-${row.scheduledAt}-${idx}`} className="border-b">
                        <td className="py-2 font-medium">{row.drug}</td>
                        <td>{row.dosage}</td>
                        <td>{new Date(row.scheduledAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</td>
                        <td>
                          <Badge
                            variant={row.status === "given" ? "default" : row.status === "pending" ? "outline" : "secondary"}
                          >
                            {row.status}
                          </Badge>
                        </td>
                        <td className="text-xs text-muted-foreground">{row.administeredBy ?? "—"}</td>
                        {!isDischarged && CAN_NURSE.has(role) && (
                          <td>
                            {row.status === "pending" && (
                              <div className="flex gap-1">
                                <Button size="sm" variant="outline" onClick={() => recordMar(row.prescriptionId, row.scheduledAt, "given")}>Given</Button>
                                <Button size="sm" variant="outline" onClick={() => recordMar(row.prescriptionId, row.scheduledAt, "held")}>Hold</Button>
                                <Button size="sm" variant="outline" onClick={() => recordMar(row.prescriptionId, row.scheduledAt, "refused")}>Refused</Button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={dischargeOpen} onOpenChange={setDischargeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discharge patient</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Discharge summary</Label>
            <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={8} placeholder="Course in hospital, condition at discharge, medications, follow-up…" />
            <p className="text-xs text-muted-foreground">
              Bed will be released for cleaning. WhatsApp/SMS notification will be sent with the summary PDF link.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDischargeOpen(false)}>Cancel</Button>
            <Button onClick={submitDischarge} disabled={discharge.isPending}>
              {discharge.isPending ? "Discharging…" : "Confirm discharge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* unused but referenced via Input above to keep tsc happy */}
      <span className="hidden"><Input /></span>
    </div>
  );
}
