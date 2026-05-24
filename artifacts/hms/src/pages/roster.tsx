import { useListRosterShifts, useCreateRosterShift, useListStaff } from "@workspace/api-client-react";
import { getListRosterShiftsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Calendar, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  staffId: z.coerce.number().min(1, "Select staff member"),
  department: z.string().min(1, "Department is required"),
  shift: z.string().min(1, "Shift is required"),
  date: z.string().min(1, "Date is required"),
  notes: z.string().optional(),
});

export default function Roster() {
  const { data: shifts, isLoading } = useListRosterShifts();
  const { data: staff } = useListStaff();
  const [open, setOpen] = useState(false);
  const createMutation = useCreateRosterShift();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { staffId: 0, department: "Emergency", shift: "Morning", date: new Date().toISOString().split('T')[0], notes: "" },
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    createMutation.mutate(
      { data },
      {
        onSuccess: () => {
          toast({ title: "Shift scheduled successfully" });
          queryClient.invalidateQueries({ queryKey: getListRosterShiftsQueryKey() });
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
            <Calendar className="w-6 h-6 text-primary" />
            Duty Roster
          </h1>
          <p className="text-muted-foreground">Manage staff shifts and schedules.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Add Shift</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Schedule Shift</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="staffId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Staff Member</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value ? field.value.toString() : ""}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {staff?.map(s => (
                            <SelectItem key={s.id} value={s.id.toString()}>{s.name} ({s.role})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="department"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Department</FormLabel>
                        <FormControl><Input placeholder="e.g. ICU" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="shift"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Shift</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Select shift" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Morning">Morning (08:00 - 16:00)</SelectItem>
                            <SelectItem value="Evening">Evening (16:00 - 00:00)</SelectItem>
                            <SelectItem value="Night">Night (00:00 - 08:00)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={createMutation.isPending} className="w-full">
                  {createMutation.isPending ? "Scheduling..." : "Save Shift"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card border border-border rounded-lg shadow-sm">
        <div className="p-4 border-b border-border bg-muted/20">
          <h2 className="font-semibold">Recent Shifts</h2>
        </div>
        <div className="divide-y divide-border">
          {isLoading ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : shifts?.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No shifts scheduled</div>
          ) : (
            shifts?.map(shift => (
              <div key={shift.id} className="p-4 flex justify-between items-center hover:bg-muted/30">
                <div className="flex gap-4 items-center">
                  <div className={`w-2 h-10 rounded-full ${
                    shift.shift === 'Morning' ? 'bg-amber-400' : 
                    shift.shift === 'Evening' ? 'bg-blue-400' : 'bg-indigo-900'
                  }`} />
                  <div>
                    <p className="font-medium">{shift.staffName}</p>
                    <p className="text-sm text-muted-foreground">{shift.department} • {shift.shift}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{new Date(shift.date).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
