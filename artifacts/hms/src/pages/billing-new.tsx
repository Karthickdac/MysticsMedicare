import { z } from "zod";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import { useCreateBill, useListPatients } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, Receipt } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const itemSchema = z.object({
  description: z.string().min(1, "Required"),
  quantity: z.coerce.number().min(1),
  unitPrice: z.coerce.number().min(0),
});

const formSchema = z.object({
  patientId: z.coerce.number().min(1, "Select patient"),
  gstMode: z.string(),
  insuranceProvider: z.string().optional(),
  items: z.array(itemSchema).min(1, "At least one item is required")
});

type FormValues = z.infer<typeof formSchema>;

export default function BillingNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMutation = useCreateBill();
  const { data: patients, isLoading: patientsLoading } = useListPatients({});

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      patientId: 0,
      gstMode: "intra",
      insuranceProvider: "",
      items: [{ description: "Consultation Fee", quantity: 1, unitPrice: 500 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const watchItems = form.watch("items");
  const watchGstMode = form.watch("gstMode");

  const subtotal = watchItems.reduce((acc, item) => acc + ((item.quantity || 0) * (item.unitPrice || 0)), 0);
  const isIntra = watchGstMode === "intra";
  const cgst = isIntra ? subtotal * 0.09 : 0;
  const sgst = isIntra ? subtotal * 0.09 : 0;
  const igst = !isIntra ? subtotal * 0.18 : 0;
  const total = subtotal + cgst + sgst + igst;

  const onSubmit = (data: FormValues) => {
    // API schema expects amounts to be pre-calculated in items
    const payload = {
      ...data,
      items: data.items.map(item => ({
        ...item,
        amount: item.quantity * item.unitPrice
      }))
    };

    createMutation.mutate(
      { data: payload },
      {
        onSuccess: (res) => {
          toast({ title: "Bill created" });
          setLocation(`/billing/${res.id}`);
        },
        onError: (err) => {
          toast({ title: "Error", description: err.message, variant: "destructive" });
        }
      }
    );
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <Receipt className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Create Invoice</h1>
          <p className="text-muted-foreground">Generate a new GST-compliant bill.</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Billing Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="patientId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Patient *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value.toString()}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select patient" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {patients?.map(p => (
                            <SelectItem key={p.id} value={p.id.toString()}>{p.name} ({p.uhid})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="insuranceProvider"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Insurance / TPA (Optional)</FormLabel>
                      <FormControl><Input placeholder="e.g. HDFC Ergo" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="gstMode"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel>Tax Configuration</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          className="flex flex-col space-y-1"
                        >
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="intra" />
                            </FormControl>
                            <FormLabel className="font-normal">
                              Intra-state (CGST 9% + SGST 9%)
                            </FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="inter" />
                            </FormControl>
                            <FormLabel className="font-normal">
                              Inter-state (IGST 18%)
                            </FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg">Line Items</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={() => append({ description: "", quantity: 1, unitPrice: 0 })}>
                <Plus className="w-4 h-4 mr-2" /> Add Item
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {fields.map((field, index) => (
                  <div key={field.id} className="flex items-start gap-3 p-3 bg-muted/30 border border-border rounded-md">
                    <div className="flex-1 space-y-3">
                      <FormField
                        control={form.control}
                        name={`items.${index}.description`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="sr-only">Description</FormLabel>
                            <FormControl><Input placeholder="Service / Item Description" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex gap-3">
                        <FormField
                          control={form.control}
                          name={`items.${index}.quantity`}
                          render={({ field }) => (
                            <FormItem className="flex-1">
                              <FormLabel className="text-xs">Qty</FormLabel>
                              <FormControl><Input type="number" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`items.${index}.unitPrice`}
                          render={({ field }) => (
                            <FormItem className="flex-1">
                              <FormLabel className="text-xs">Unit Rate (₹)</FormLabel>
                              <FormControl><Input type="number" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="flex-1 flex flex-col justify-end pb-2">
                          <span className="text-sm font-medium text-right">
                            ₹{((watchItems[index]?.quantity || 0) * (watchItems[index]?.unitPrice || 0)).toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="text-destructive mt-1 shrink-0" onClick={() => remove(index)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
            <CardFooter className="bg-muted/10 border-t border-border flex justify-end p-6">
              <div className="w-64 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">₹{subtotal.toLocaleString('en-IN')}</span>
                </div>
                {isIntra ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">CGST (9%)</span>
                      <span>₹{cgst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">SGST (9%)</span>
                      <span>₹{sgst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IGST (18%)</span>
                    <span>₹{igst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="flex justify-between pt-3 border-t border-border font-bold text-lg">
                  <span>Total</span>
                  <span className="text-primary">₹{total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            </CardFooter>
          </Card>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setLocation("/billing")}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Generating..." : "Generate Invoice"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
