import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import {
  useCreateAdmission,
  useListBeds,
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
import { BedDouble, UserPlus } from "lucide-react";

const formSchema = z.object({
  patientId: z.coerce.number().int().min(1, "Select a patient"),
  doctorId: z.coerce.number().int().min(1, "Select admitting doctor"),
  bedId: z.coerce.number().int().min(1, "Pick an available bed"),
  reason: z.string().optional(),
  advanceAmount: z.coerce.number().min(0).optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function IpdAdmit() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const create = useCreateAdmission();

  const { data: patients } = useListPatients({});
  const { data: staff } = useListStaff();
  const { data: beds } = useListBeds();

  const doctors = useMemo(
    () => (staff ?? []).filter((s) => s.role === "doctor" && s.status !== "inactive"),
    [staff],
  );
  const availableBeds = useMemo(
    () => (beds ?? []).filter((b) => b.status === "available"),
    [beds],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { patientId: 0, doctorId: 0, bedId: 0, reason: "", advanceAmount: 0 },
  });

  // Deep-link from bed board: /ipd/admit?bedId=…
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const bedId = q.get("bedId");
    if (bedId) form.setValue("bedId", Number(bedId));
  }, [form]);

  const onSubmit = async (v: FormValues) => {
    try {
      const adm = await create.mutateAsync({
        data: {
          patientId: v.patientId,
          doctorId: v.doctorId,
          bedId: v.bedId,
          reason: v.reason,
          advanceAmount: v.advanceAmount,
        },
      });
      toast({ title: "Patient admitted", description: `${adm.patientName ?? "Patient"} → ${adm.bedCode ?? "bed"}` });
      setLocation(`/ipd/admissions/${adm.id}`);
    } catch (err) {
      const msg = (err as Error).message || "Admission failed";
      toast({ title: "Could not admit", description: msg, variant: "destructive" });
    }
  };

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 mb-6">
        <UserPlus className="w-6 h-6 text-primary" /> New IPD Admission
      </h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BedDouble className="w-4 h-4" /> Admission details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="patientId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Patient</FormLabel>
                    <Select onValueChange={(v) => field.onChange(Number(v))} value={field.value ? String(field.value) : ""}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(patients ?? []).map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.name} · {p.uhid}
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
                    <FormLabel>Admitting doctor</FormLabel>
                    <Select onValueChange={(v) => field.onChange(Number(v))} value={field.value ? String(field.value) : ""}>
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
                name="bedId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bed</FormLabel>
                    <Select onValueChange={(v) => field.onChange(Number(v))} value={field.value ? String(field.value) : ""}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Pick available bed" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableBeds.map((b) => (
                          <SelectItem key={b.id} value={String(b.id)}>
                            {b.ward} · {b.code}
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
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason for admission</FormLabel>
                    <FormControl><Textarea {...field} placeholder="Chief complaint / provisional diagnosis" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="advanceAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Advance payment (₹)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-2 pt-2">
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? "Admitting…" : "Admit patient"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setLocation("/ipd")}>
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
