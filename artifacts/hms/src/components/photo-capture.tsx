import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Upload, RotateCcw, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRequestUploadUrl } from "@workspace/api-client-react";

type Props = {
  value: string | null;
  onChange: (url: string | null) => void;
};

export function PhotoCapture({ value, onChange }: Props) {
  const [mode, setMode] = useState<"idle" | "camera" | "preview">(value ? "preview" : "idle");
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const requestUpload = useRequestUploadUrl();

  useEffect(() => () => stopCamera(), []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function startCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 640 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setMode("camera");
    } catch (e) {
      const msg = (e as Error).message || "Camera unavailable";
      setError(`${msg}. Use file upload instead.`);
    }
  }

  function snap() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const size = Math.min(video.videoWidth, video.videoHeight);
    canvas.width = 480;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const sx = (video.videoWidth - size) / 2;
    const sy = (video.videoHeight - size) / 2;
    ctx.drawImage(video, sx, sy, size, size, 0, 0, 480, 480);
    canvas.toBlob((blob) => {
      if (!blob) return;
      stopCamera();
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
      setPreviewBlob(blob);
      setPreviewDataUrl(dataUrl);
      setMode("preview");
    }, "image/jpeg", 0.9);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5 MB");
      return;
    }
    setPreviewBlob(file);
    const reader = new FileReader();
    reader.onload = () => {
      setPreviewDataUrl(reader.result as string);
      setMode("preview");
    };
    reader.readAsDataURL(file);
  }

  function retake() {
    setPreviewBlob(null);
    setPreviewDataUrl(null);
    onChange(null);
    setMode("idle");
  }

  async function upload() {
    if (!previewBlob) return;
    setUploading(true);
    setError(null);
    try {
      const { uploadURL, objectPath } = await requestUpload.mutateAsync({
        data: { name: `patient-photo-${Date.now()}.jpg`, size: previewBlob.size, contentType: "image/jpeg" },
      });
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: previewBlob,
      });
      if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`);
      const finRes = await fetch("/storage/uploads/finalize", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectPath, visibility: "public" }),
      });
      if (!finRes.ok) throw new Error("Failed to finalize upload");
      // objectPath is like "/objects/<uuid>"; route mounts at /storage/objects/*
      const url = `/storage${objectPath}`;
      onChange(url);
      toast({ title: "Photo saved" });
    } catch (e) {
      const msg = (e as Error).message || "Upload failed";
      setError(msg);
      toast({ title: "Upload failed", description: msg, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative w-48 h-48 rounded-lg border-2 border-dashed border-border bg-muted/30 overflow-hidden flex items-center justify-center">
        {mode === "camera" && (
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
        )}
        {mode === "preview" && (previewDataUrl || value) && (
          <img src={previewDataUrl ?? value!} alt="Patient" className="w-full h-full object-cover" />
        )}
        {mode === "idle" && (
          <div className="text-center text-muted-foreground p-4">
            <Camera className="w-10 h-10 mx-auto opacity-50" />
            <div className="text-xs mt-2">No photo</div>
          </div>
        )}
        {value && !uploading && (
          <span className="absolute top-1 right-1 text-[10px] bg-success text-success-foreground px-1.5 py-0.5 rounded">Saved</span>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {error && <div className="text-xs text-destructive">{error}</div>}

      <div className="flex flex-wrap gap-2">
        {mode === "idle" && (
          <>
            <Button type="button" size="sm" variant="outline" onClick={startCamera} data-testid="button-photo-camera">
              <Camera className="w-4 h-4 mr-1" />Webcam
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()} data-testid="button-photo-upload">
              <Upload className="w-4 h-4 mr-1" />Upload
            </Button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
          </>
        )}
        {mode === "camera" && (
          <>
            <Button type="button" size="sm" onClick={snap} data-testid="button-photo-snap">
              <Camera className="w-4 h-4 mr-1" />Capture
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { stopCamera(); setMode("idle"); }}>
              <X className="w-4 h-4 mr-1" />Cancel
            </Button>
          </>
        )}
        {mode === "preview" && (
          <>
            {!value && (
              <Button type="button" size="sm" onClick={upload} disabled={uploading} data-testid="button-photo-save">
                {uploading ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Uploading…</> : <>Save photo</>}
              </Button>
            )}
            <Button type="button" size="sm" variant="ghost" onClick={retake} disabled={uploading}>
              <RotateCcw className="w-4 h-4 mr-1" />Retake
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
