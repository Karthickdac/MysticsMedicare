import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, Link } from "wouter";
import {
  useGetEncounter, useUpdateEncounter, useCreateVideo, useRequestUploadUrl, useListVideos,
  useListVitals, useRecordVitals,
  getGetEncounterQueryKey, getListVideosQueryKey, getListVitalsQueryKey,
  type VitalInput,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Video, Disc, StopCircle, PlayCircle, Save, X, Activity, Pill, CalendarPlus, HeartPulse } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function EncounterDetail() {
  const { id } = useParams<{ id: string }>();
  const encounterId = Number(id);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: encounter, isLoading: isLoadingEncounter } = useGetEncounter(encounterId, {
    query: { enabled: !!encounterId, queryKey: getGetEncounterQueryKey(encounterId) },
  });

  const { data: videos, isLoading: isLoadingVideos } = useListVideos({ encounterId });
  const updateEncounter = useUpdateEncounter();

  const [notes, setNotes] = useState("");
  const [diagnosis, setDiagnosis] = useState("");

  useEffect(() => {
    if (encounter) {
      setNotes(encounter.notes || "");
      setDiagnosis(encounter.diagnosis || "");
    }
  }, [encounter]);

  const handleSaveNotes = () => {
    updateEncounter.mutate(
      { id: encounterId, data: { notes, diagnosis } },
      {
        onSuccess: () => {
          toast({ title: "Notes saved" });
          queryClient.invalidateQueries({ queryKey: getGetEncounterQueryKey(encounterId) });
        },
      },
    );
  };

  // Video Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [videoTitle, setVideoTitle] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);

  const requestUploadUrl = useRequestUploadUrl();
  const createVideo = useCreateVideo();

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setMediaStream(stream);
      if (videoPreviewRef.current) videoPreviewRef.current.srcObject = stream;
    } catch {
      toast({ title: "Camera access denied", variant: "destructive" });
    }
  };

  const startRecording = () => {
    if (!mediaStream) return;
    chunksRef.current = [];
    const recorder = new MediaRecorder(mediaStream, { mimeType: "video/webm" });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      setRecordedBlob(blob);
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = null;
        videoPreviewRef.current.src = URL.createObjectURL(blob);
        videoPreviewRef.current.controls = true;
      }
    };
    mediaRecorderRef.current = recorder;
    recorder.start();
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
        setMediaStream(null);
      }
    }
  };

  const saveVideo = async () => {
    if (!recordedBlob || !encounter) return;
    setIsUploading(true);
    try {
      const { uploadURL, objectPath } = await requestUploadUrl.mutateAsync({
        data: { name: `encounter_${encounter.id}_${Date.now()}.webm`, size: recordedBlob.size, contentType: "video/webm" },
      });
      const res = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": "video/webm" }, body: recordedBlob });
      if (!res.ok) throw new Error("Upload failed");
      await createVideo.mutateAsync({
        data: {
          patientId: encounter.patientId,
          encounterId: encounter.id,
          encounterType: encounter.type,
          title: videoTitle || "Encounter Recording",
          mimeType: "video/webm",
          durationSeconds: 0,
          fileSize: recordedBlob.size,
          fileUrl: `/api/storage${objectPath}`,
        },
      });
      toast({ title: "Video saved successfully" });
      queryClient.invalidateQueries({ queryKey: getListVideosQueryKey() });
      resetRecorder();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Save failed";
      toast({ title: "Error saving video", description: msg, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const resetRecorder = useCallback(() => {
    setRecordedBlob(null);
    setVideoTitle("");
    if (videoPreviewRef.current) {
      videoPreviewRef.current.src = "";
      videoPreviewRef.current.controls = false;
    }
  }, []);

  if (isLoadingEncounter) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
  if (!encounter) return <div className="p-6">Encounter not found</div>;

  // Build prefill query for the follow-up booking deep-link so the receptionist
  // lands on /appointments/new with patient/doctor/department already set.
  const followUpHref = `/appointments/new?${new URLSearchParams({
    patientId: String(encounter.patientId),
    doctorId: String(encounter.doctorId),
    reason: `Follow-up for ${diagnosis || encounter.chiefComplaint || "previous visit"}`,
    followUp: "1",
  }).toString()}`;
  const newPrescriptionHref = `/prescriptions?patientId=${encounter.patientId}&encounterId=${encounter.id}`;

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            Encounter Details
            <Badge variant="outline" className="ml-2 uppercase">{encounter.status}</Badge>
          </h1>
          <p className="text-muted-foreground">
            {encounter.patientName} • Dr. {encounter.doctorName} • {new Date(encounter.startedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={newPrescriptionHref}><Pill className="w-4 h-4 mr-2" /> New Prescription</Link>
          </Button>
          <Button asChild className="bg-brand-gradient text-white">
            <Link href={followUpHref}><CalendarPlus className="w-4 h-4 mr-2" /> Schedule follow-up</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Column: Notes + Vitals */}
        <div className="xl:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Clinical Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block text-muted-foreground">Chief Complaint</label>
                <div className="p-3 bg-muted/30 rounded-md border border-border text-sm">
                  {encounter.chiefComplaint || "Not specified"}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Diagnosis</label>
                <Input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="Enter diagnosis…" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Notes / Plan</label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Enter clinical notes…" className="min-h-[200px]" />
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSaveNotes} disabled={updateEncounter.isPending}>
                  <Save className="w-4 h-4 mr-2" /> Save Notes
                </Button>
              </div>
            </CardContent>
          </Card>

          <VitalsCard patientId={encounter.patientId} />
        </div>

        {/* Right Column: Video */}
        <div className="space-y-6">
          <Card className="border-primary/20 shadow-sm overflow-hidden">
            <CardHeader className="bg-primary/5 pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Video className="w-5 h-5 text-primary" /> Record Examination
              </CardTitle>
              <CardDescription>Capture patient interaction securely</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="bg-black aspect-video relative">
                <video ref={videoPreviewRef} autoPlay muted={!recordedBlob} className="w-full h-full object-cover" />
                {!mediaStream && !recordedBlob && (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/50">
                    <Video className="w-12 h-12" />
                  </div>
                )}
                {isRecording && (
                  <div className="absolute top-4 right-4 flex items-center gap-2 bg-black/60 px-3 py-1 rounded-full">
                    <div className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse" />
                    <span className="text-xs font-mono text-white">REC</span>
                  </div>
                )}
              </div>

              <div className="p-4 space-y-4 bg-card">
                {!mediaStream && !recordedBlob && (
                  <Button onClick={startCamera} className="w-full" variant="outline">
                    <Video className="w-4 h-4 mr-2" /> Enable Camera
                  </Button>
                )}
                {mediaStream && !isRecording && !recordedBlob && (
                  <Button onClick={startRecording} className="w-full bg-destructive hover:bg-destructive/90 text-white">
                    <Disc className="w-4 h-4 mr-2" /> Start Recording
                  </Button>
                )}
                {isRecording && (
                  <Button onClick={stopRecording} className="w-full" variant="secondary">
                    <StopCircle className="w-4 h-4 mr-2" /> Stop Recording
                  </Button>
                )}
                {recordedBlob && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                    <Input placeholder="Video Title (e.g., Gait Assessment)" value={videoTitle} onChange={(e) => setVideoTitle(e.target.value)} />
                    <div className="flex gap-2">
                      <Button onClick={resetRecorder} variant="outline" className="flex-1">
                        <X className="w-4 h-4 mr-2" /> Discard
                      </Button>
                      <Button onClick={saveVideo} disabled={isUploading} className="flex-1">
                        {isUploading ? "Uploading…" : "Save to Record"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Encounter Media</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingVideos ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : videos && videos.length > 0 ? (
                <div className="space-y-3">
                  {videos.map((v) => (
                    <div
                      key={v.id}
                      className="flex gap-3 items-center p-2 rounded-md hover:bg-muted/50 cursor-pointer border border-transparent hover:border-border transition-colors"
                      onClick={() => setActiveVideoUrl(v.fileUrl)}
                    >
                      <div className="w-16 h-12 bg-black rounded shrink-0 flex items-center justify-center relative">
                        {v.thumbnailUrl ? (
                          <img src={v.thumbnailUrl} className="w-full h-full object-cover rounded" alt="" />
                        ) : (
                          <Video className="w-4 h-4 text-white/50" />
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <PlayCircle className="w-5 h-5 text-white/80" />
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{v.title || "Untitled"}</p>
                        <p className="text-xs text-muted-foreground">{new Date(v.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md">No videos recorded</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!activeVideoUrl} onOpenChange={(open) => !open && setActiveVideoUrl(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black border-none">
          <DialogTitle className="sr-only">Video Player</DialogTitle>
          <DialogHeader className="sr-only">Video playback</DialogHeader>
          {activeVideoUrl && <video src={activeVideoUrl} controls autoPlay className="w-full h-auto max-h-[80vh]" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Vitals capture + recent history. Records save to /vitals (patient-scoped),
// not the encounter, so the timeline reflects every visit's measurements.
function VitalsCard({ patientId }: { patientId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: vitals, isLoading } = useListVitals({ patientId });
  const record = useRecordVitals();

  const [bp, setBp] = useState("");
  const [pulse, setPulse] = useState("");
  const [temperature, setTemperature] = useState("");
  const [spo2, setSpo2] = useState("");
  const [weight, setWeight] = useState("");

  const submit = () => {
    const payload: VitalInput = {
      patientId,
      ...(bp ? { bp } : {}),
      ...(pulse ? { pulse: Number(pulse) } : {}),
      ...(temperature ? { temperature: Number(temperature) } : {}),
      ...(spo2 ? { spo2: Number(spo2) } : {}),
      ...(weight ? { weight: Number(weight) } : {}),
    };
    record.mutate(
      { data: payload },
      {
        onSuccess: () => {
          toast({ title: "Vitals recorded" });
          queryClient.invalidateQueries({ queryKey: getListVitalsQueryKey({ patientId }) });
          setBp(""); setPulse(""); setTemperature(""); setSpo2(""); setWeight("");
        },
        onError: (e: unknown) => {
          const msg = e instanceof Error ? e.message : "Save failed";
          toast({ title: "Could not save vitals", description: msg, variant: "destructive" });
        },
      },
    );
  };

  const recent = (vitals ?? []).slice(0, 5);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <HeartPulse className="w-4 h-4 text-primary" /> Vitals
        </CardTitle>
        <CardDescription>Record measurements and review the latest readings.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <VInput label="BP" value={bp} onChange={setBp} placeholder="120/80" />
          <VInput label="Pulse" value={pulse} onChange={setPulse} placeholder="bpm" type="number" />
          <VInput label="Temp °F" value={temperature} onChange={setTemperature} placeholder="98.6" type="number" step="0.1" />
          <VInput label="SpO₂ %" value={spo2} onChange={setSpo2} placeholder="98" type="number" />
          <VInput label="Weight kg" value={weight} onChange={setWeight} placeholder="65" type="number" step="0.1" />
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={submit} disabled={record.isPending}>
            <Activity className="w-3.5 h-3.5 mr-1" /> {record.isPending ? "Saving…" : "Record vitals"}
          </Button>
        </div>

        <div className="pt-3 border-t border-border">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase mb-2">Recent</p>
          {isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : recent.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-md">No vitals recorded yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-1.5 pr-3">When</th>
                    <th className="py-1.5 pr-3">BP</th>
                    <th className="py-1.5 pr-3">Pulse</th>
                    <th className="py-1.5 pr-3">Temp</th>
                    <th className="py-1.5 pr-3">SpO₂</th>
                    <th className="py-1.5 pr-3">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((v) => (
                    <tr key={v.id} className="border-t border-border">
                      <td className="py-1.5 pr-3 text-muted-foreground">
                        {new Date(v.recordedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="py-1.5 pr-3">{v.bp ?? "—"}</td>
                      <td className="py-1.5 pr-3">{v.pulse ?? "—"}</td>
                      <td className="py-1.5 pr-3">{v.temperature ?? "—"}</td>
                      <td className="py-1.5 pr-3">{v.spo2 ?? "—"}</td>
                      <td className="py-1.5 pr-3">{v.weight ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function VInput({
  label, value, onChange, placeholder, type = "text", step,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; step?: string }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} type={type} step={step} className="h-9" />
    </div>
  );
}
