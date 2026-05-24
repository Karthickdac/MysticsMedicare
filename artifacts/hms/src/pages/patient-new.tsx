import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import { useCreatePatient, type Patient } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { PhotoCapture } from "@/components/photo-capture";
import { PatientIdCard } from "@/components/patient-id-card";

const formSchema = z.object({
  name: z.string().min(2, "Name is required"),
  gender: z.string().min(1, "Gender is required"),
  dob: z.string().min(1, "Date of birth is required"),
  phone: z.string().min(10, "Valid phone number is required"),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  bloodGroup: z.string().optional(),
  allergies: z.string().optional(),
  emergencyContact: z.string().optional(),
  insuranceProvider: z.string().optional(),
  insuranceNumber: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function PatientNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMutation = useCreatePatient();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [created, setCreated] = useState<Patient | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "", gender: "", dob: "", phone: "", email: "", address: "",
      bloodGroup: "", allergies: "", emergencyContact: "",
      insuranceProvider: "", insuranceNumber: "",
    },
  });

  const onSubmit = (data: FormValues) => {
    createMutation.mutate(
      { data: { ...data, avatarUrl: avatarUrl ?? undefined } },
      {
        onSuccess: (res) => {
          toast({ title: "Patient registered", description: `UHID ${res.uhid}` });
          setCreated(res);
        },
        onError: (err) => {
          toast({ title: "Error registering patient", description: err.message, variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Register Patient</h1>
        <p className="text-muted-foreground">Create a new patient record — capture a photo and print an ID card.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Patient Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="flex gap-6 flex-wrap">
                <div>
                  <FormLabel className="block mb-2">Photo</FormLabel>
                  <PhotoCapture value={avatarUrl} onChange={setAvatarUrl} />
                  <p className="text-xs text-muted-foreground mt-1 max-w-[12rem]">
                    Optional. Captured photos appear on the printed ID card.
                  </p>
                </div>

                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 min-w-[280px]">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem><FormLabel>Full Name *</FormLabel><FormControl><Input placeholder="John Doe" {...field} data-testid="input-name" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="phone" render={({ field }) => (
                    <FormItem><FormLabel>Phone Number *</FormLabel><FormControl><Input placeholder="+91..." {...field} data-testid="input-phone" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="gender" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gender *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger data-testid="select-gender"><SelectValue placeholder="Select gender" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="dob" render={({ field }) => (
                    <FormItem><FormLabel>Date of Birth *</FormLabel><FormControl><Input type="date" {...field} data-testid="input-dob" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="john@example.com" {...field} data-testid="input-email" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="bloodGroup" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Blood Group</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger data-testid="select-bloodgroup"><SelectValue placeholder="Select group" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(bg => (
                            <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="emergencyContact" render={({ field }) => (
                    <FormItem><FormLabel>Emergency Contact</FormLabel><FormControl><Input placeholder="Name & Phone" {...field} data-testid="input-emergency" /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
              </div>

              <FormField control={form.control} name="address" render={({ field }) => (
                <FormItem><FormLabel>Address</FormLabel><FormControl><Textarea placeholder="Full residential address" {...field} data-testid="input-address" /></FormControl><FormMessage /></FormItem>
              )} />

              <FormField control={form.control} name="allergies" render={({ field }) => (
                <FormItem><FormLabel>Known Allergies</FormLabel><FormControl><Textarea placeholder="List any known allergies" {...field} data-testid="input-allergies" /></FormControl><FormMessage /></FormItem>
              )} />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-border">
                <FormField control={form.control} name="insuranceProvider" render={({ field }) => (
                  <FormItem><FormLabel>Insurance Provider</FormLabel><FormControl><Input placeholder="e.g. Star Health" {...field} data-testid="input-insurance-provider" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="insuranceNumber" render={({ field }) => (
                  <FormItem><FormLabel>Insurance Policy Number</FormLabel><FormControl><Input placeholder="Policy #" {...field} data-testid="input-insurance-number" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setLocation("/patients")}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit">
                  {createMutation.isPending ? "Registering..." : "Register & Print ID"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {created && (
        <PatientIdCard
          patient={created}
          open
          onClose={() => {
            setCreated(null);
            setLocation(`/patients/${created.id}`);
          }}
        />
      )}
    </div>
  );
}
