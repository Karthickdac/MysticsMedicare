import { useListCheckupPackages, useCreateCheckupPackage } from "@workspace/api-client-react";
import { getListCheckupPackagesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Activity, Plus, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  price: z.coerce.number().min(0, "Price must be positive"),
  tests: z.string().min(1, "Provide at least one test (comma separated)"),
});

export default function Checkups() {
  const { data: packages, isLoading } = useListCheckupPackages();
  const [open, setOpen] = useState(false);
  const createMutation = useCreateCheckupPackage();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", description: "", price: 0, tests: "" },
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    const testsArray = data.tests.split(',').map(t => t.trim()).filter(Boolean);
    createMutation.mutate(
      { data: { ...data, tests: testsArray } },
      {
        onSuccess: () => {
          toast({ title: "Package created successfully" });
          queryClient.invalidateQueries({ queryKey: getListCheckupPackagesQueryKey() });
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
            <Activity className="w-6 h-6 text-primary" />
            Health Check-up Packages
          </h1>
          <p className="text-muted-foreground">Manage predefined health assessment plans.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Create Package</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Check-up Package</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Package Name</FormLabel>
                      <FormControl><Input placeholder="e.g. Master Health Check" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl><Textarea placeholder="Short description..." {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price (₹)</FormLabel>
                      <FormControl><Input type="number" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tests"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tests Included (comma separated)</FormLabel>
                      <FormControl><Textarea placeholder="CBC, Lipid Profile, ECG, X-Ray Chest" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={createMutation.isPending} className="w-full">
                  {createMutation.isPending ? "Creating..." : "Save Package"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader><Skeleton className="h-6 w-3/4" /></CardHeader>
              <CardContent><Skeleton className="h-24 w-full" /></CardContent>
            </Card>
          ))
        ) : packages?.length === 0 ? (
          <div className="col-span-full text-center py-12 text-muted-foreground border border-dashed rounded-lg bg-card">
            No health packages configured
          </div>
        ) : (
          packages?.map(pkg => (
            <Card key={pkg.id} className="flex flex-col border-border hover:border-primary/50 transition-colors">
              <CardHeader className="pb-3 border-b border-border bg-muted/20">
                <CardTitle className="text-xl flex justify-between items-start">
                  <span>{pkg.name}</span>
                  <span className="text-primary font-bold">₹{pkg.price.toLocaleString('en-IN')}</span>
                </CardTitle>
                {pkg.description && <p className="text-sm text-muted-foreground mt-2">{pkg.description}</p>}
              </CardHeader>
              <CardContent className="pt-4 flex-1">
                <ul className="space-y-2">
                  {pkg.tests.map((test, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                      <span>{test}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter className="pt-0 pb-4">
                <Button variant="outline" className="w-full text-primary border-primary hover:bg-primary hover:text-white">
                  Schedule for Patient
                </Button>
              </CardFooter>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
