import { useListDrugs, useCreateDrug, useUpdateDrug, useDeleteDrug, getListDrugsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldPlus, Plus, Pencil, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  genericName: z.string().optional(),
  category: z.string().min(1, "Category is required"),
  unit: z.string().min(1, "Unit is required"),
  manufacturer: z.string().optional(),
  strength: z.string().optional(),
  form: z.string().optional(),
  schedule: z.string().optional(),
  hsn: z.string().optional(),
  gstRate: z.coerce.number().min(0).max(28).default(12),
  mrp: z.coerce.number().min(0).optional(),
  reorderLevel: z.coerce.number().int().min(0).default(10),
});

type FormData = z.infer<typeof formSchema>;

const SCHEDULES = ["OTC", "H", "H1", "X"];
const FORMS = ["Tablet", "Capsule", "Syrup", "Injection", "Ointment", "Drops", "Inhaler"];

interface DrugLike {
  id: number;
  name: string;
  genericName?: string | null;
  category: string;
  unit: string;
  manufacturer?: string | null;
  strength?: string | null;
  form?: string | null;
  schedule?: string | null;
  hsn?: string | null;
  gstRate: number;
  mrp?: number | null;
  reorderLevel: number;
}

function DrugDialog({
  drug,
  onClose,
  trigger,
}: {
  drug?: DrugLike;
  onClose: () => void;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const create = useCreateDrug();
  const update = useUpdateDrug();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isEdit = !!drug;

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: drug?.name ?? "",
      genericName: drug?.genericName ?? "",
      category: drug?.category ?? "",
      unit: drug?.unit ?? "Tablet",
      manufacturer: drug?.manufacturer ?? "",
      strength: drug?.strength ?? "",
      form: drug?.form ?? "Tablet",
      schedule: drug?.schedule ?? "OTC",
      hsn: drug?.hsn ?? "3004",
      gstRate: drug?.gstRate ?? 12,
      mrp: drug?.mrp ?? undefined,
      reorderLevel: drug?.reorderLevel ?? 10,
    },
  });

  const onSubmit = (data: FormData) => {
    const opts = {
      onSuccess: () => {
        toast({ title: isEdit ? "Drug updated" : "Drug added" });
        queryClient.invalidateQueries({ queryKey: getListDrugsQueryKey() });
        setOpen(false);
        form.reset();
        onClose();
      },
    };
    if (isEdit) update.mutate({ id: drug!.id, data }, opts);
    else create.mutate({ data }, opts);
  };

  const pending = isEdit ? update.isPending : create.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${drug?.name}` : "Add New Drug"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Brand Name *</FormLabel>
                  <FormControl><Input placeholder="Crocin" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="genericName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Generic Name</FormLabel>
                  <FormControl><Input placeholder="Paracetamol" {...field} /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="strength" render={({ field }) => (
                <FormItem>
                  <FormLabel>Strength</FormLabel>
                  <FormControl><Input placeholder="500 mg" {...field} /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="form" render={({ field }) => (
                <FormItem>
                  <FormLabel>Form</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>{FORMS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                  </Select>
                </FormItem>
              )} />
              <FormField control={form.control} name="category" render={({ field }) => (
                <FormItem>
                  <FormLabel>Category *</FormLabel>
                  <FormControl><Input placeholder="Analgesic" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="unit" render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit *</FormLabel>
                  <FormControl><Input placeholder="Tablet" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="manufacturer" render={({ field }) => (
                <FormItem>
                  <FormLabel>Manufacturer</FormLabel>
                  <FormControl><Input placeholder="GSK" {...field} /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="schedule" render={({ field }) => (
                <FormItem>
                  <FormLabel>Schedule</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>{SCHEDULES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </FormItem>
              )} />
              <FormField control={form.control} name="hsn" render={({ field }) => (
                <FormItem>
                  <FormLabel>HSN Code</FormLabel>
                  <FormControl><Input placeholder="3004" {...field} /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="gstRate" render={({ field }) => (
                <FormItem>
                  <FormLabel>GST Rate (%)</FormLabel>
                  <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="mrp" render={({ field }) => (
                <FormItem>
                  <FormLabel>MRP (₹)</FormLabel>
                  <FormControl><Input type="number" step="0.01" {...field} value={field.value ?? ""} /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="reorderLevel" render={({ field }) => (
                <FormItem>
                  <FormLabel>Reorder Level</FormLabel>
                  <FormControl><Input type="number" {...field} /></FormControl>
                </FormItem>
              )} />
            </div>
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Saving..." : isEdit ? "Update Drug" : "Save Drug"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDrugButton({ drugId, drugName }: { drugId: number; drugName: string }) {
  const del = useDeleteDrug();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return (
    <Button
      variant="ghost"
      size="sm"
      data-testid={`button-delete-drug-${drugId}`}
      disabled={del.isPending}
      onClick={() => {
        if (!window.confirm(`Delete "${drugName}" from the formulary? This fails if the drug is referenced by any prescription, batch, or sale.`)) return;
        del.mutate(
          { id: drugId },
          {
            onSuccess: () => {
              toast({ title: "Drug deleted" });
              queryClient.invalidateQueries({ queryKey: getListDrugsQueryKey() });
            },
            onError: (e: unknown) => toast({ title: "Cannot delete", description: (e as Error).message, variant: "destructive" }),
          },
        );
      }}
    >
      <Trash2 className="w-4 h-4 text-destructive" />
    </Button>
  );
}

export default function Drugs() {
  const { data: drugs, isLoading } = useListDrugs();
  const [editing, setEditing] = useState<DrugLike | null>(null);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldPlus className="w-6 h-6 text-primary" />
            Drug Formulary
          </h1>
          <p className="text-muted-foreground">Brands, strengths, GST, and HSN for billing.</p>
        </div>
        <DrugDialog
          onClose={() => setEditing(null)}
          trigger={<Button data-testid="button-add-drug"><Plus className="w-4 h-4 mr-2" /> Add Drug</Button>}
        />
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Drug</TableHead>
                <TableHead>Strength</TableHead>
                <TableHead>Form</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>HSN</TableHead>
                <TableHead className="text-right">GST</TableHead>
                <TableHead className="text-right">MRP</TableHead>
                <TableHead className="text-right">Reorder</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                  ))}</TableRow>
                ))
              ) : drugs?.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No drugs yet</TableCell></TableRow>
              ) : (
                drugs?.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <div className="font-semibold">{d.name}</div>
                      <div className="text-xs text-muted-foreground">{d.genericName ?? "-"}</div>
                    </TableCell>
                    <TableCell>{d.strength ?? "-"}</TableCell>
                    <TableCell>{d.form ?? "-"}</TableCell>
                    <TableCell>
                      {d.schedule && d.schedule !== "OTC" ? (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/20">{d.schedule}</Badge>
                      ) : (
                        <Badge variant="outline">OTC</Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{d.hsn ?? "-"}</TableCell>
                    <TableCell className="text-right">{Number(d.gstRate).toFixed(0)}%</TableCell>
                    <TableCell className="text-right">{d.mrp != null ? `₹${Number(d.mrp).toFixed(2)}` : "-"}</TableCell>
                    <TableCell className="text-right">{d.reorderLevel}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <DrugDialog
                          drug={d as DrugLike}
                          onClose={() => setEditing(null)}
                          trigger={<Button variant="ghost" size="sm" data-testid={`button-edit-drug-${d.id}`}><Pencil className="w-4 h-4" /></Button>}
                        />
                        <DeleteDrugButton drugId={d.id} drugName={d.name} />
                      </div>
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
