import { useEffect, useMemo } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import {
  useCreateAppointment,
  useListPatients,
  useListStaff,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Calendar } from "lucide-react";

const formSchema = z.object({
  patientId: z.coerce.number().int().min(1, "Select a patient"),
  doctorId: z.coerce.number().int().min(1, "Select a doctor"),
  department: z.string().min(1, "Department is required"),
  scheduledAt: z.string().min(1, "Pick a date & time"),
  reason: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

function toLocalIso(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AppointmentNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMutation = useCreateAppointment();
  const { data: patients } = useListPatients({});
  const { data: staff } = useListStaff();

  const doctors = useMemo(
    () => (staff ?? []).filter((s) => s.role === "doctor" && s.status !== "inactive"),
    [staff],
  );

  // Prefill from query string so other pages can deep-link a follow-up booking
  // (e.g. encounter-detail's "Schedule follow-up" button passes patientId &
  // doctorId & reason). Default the visit time +7 days when prefilled.
  const prefill = useMemo(() => {
    if (typeof window === "undefined") return {} as Record<string, string>;
    const q = new URLSearchParams(window.location.search);
    return {
      patientId: q.get("patientId") ?? "",
      doctorId: q.get("doctorId") ?? "",
      department: q.get("department") ?? "",
      reason: q.get("reason") ?? "",
      followUp: q.get("followUp") ?? "",
    };
  }, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      patientId: prefill.patientId ? Number(prefill.patientId) : 0,
      doctorId: prefill.doctorId ? Number(prefill.doctorId) : 0,
      department: prefill.department || "",
      scheduledAt: toLocalIso(new Date(Date.now() + (prefill.followUp ? 7 * 24 : 1) * 60 * 60 * 1000)),
      reason: prefill.reason || "",
    },
  });

  function onDoctorChange(id: string) {
    form.setValue("doctorId", Number(id));
    const doc = doctors.find((d) => d.id === Number(id));
    if (doc?.department) form.setValue("department", doc.department);
  }

  // When deep-linked with ?doctorId=… the doctors list usually loads *after*
  // the form initializes, so onDoctorChange never fires. Auto-derive the
  // department once the roster lands to keep follow-up bookings valid without
  // manual touch.
  useEffect(() => {
    const docId = form.getValues("doctorId");
    if (!docId || form.getValues("department")) return;
    const doc = doctors.find((d) => d.id === docId);
    if (doc?.department) form.setValue("department", doc.department);
  }, [doctors, form]);

  const onSubmit = (data: FormValues) => {
    createMutation.mutate(
      {
        data: {
          patientId: data.patientId,
          doctorId: data.doctorId,
          department: data.department,
          scheduledAt: new Date(data.scheduledAt).toISOString(),
          reason: data.reason || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Appointment booked" });
          setLocation("/appointments");
        },
        onError: (err) => {
          toast({ title: "Could not book", description: err.message, variant: "destructive" });
        },
      },
    );
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <Calendar className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">New Appointment</h1>
          <p className="text-muted-foreground">Schedule a patient visit with a doctor.</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Visit details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="patientId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Patient *</FormLabel>
                      <Select
                        onValueChange={(v) => field.onChange(Number(v))}
                        defaultValue={field.value ? String(field.value) : undefined}
                      >
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {patients?.map((p) => (
                            <SelectItem key={p.id} value={String(p.id)}>
                              {p.name} ({p.uhid})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="doctorId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Doctor *</FormLabel>
                      <Select
                        onValueChange={onDoctorChange}
                        defaultValue={field.value ? String(field.value) : undefined}
                      >
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {doctors.map((d) => (
                            <SelectItem key={d.id} value={String(d.id)}>
                              {d.name} · {d.department}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="department"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department *</FormLabel>
                      <FormControl><Input placeholder="e.g. Cardiology" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="scheduledAt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date & time *</FormLabel>
                      <FormControl><Input type="datetime-local" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason for visit</FormLabel>
                    <FormControl>
                      <Textarea rows={3} placeholder="Chief complaint or visit purpose" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setLocation("/appointments")}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending} className="bg-brand-gradient text-white">
              {createMutation.isPending ? "Booking…" : "Book appointment"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
