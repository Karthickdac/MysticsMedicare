import { useListVideos } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Video, PlayCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState } from "react";

export default function VideosLibrary() {
  const { data: videos, isLoading } = useListVideos({});
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Video className="w-6 h-6 text-primary" />
          Video Library
        </h1>
        <p className="text-muted-foreground">All recorded patient interactions and procedures.</p>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="aspect-video w-full rounded-none" />
              <CardContent className="p-3"><Skeleton className="h-4 w-3/4 mb-2" /><Skeleton className="h-3 w-1/2" /></CardContent>
            </Card>
          ))
        ) : videos?.length === 0 ? (
          <div className="col-span-full py-12 text-center text-muted-foreground border border-dashed rounded-lg">
            No video recordings found in the library.
          </div>
        ) : (
          videos?.map(v => (
            <Card key={v.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <div className="aspect-video bg-black flex items-center justify-center relative group cursor-pointer" onClick={() => setActiveVideoUrl(v.fileUrl)}>
                {v.thumbnailUrl ? (
                  <img src={v.thumbnailUrl} alt={v.title || 'Video thumbnail'} className="w-full h-full object-cover opacity-80 group-hover:opacity-60 transition-opacity" />
                ) : (
                  <Video className="w-12 h-12 text-muted-foreground/30" />
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <PlayCircle className="w-10 h-10 text-white shadow-sm transition-transform group-hover:scale-110" />
                </div>
                <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/80 rounded text-[10px] text-white font-mono z-10">
                  {Math.floor(v.durationSeconds / 60)}:{(v.durationSeconds % 60).toString().padStart(2, '0')}
                </div>
              </div>
              <CardContent className="p-3">
                <h3 className="font-semibold text-sm truncate" title={v.title || 'Untitled'}>{v.title || 'Untitled Recording'}</h3>
                <div className="flex justify-between items-center mt-1">
                  <p className="text-xs font-medium text-primary truncate pr-2">{v.patientName}</p>
                  <p className="text-[10px] text-muted-foreground shrink-0 uppercase">{v.encounterType}</p>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">{new Date(v.createdAt).toLocaleDateString('en-IN')}</p>
              </CardContent>
            </Card>
          ))
        )}
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
