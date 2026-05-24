import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import {
  useCreateAppointment,
  useListPatients,
  useListStaff,
  useGetPublicHospitalSettings,
} from "@workspace/api-client-react";
import { DatePicker } from "@/components/ui/date-picker";
import { makeClosedDayMatcher, type PublicHospitalSettings } from "./portal-shell";
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
  const { data: settings } = useGetPublicHospitalSettings();

  const workingHoursHint = useMemo(() => {
    const wh = settings?.workingHours as Record<string, { open?: string; close?: string; closed?: boolean }> | undefined;
    if (!wh) return null;
    const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return days
      .map((d, i) => {
        const v = wh[d];
        if (!v || v.closed) return `${labels[i]}: Closed`;
        return `${labels[i]}: ${v.open ?? "—"}–${v.close ?? "—"}`;
      })
      .join("  •  ");
  }, [settings]);

  const holidayHint = useMemo(() => {
    const hs = settings?.holidays ?? [];
    if (hs.length === 0) return null;
    return hs.slice(0, 5).map((h) => `${h.date}${h.label ? ` (${h.label})` : ""}`).join(", ");
  }, [settings]);

  const closedMatcher = useMemo(
    () => makeClosedDayMatcher(settings as PublicHospitalSettings | undefined),
    [settings],
  );
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  const doctors = useMemo(
    () => (staff ?? []).filter((s) => s.role === "doctor" && s.status !== "inactive"),
    [staff],
  );

  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const d of doctors) if (d.department) set.add(d.department);
    return Array.from(set).sort();
  }, [doctors]);

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

  const selectedDepartment = form.watch("department");
  const selectedDoctorId = form.watch("doctorId");
  const selectedScheduledAt = form.watch("scheduledAt");
  const doctorsInDepartment = useMemo(
    () => (selectedDepartment ? doctors.filter((d) => d.department === selectedDepartment) : []),
    [doctors, selectedDepartment],
  );

  // Look up the chosen doctor's roster windows for the chosen date so we can
  // warn the user before they POST a slot the API would reject. Mirrors the
  // /portal/doctors/:id/slots roster check.
  type Availability = {
    closed: boolean;
    reason: string | null;
    intervals: Array<{ startMin: number; endMin: number }>;
    dutyWindows: string;
    unrostered: boolean;
  };
  const [availability, setAvailability] = useState<Availability | null>(null);
  const datePart = (selectedScheduledAt ?? "").split("T")[0] ?? "";
  const timePart = (selectedScheduledAt ?? "").split("T")[1] ?? "";

  useEffect(() => {
    if (!selectedDoctorId || !datePart) { setAvailability(null); return; }
    let cancelled = false;
    fetch(`/api/doctors/${selectedDoctorId}/availability?date=${datePart}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled) setAvailability(j); })
      .catch(() => { if (!cancelled) setAvailability(null); });
    return () => { cancelled = true; };
  }, [selectedDoctorId, datePart]);

  const rosterWarning = useMemo(() => {
    if (!availability) return null;
    if (availability.unrostered) return null;
    if (availability.closed) return availability.reason ?? "Doctor is unavailable that day.";
    if (!timePart) return null;
    const [h, m] = timePart.split(":").map((s) => Number(s));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    const minOfDay = h * 60 + m;
    const inside = availability.intervals.some((iv) => minOfDay >= iv.startMin && minOfDay < iv.endMin);
    if (inside) return null;
    return `That time is outside the doctor's on-duty hours (${availability.dutyWindows}).`;
  }, [availability, timePart]);

  function onDepartmentChange(dept: string) {
    form.setValue("department", dept);
    // Clear doctor selection if current pick isn't in the new department.
    const current = doctors.find((d) => d.id === form.getValues("doctorId"));
    if (!current || current.department !== dept) {
      form.setValue("doctorId", 0);
    }
  }

  // When deep-linked with ?doctorId=… the doctors list usually loads *after*
  // the form initializes. Auto-derive the department from the prefilled doctor
  // so the dependent doctor dropdown shows the right options.
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
                  name="department"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department *</FormLabel>
                      <Select
                        onValueChange={onDepartmentChange}
                        value={field.value || undefined}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={departments.length === 0 ? "No departments available" : "Select department"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {departments.map((d) => (
                            <SelectItem key={d} value={d}>{d}</SelectItem>
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
                        onValueChange={(v) => field.onChange(Number(v))}
                        value={selectedDoctorId ? String(selectedDoctorId) : undefined}
                        disabled={!selectedDepartment}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={
                              !selectedDepartment ? "Select a department first" :
                              doctorsInDepartment.length === 0 ? "No doctors in this department" :
                              "Select doctor"
                            } />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {doctorsInDepartment.map((d) => (
                            <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="scheduledAt"
                  render={({ field }) => {
                    const [datePart, timePart] = (field.value ?? "").split("T");
                    const setBoth = (d: string, t: string) =>
                      field.onChange(d ? `${d}T${t || "09:00"}` : "");
                    return (
                      <FormItem>
                        <FormLabel>Date & time *</FormLabel>
                        <div className="grid grid-cols-2 gap-2">
                          <FormControl>
                            <DatePicker
                              value={datePart ?? ""}
                              onChange={(d) => setBoth(d, timePart ?? "")}
                              disabled={closedMatcher}
                              minDate={today}
                              ariaLabel="Pick appointment date"
                            />
                          </FormControl>
                          <Input
                            type="time"
                            value={timePart ?? ""}
                            onChange={(e) => setBoth(datePart ?? "", e.target.value)}
                          />
                        </div>
                        {workingHoursHint && (
                          <p className="text-[11px] text-muted-foreground mt-1">
                            Hours: {workingHoursHint}
                          </p>
                        )}
                        {holidayHint && (
                          <p className="text-[11px] text-muted-foreground">
                            Upcoming holidays: {holidayHint}
                          </p>
                        )}
                        {availability && !availability.closed && !availability.unrostered && availability.dutyWindows && (
                          <p className="text-[11px] text-muted-foreground">
                            Doctor on duty: {availability.dutyWindows}
                          </p>
                        )}
                        {rosterWarning && (
                          <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 px-2 py-1.5 rounded mt-1" data-testid="text-roster-warning">
                            {rosterWarning}
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    );
                  }}
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
            <Button type="submit" disabled={createMutation.isPending || !!rosterWarning} className="bg-brand-gradient text-white">
              {createMutation.isPending ? "Booking…" : "Book appointment"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
