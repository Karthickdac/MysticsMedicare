import {
  useListNotificationTemplates,
  useCreateNotificationTemplate,
  useUpdateNotificationTemplate,
  useDeleteNotificationTemplate,
  usePreviewNotificationTemplate,
  useListNotificationEvents,
  getListNotificationTemplatesQueryKey,
  type NotificationTemplate,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { MessageSquare, MessageCircle, Settings2, Phone, Eye, Trash2, Plus } from "lucide-react";

type FormState = {
  id?: number;
  eventKey: string;
  channel: string;
  language: string;
  subject: string;
  bodyTemplate: string;
  variables: string;
  isActive: boolean;
};

const emptyForm: FormState = {
  eventKey: "",
  channel: "whatsapp",
  language: "en",
  subject: "",
  bodyTemplate: "",
  variables: "",
  isActive: true,
};

export default function NotificationTemplates() {
  const qc = useQueryClient();
  const { data: templates, isLoading } = useListNotificationTemplates({});
  const { data: events } = useListNotificationEvents();
  const createMut = useCreateNotificationTemplate();
  const updateMut = useUpdateNotificationTemplate();
  const deleteMut = useDeleteNotificationTemplate();
  const previewMut = usePreviewNotificationTemplate();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [previewVars, setPreviewVars] = useState<Record<string, string>>({});
  const [previewText, setPreviewText] = useState<string>("");

  const grouped = useMemo(() => {
    const g: Record<string, NotificationTemplate[]> = {};
    (templates ?? []).forEach((t) => {
      (g[t.eventKey] ||= []).push(t);
    });
    return g;
  }, [templates]);

  const eventOptions = useMemo(() => events ?? [], [events]);
  const eventMeta = (key: string) => eventOptions.find((e) => e.key === key);

  const invalidate = () => qc.invalidateQueries({ queryKey: getListNotificationTemplatesQueryKey({}) });

  function openNew() {
    setForm(emptyForm);
    setPreviewVars({});
    setPreviewText("");
    setOpen(true);
  }

  function openEdit(t: NotificationTemplate) {
    setForm({
      id: t.id,
      eventKey: t.eventKey,
      channel: t.channel,
      language: t.language,
      subject: t.subject ?? "",
      bodyTemplate: t.bodyTemplate,
      variables: (t.variables ?? []).join(", "),
      isActive: t.isActive,
    });
    const meta = eventMeta(t.eventKey);
    const seed: Record<string, string> = {};
    (meta?.defaultVariables ?? t.variables ?? []).forEach((v) => (seed[v] = ""));
    setPreviewVars(seed);
    setPreviewText("");
    setOpen(true);
  }

  async function handleSave() {
    const variables = form.variables.split(",").map((s) => s.trim()).filter(Boolean);
    if (form.id) {
      await updateMut.mutateAsync({
        id: form.id,
        data: {
          channel: form.channel,
          language: form.language,
          subject: form.subject || undefined,
          bodyTemplate: form.bodyTemplate,
          variables,
          isActive: form.isActive,
        },
      });
    } else {
      await createMut.mutateAsync({
        data: {
          eventKey: form.eventKey,
          channel: form.channel,
          language: form.language,
          subject: form.subject || undefined,
          bodyTemplate: form.bodyTemplate,
          variables,
          isActive: form.isActive,
        },
      });
    }
    invalidate();
    setOpen(false);
  }

  async function handleToggleActive(t: NotificationTemplate) {
    await updateMut.mutateAsync({ id: t.id, data: { isActive: !t.isActive } });
    invalidate();
  }

  async function handleDelete(t: NotificationTemplate) {
    if (!confirm(`Delete template for ${t.eventKey} / ${t.channel}?`)) return;
    await deleteMut.mutateAsync({ id: t.id });
    invalidate();
  }

  async function handlePreview() {
    const res = await previewMut.mutateAsync({
      data: { bodyTemplate: form.bodyTemplate, variables: previewVars },
    });
    setPreviewText(res.rendered);
  }

  if (isLoading) {
    return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-primary" />
            Message Templates
          </h1>
          <p className="text-muted-foreground">Manage automated SMS and WhatsApp notifications.</p>
        </div>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> New Template</Button>
      </div>

      <div className="space-y-8">
        {Object.entries(grouped).map(([eventKey, groupTemplates]) => (
          <div key={eventKey} className="space-y-4">
            <h2 className="text-lg font-semibold tracking-tight px-1 flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-muted-foreground" />
              Event: {eventKey}
              {eventMeta(eventKey) && (
                <span className="text-xs text-muted-foreground font-normal">— {eventMeta(eventKey)!.label}</span>
              )}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {groupTemplates.map((t) => (
                <Card key={t.id} className={`border-l-4 ${t.channel === 'whatsapp' ? 'border-l-emerald-500' : 'border-l-blue-500'}`}>
                  <CardHeader className="pb-3 border-b border-border bg-card/50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {t.channel === 'whatsapp' ? <MessageCircle className="w-4 h-4 text-emerald-600" /> : <Phone className="w-4 h-4 text-blue-600" />}
                        <CardTitle className="text-base capitalize">{t.channel}</CardTitle>
                        <Badge variant="outline" className="text-[10px]">{t.language}</Badge>
                        <Badge variant={t.isActive ? "default" : "secondary"}>
                          {t.isActive ? "Active" : "Disabled"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <Switch checked={t.isActive} onCheckedChange={() => handleToggleActive(t)} aria-label="toggle active" />
                        <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>Edit</Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(t)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    {t.subject && <div className="text-sm font-medium">{t.subject}</div>}
                    <div className="bg-muted/30 p-3 rounded-md font-mono text-sm whitespace-pre-wrap text-foreground/80">
                      {t.bodyTemplate}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(t.variables ?? []).map((v: string) => (
                        <Badge key={v} variant="outline" className="text-[10px] px-1.5 py-0">
                          {`{{${v}}}`}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
        {Object.keys(grouped).length === 0 && (
          <Card><CardContent className="p-8 text-center text-muted-foreground">No templates yet. Click "New Template" to add one.</CardContent></Card>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Template" : "New Template"}</DialogTitle>
            <DialogDescription>
              Use <code>{`{{variableName}}`}</code> placeholders. Click Preview to render with sample values.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Event</Label>
              <Select
                value={form.eventKey}
                onValueChange={(v) => {
                  const meta = eventMeta(v);
                  setForm((f) => ({
                    ...f,
                    eventKey: v,
                    variables: meta ? meta.defaultVariables.join(", ") : f.variables,
                  }));
                  if (eventMeta(v)) {
                    const seed: Record<string, string> = {};
                    eventMeta(v)!.defaultVariables.forEach((k) => (seed[k] = ""));
                    setPreviewVars(seed);
                  }
                }}
                disabled={!!form.id}
              >
                <SelectTrigger><SelectValue placeholder="Select event" /></SelectTrigger>
                <SelectContent>
                  {eventOptions.map((e) => (
                    <SelectItem key={e.key} value={e.key}>{e.label} ({e.key})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Channel</Label>
              <Select value={form.channel} onValueChange={(v) => setForm((f) => ({ ...f, channel: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Language</Label>
              <Input value={form.language} onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label>Subject (optional)</Label>
              <Input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label>Body</Label>
              <Textarea
                rows={5}
                value={form.bodyTemplate}
                onChange={(e) => setForm((f) => ({ ...f, bodyTemplate: e.target.value }))}
                placeholder="Hello {{patientName}}, your appointment with {{doctorName}} on {{scheduledAt}} is confirmed."
                className="font-mono text-sm"
              />
            </div>
            <div className="col-span-2">
              <Label>Variables (comma separated)</Label>
              <Input
                value={form.variables}
                onChange={(e) => setForm((f) => ({ ...f, variables: e.target.value }))}
                placeholder="patientName, doctorName, scheduledAt"
              />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))} />
              <Label>Active</Label>
            </div>

            <div className="col-span-2 border-t pt-3 space-y-2">
              <Label className="flex items-center gap-1"><Eye className="w-3 h-3" /> Preview Variables</Label>
              <div className="grid grid-cols-2 gap-2">
                {Object.keys(previewVars).length === 0 && form.variables
                  .split(",").map((s) => s.trim()).filter(Boolean).map((k) => (
                    <Input
                      key={k}
                      placeholder={k}
                      onChange={(e) => setPreviewVars((p) => ({ ...p, [k]: e.target.value }))}
                    />
                  ))}
                {Object.keys(previewVars).map((k) => (
                  <Input
                    key={k}
                    placeholder={k}
                    value={previewVars[k] ?? ""}
                    onChange={(e) => setPreviewVars((p) => ({ ...p, [k]: e.target.value }))}
                  />
                ))}
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={handlePreview} disabled={!form.bodyTemplate}>
                Preview
              </Button>
              {previewText && (
                <div className="bg-muted/40 border rounded p-3 text-sm whitespace-pre-wrap">{previewText}</div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.eventKey || !form.bodyTemplate || createMut.isPending || updateMut.isPending}>
              {form.id ? "Save Changes" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
