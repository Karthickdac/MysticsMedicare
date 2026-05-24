import { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from "wouter";
import { useGetEncounter, useUpdateEncounter, useCreateVideo, useRequestUploadUrl, useListVideos } from "@workspace/api-client-react";
import { getGetEncounterQueryKey, getListVideosQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Video, Disc, StopCircle, PlayCircle, Save, X, Mic } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function EncounterDetail() {
  const { id } = useParams<{ id: string }>();
  const encounterId = Number(id);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: encounter, isLoading: isLoadingEncounter } = useGetEncounter(encounterId, {
    query: { enabled: !!encounterId, queryKey: getGetEncounterQueryKey(encounterId) }
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
        }
      }
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
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
      }
    } catch (err) {
      toast({ title: "Camera access denied", variant: "destructive" });
    }
  };

  const startRecording = () => {
    if (!mediaStream) return;
    chunksRef.current = [];
    const recorder = new MediaRecorder(mediaStream, { mimeType: "video/webm" });
    
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    
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
        mediaStream.getTracks().forEach(track => track.stop());
        setMediaStream(null);
      }
    }
  };

  const saveVideo = async () => {
    if (!recordedBlob || !encounter) return;
    setIsUploading(true);
    try {
      // 1. Get upload URL
      const { uploadURL, objectPath } = await requestUploadUrl.mutateAsync({
        data: {
          name: `encounter_${encounter.id}_${Date.now()}.webm`,
          size: recordedBlob.size,
          contentType: "video/webm"
        }
      });

      // 2. Upload to GCS
      const res = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": "video/webm" },
        body: recordedBlob
      });

      if (!res.ok) throw new Error("Upload failed");

      // 3. Save metadata
      await createVideo.mutateAsync({
        data: {
          patientId: encounter.patientId,
          encounterId: encounter.id,
          encounterType: encounter.type,
          title: videoTitle || "Encounter Recording",
          mimeType: "video/webm",
          durationSeconds: 0, // In real app, calculate from Blob
          fileSize: recordedBlob.size,
          fileUrl: `/api/storage${objectPath}`
        }
      });

      toast({ title: "Video saved successfully" });
      queryClient.invalidateQueries({ queryKey: getListVideosQueryKey() });
      resetRecorder();
    } catch (err: any) {
      toast({ title: "Error saving video", description: err.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const resetRecorder = () => {
    setRecordedBlob(null);
    setVideoTitle("");
    if (videoPreviewRef.current) {
      videoPreviewRef.current.src = "";
      videoPreviewRef.current.controls = false;
    }
  };

  if (isLoadingEncounter) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
  if (!encounter) return <div className="p-6">Encounter not found</div>;

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            Encounter Details
            <Badge variant="outline" className="ml-2 uppercase">{encounter.status}</Badge>
          </h1>
          <p className="text-muted-foreground">{encounter.patientName} • Dr. {encounter.doctorName} • {new Date(encounter.startedAt).toLocaleString()}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Column: Notes */}
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
                <Input 
                  value={diagnosis} 
                  onChange={(e) => setDiagnosis(e.target.value)} 
                  placeholder="Enter diagnosis..."
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Notes / Plan</label>
                <Textarea 
                  value={notes} 
                  onChange={(e) => setNotes(e.target.value)} 
                  placeholder="Enter clinical notes..."
                  className="min-h-[200px]"
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSaveNotes} disabled={updateEncounter.isPending}>
                  <Save className="w-4 h-4 mr-2" /> Save Notes
                </Button>
              </div>
            </CardContent>
          </Card>
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
                <video 
                  ref={videoPreviewRef} 
                  autoPlay 
                  muted={!recordedBlob} 
                  className="w-full h-full object-cover"
                />
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
                    <Input 
                      placeholder="Video Title (e.g., Gait Assessment)" 
                      value={videoTitle}
                      onChange={(e) => setVideoTitle(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button onClick={resetRecorder} variant="outline" className="flex-1">
                        <X className="w-4 h-4 mr-2" /> Discard
                      </Button>
                      <Button onClick={saveVideo} disabled={isUploading} className="flex-1">
                        {isUploading ? "Uploading..." : "Save to Record"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Past Videos */}
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
                  {videos.map(v => (
                    <div key={v.id} className="flex gap-3 items-center p-2 rounded-md hover:bg-muted/50 cursor-pointer border border-transparent hover:border-border transition-colors" onClick={() => setActiveVideoUrl(v.fileUrl)}>
                      <div className="w-16 h-12 bg-black rounded shrink-0 flex items-center justify-center relative">
                        {v.thumbnailUrl ? <img src={v.thumbnailUrl} className="w-full h-full object-cover rounded" alt="" /> : <Video className="w-4 h-4 text-white/50" />}
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
          {activeVideoUrl && (
            <video 
              src={activeVideoUrl} 
              controls 
              autoPlay 
              className="w-full h-auto max-h-[80vh]"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
