import { useListOtBookings, useCreateOtBooking, useListPatients } from "@workspace/api-client-react";
import { getListOtBookingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Scissors, Plus } from "lucide-react";
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
  procedure: z.string().min(1, "Procedure is required"),
  theatre: z.string().min(1, "Theatre is required"),
  surgeon: z.string().optional(),
  anesthetist: z.string().optional(),
  scheduledAt: z.string().min(1, "Schedule time is required"),
  durationMinutes: z.coerce.number().optional(),
});

export default function Ot() {
  const { data: bookings, isLoading } = useListOtBookings();
  const { data: patients } = useListPatients({});
  const [open, setOpen] = useState(false);
  const createMutation = useCreateOtBooking();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { patientId: 0, procedure: "", theatre: "", surgeon: "", anesthetist: "", scheduledAt: "", durationMinutes: 60 },
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    // Make sure datetime is proper ISO or format expected
    const d = new Date(data.scheduledAt);
    createMutation.mutate(
      { data: { ...data, scheduledAt: d.toISOString() } },
      {
        onSuccess: () => {
          toast({ title: "OT booked successfully" });
          queryClient.invalidateQueries({ queryKey: getListOtBookingsQueryKey() });
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
            <Scissors className="w-6 h-6 text-primary" />
            OT Bookings
          </h1>
          <p className="text-muted-foreground">Manage operating theatre schedules.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Schedule Surgery</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Book OT</DialogTitle>
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
                  name="procedure"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Procedure</FormLabel>
                      <FormControl><Input placeholder="e.g. Appendectomy" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="theatre"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Theatre</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select OT" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="OT-1">OT 1</SelectItem>
                          <SelectItem value="OT-2">OT 2</SelectItem>
                          <SelectItem value="OT-Minor">Minor OT</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="surgeon"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Surgeon</FormLabel>
                        <FormControl><Input placeholder="Dr. Name" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="anesthetist"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Anesthetist</FormLabel>
                        <FormControl><Input placeholder="Dr. Name" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="scheduledAt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date & Time</FormLabel>
                        <FormControl><Input type="datetime-local" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="durationMinutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Duration (mins)</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <Button type="submit" disabled={createMutation.isPending} className="w-full">
                  {createMutation.isPending ? "Booking..." : "Book OT"}
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
                <TableHead>Time</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Procedure</TableHead>
                <TableHead>Theatre</TableHead>
                <TableHead>Surgeon</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                  </TableRow>
                ))
              ) : bookings?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No OT bookings found</TableCell>
                </TableRow>
              ) : (
                bookings?.map(booking => (
                  <TableRow key={booking.id}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {new Date(booking.scheduledAt).toLocaleString('en-IN', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                      })}
                    </TableCell>
                    <TableCell className="font-semibold">{booking.patientName}</TableCell>
                    <TableCell>{booking.procedure}</TableCell>
                    <TableCell>{booking.theatre}</TableCell>
                    <TableCell>{booking.surgeon ? `Dr. ${booking.surgeon}` : "-"}</TableCell>
                    <TableCell>
                      <Badge variant={booking.status === 'scheduled' ? 'outline' : 'secondary'}>
                        {booking.status}
                      </Badge>
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
