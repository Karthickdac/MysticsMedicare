import { useListConsentForms, useCreateConsentForm, useListPatients } from "@workspace/api-client-react";
import { getListConsentFormsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { FileSignature, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  patientId: z.coerce.number().min(1, "Select patient"),
  type: z.string().min(1, "Consent type is required"),
  details: z.string().optional(),
  witness: z.string().optional(),
});

export default function Consent() {
  const { data: consents, isLoading } = useListConsentForms({});
  const { data: patients } = useListPatients({});
  const [open, setOpen] = useState(false);
  const createMutation = useCreateConsentForm();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { patientId: 0, type: "General Surgery", details: "", witness: "" },
  });

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    draw(e);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) ctx.beginPath();
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000";

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const clearCanvas = () => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    let signatureData = "";
    if (canvasRef.current) {
      signatureData = canvasRef.current.toDataURL("image/png");
      // Basic check if canvas is completely empty
      const ctx = canvasRef.current.getContext('2d');
      const pixelBuffer = new Uint32Array(ctx!.getImageData(0,0, canvasRef.current.width, canvasRef.current.height).data.buffer);
      if(!pixelBuffer.some(color => color !== 0)) {
        toast({ title: "Signature required", variant: "destructive" });
        return;
      }
    }

    createMutation.mutate(
      { data: { ...data, signatureData, signedAt: new Date().toISOString() } },
      {
        onSuccess: () => {
          toast({ title: "Consent form saved" });
          queryClient.invalidateQueries({ queryKey: getListConsentFormsQueryKey() });
          setOpen(false);
          form.reset();
          clearCanvas();
        },
      }
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileSignature className="w-6 h-6 text-primary" />
            Consent Forms
          </h1>
          <p className="text-muted-foreground">Digital patient consents and waivers.</p>
        </div>
        <Dialog open={open} onOpenChange={(val) => { setOpen(val); if(val) setTimeout(clearCanvas, 100); }}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> New Consent</Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Capture Consent</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="patientId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Patient</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value ? field.value.toString() : ""}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {patients?.map(p => (
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
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Consent Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="General Surgery">General Surgery</SelectItem>
                          <SelectItem value="Anesthesia">Anesthesia</SelectItem>
                          <SelectItem value="Blood Transfusion">Blood Transfusion</SelectItem>
                          <SelectItem value="High Risk Procedure">High Risk Procedure</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="details"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Procedure Details</FormLabel>
                      <FormControl><Textarea placeholder="Specific risks explained..." {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <FormLabel>Patient Signature *</FormLabel>
                    <Button type="button" variant="ghost" size="sm" onClick={clearCanvas} className="h-6 px-2 text-xs">Clear</Button>
                  </div>
                  <div className="border border-border rounded-md bg-white overflow-hidden">
                    <canvas 
                      ref={canvasRef}
                      width={500}
                      height={150}
                      className="w-full touch-none"
                      onMouseDown={startDrawing}
                      onMouseUp={stopDrawing}
                      onMouseOut={stopDrawing}
                      onMouseMove={draw}
                      onTouchStart={startDrawing}
                      onTouchEnd={stopDrawing}
                      onTouchMove={draw}
                    />
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="witness"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Witness Name (Optional)</FormLabel>
                      <FormControl><Input placeholder="Name of staff/relative" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={createMutation.isPending} className="w-full">
                  {createMutation.isPending ? "Saving..." : "Save Consent"}
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
                <TableHead>Type</TableHead>
                <TableHead>Witness</TableHead>
                <TableHead>Signature</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-16" /></TableCell>
                  </TableRow>
                ))
              ) : consents?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No consent forms found</TableCell>
                </TableRow>
              ) : (
                consents?.map(form => (
                  <TableRow key={form.id}>
                    <TableCell>
                      {new Date(form.signedAt).toLocaleString('en-IN', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                      })}
                    </TableCell>
                    <TableCell className="font-semibold">{form.patientName}</TableCell>
                    <TableCell>{form.type}</TableCell>
                    <TableCell>{form.witness || "-"}</TableCell>
                    <TableCell>
                      {form.signatureData ? (
                        <div className="bg-white border rounded p-1 inline-block">
                          <img src={form.signatureData} alt="Signature" className="h-8 w-auto object-contain mix-blend-multiply" />
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Missing</span>
                      )}
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
