import { useListVaccinations, useRecordVaccination, useListPatients } from "@workspace/api-client-react";
import { getListVaccinationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Syringe, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  patientId: z.coerce.number().min(1, "Select patient"),
  vaccineName: z.string().min(1, "Vaccine name is required"),
  doseNumber: z.coerce.number().min(1),
  batchNumber: z.string().optional(),
  administeredBy: z.string().optional(),
  administeredAt: z.string().min(1, "Date is required"),
  nextDueDate: z.string().optional().or(z.literal("")),
});

export default function Vaccinations() {
  const { data: vaccinations, isLoading } = useListVaccinations({});
  const { data: patients } = useListPatients({});
  const [open, setOpen] = useState(false);
  const createMutation = useRecordVaccination();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { patientId: 0, vaccineName: "", doseNumber: 1, batchNumber: "", administeredBy: "", administeredAt: new Date().toISOString().split('T')[0] },
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    // Format dates correctly (ISO string expected, but date inputs give YYYY-MM-DD)
    const payload = {
      ...data,
      administeredAt: new Date(data.administeredAt).toISOString(),
      nextDueDate: data.nextDueDate ? new Date(data.nextDueDate).toISOString() : undefined,
    };

    createMutation.mutate(
      { data: payload },
      {
        onSuccess: () => {
          toast({ title: "Vaccination recorded" });
          queryClient.invalidateQueries({ queryKey: getListVaccinationsQueryKey() });
          setOpen(false);
          form.reset();
        },
      }
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Syringe className="w-6 h-6 text-primary" />
            Vaccinations
          </h1>
          <p className="text-muted-foreground">Record and track patient immunizations.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Record Vaccination</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record Vaccination</DialogTitle>
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
                  name="vaccineName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vaccine Name</FormLabel>
                      <FormControl><Input placeholder="e.g. Hepatitis B" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="doseNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Dose Number</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="batchNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Batch/Lot Number</FormLabel>
                        <FormControl><Input placeholder="Lot #" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="administeredAt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Administered Date</FormLabel>
                        <FormControl><Input type="date" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="nextDueDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Next Due Date</FormLabel>
                        <FormControl><Input type="date" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="administeredBy"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Administered By</FormLabel>
                      <FormControl><Input placeholder="Nurse/Dr. Name" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={createMutation.isPending} className="w-full">
                  {createMutation.isPending ? "Saving..." : "Save Record"}
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
                <TableHead>Vaccine</TableHead>
                <TableHead>Dose #</TableHead>
                <TableHead>Batch Number</TableHead>
                <TableHead>Next Due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  </TableRow>
                ))
              ) : vaccinations?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No vaccination records found</TableCell>
                </TableRow>
              ) : (
                vaccinations?.map(record => (
                  <TableRow key={record.id}>
                    <TableCell>{new Date(record.administeredAt).toLocaleDateString('en-IN')}</TableCell>
                    <TableCell className="font-semibold">{record.patientName}</TableCell>
                    <TableCell>{record.vaccineName}</TableCell>
                    <TableCell>{record.doseNumber}</TableCell>
                    <TableCell className="font-mono text-xs">{record.batchNumber || "-"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {record.nextDueDate ? new Date(record.nextDueDate).toLocaleDateString('en-IN') : "-"}
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
