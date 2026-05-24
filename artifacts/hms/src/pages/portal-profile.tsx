import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/primitives/empty-state";
import { User, ShieldCheck, Bell, CheckCircle2, AlertCircle, Mail, MessageSquare } from "lucide-react";
import { PortalShell, useApi, portalApi, fmtDateTime } from "./portal-shell";

type Profile = {
  id: number; name: string; mrn: string; phone: string;
  email: string | null; address: string | null; bloodGroup: string | null;
  allergies: string | null; emergencyContact: string | null;
  insuranceProvider: string | null; insuranceNumber: string | null;
  dob?: string | null; gender?: string | null;
};
type Notif = {
  id: number; eventKey: string; channel: string;
  renderedBody: string; status: string; sentAt: string;
};

// ============================================================================
// Profile editor
// ============================================================================
export function PortalProfile() {
  const { data, loading, setData } = useApi<Profile>("/portal/me", []);
  const [form, setForm] = useState<Partial<Profile>>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => { if (data) { setForm(data); setDirty(false); } }, [data]);

  function set<K extends keyof Profile>(k: K, v: Profile[K] | null) {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  }

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const patch: Record<string, unknown> = {};
      const editable: (keyof Profile)[] = ["name", "email", "address", "bloodGroup", "allergies", "emergencyContact", "insuranceProvider", "insuranceNumber"];
      for (const k of editable) {
        const newVal = form[k] ?? null;
        const oldVal = data?.[k] ?? null;
        if (newVal !== oldVal) patch[k] = newVal === "" ? null : newVal;
      }
      const updated = await portalApi<Profile>("/portal/profile", { method: "PATCH", body: JSON.stringify(patch) });
      setData(updated);
      setDirty(false);
      setMsg({ kind: "ok", text: "Profile updated." });
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally { setBusy(false); }
  }

  return (
    <PortalShell active="profile">
      <h1 className="text-2xl font-bold tracking-tight mb-4">My Profile</h1>
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="border-card-border shadow-sm md:col-span-2">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><User className="w-4 h-4 text-primary" /> Personal details</CardTitle></CardHeader>
          <CardContent>
            {loading || !data ? <Skeleton className="h-64 w-full" /> : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>UHID</Label>
                    <Input value={data.mrn} disabled className="font-mono" />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input value={data.phone} disabled />
                  </div>
                </div>
                <div>
                  <Label>Full name</Label>
                  <Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
                </div>
                <div>
                  <Label>Address</Label>
                  <Textarea rows={2} value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Blood group</Label>
                    <Input value={form.bloodGroup ?? ""} onChange={(e) => set("bloodGroup", e.target.value)} placeholder="O+" />
                  </div>
                  <div>
                    <Label>Emergency contact</Label>
                    <Input value={form.emergencyContact ?? ""} onChange={(e) => set("emergencyContact", e.target.value)} placeholder="Name · +91…" />
                  </div>
                </div>
                <div>
                  <Label>Known allergies</Label>
                  <Textarea rows={2} value={form.allergies ?? ""} onChange={(e) => set("allergies", e.target.value)} placeholder="None known" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Insurance provider</Label>
                    <Input value={form.insuranceProvider ?? ""} onChange={(e) => set("insuranceProvider", e.target.value)} />
                  </div>
                  <div>
                    <Label>Insurance number</Label>
                    <Input value={form.insuranceNumber ?? ""} onChange={(e) => set("insuranceNumber", e.target.value)} className="font-mono" />
                  </div>
                </div>

                {msg && (
                  <div className={`text-sm px-3 py-2 rounded-md flex items-start gap-2 ${msg.kind === "ok" ? "bg-success/10 text-success border border-success/20" : "bg-destructive/10 text-destructive border border-destructive/20"}`}>
                    {msg.kind === "ok" ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                    <span>{msg.text}</span>
                  </div>
                )}

                <div className="flex justify-end">
                  <Button onClick={save} disabled={!dirty || busy} className="bg-brand-gradient text-white">
                    {busy ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-card-border shadow-sm h-fit">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary" /> Account</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Login method</div>
              <div className="font-medium">One-time SMS code</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Phone changes</div>
              <div className="text-muted-foreground text-xs">For security, your registered phone and UHID cannot be edited here — visit the front desk to update them.</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PortalShell>
  );
}

// ============================================================================
// Notifications inbox
// ============================================================================
export function PortalNotifications() {
  const { data, loading } = useApi<Notif[]>("/portal/notifications", []);

  return (
    <PortalShell active="notifications" notifBadge={data?.length}>
      <h1 className="text-2xl font-bold tracking-tight mb-4 flex items-center gap-2"><Bell className="w-6 h-6 text-primary" /> Messages</h1>
      <Card className="border-card-border shadow-sm">
        <CardContent className="space-y-3 pt-6">
          {loading && <Skeleton className="h-32 w-full" />}
          {!loading && data && data.length === 0 && (
            <EmptyState icon={Bell} title="Inbox empty" description="Reminders and clinic updates will appear here." />
          )}
          {data?.map((n) => (
            <div key={n.id} className="flex items-start gap-3 border border-border rounded-lg p-4">
              <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                {n.channel === "email" ? <Mail className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px] capitalize">{n.eventKey.replace(/_/g, " ")}</Badge>
                  <span className="text-xs text-muted-foreground">{fmtDateTime(n.sentAt)}</span>
                  <Badge variant="outline" className={`text-[10px] capitalize ${n.status === "sent" || n.status === "delivered" ? "bg-success/10 text-success border-success/30" : "bg-muted text-muted-foreground"}`}>{n.status}</Badge>
                </div>
                <div className="text-sm mt-1.5 whitespace-pre-wrap text-foreground/90">{n.renderedBody}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </PortalShell>
  );
}
