import { useMemo, useState } from "react";
import {
  useListRoles,
  useCreateRole,
  useUpdateRole,
  useDeleteRole,
  getListRolesQueryKey,
  type Role,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, Plus, Pencil, Trash2, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Mirrors the server's KNOWN_PERMISSIONS list, grouped for the matrix view.
const PERMISSION_GROUPS: Array<{ label: string; perms: string[] }> = [
  { label: "Patients", perms: ["patient.read","patient.write","patient.delete"] },
  { label: "Appointments", perms: ["appointment.read","appointment.write","appointment.cancel"] },
  { label: "Encounters", perms: ["encounter.read","encounter.write"] },
  { label: "Lab", perms: ["lab.read","lab.order","lab.result","lab.verify"] },
  { label: "Radiology", perms: ["radiology.read","radiology.order","radiology.report","radiology.verify"] },
  { label: "Prescriptions", perms: ["prescription.read","prescription.write","prescription.dispense"] },
  { label: "Pharmacy", perms: ["pharmacy.read","pharmacy.sell","pharmacy.purchase","pharmacy.grn"] },
  { label: "Billing", perms: ["billing.read","billing.create","billing.collect","billing.refund","billing.void","billing.claim"] },
  { label: "IPD", perms: ["ipd.admit","ipd.discharge","ipd.nursing","ipd.rounds"] },
  { label: "OT", perms: ["ot.read","ot.book","ot.complete"] },
  { label: "Inventory", perms: ["inventory.read","inventory.write"] },
  { label: "Vaccination & Consent", perms: ["vaccination.read","vaccination.write","consent.read","consent.write"] },
  { label: "Vitals & Videos", perms: ["vitals.read","vitals.write","videos.read","videos.upload"] },
  { label: "Roster & Staff", perms: ["roster.read","roster.write","staff.read","staff.write"] },
  { label: "Reports & Admin", perms: ["reports.read","reports.export","admin.settings","admin.roles","admin.audit","admin.notifications"] },
];
const ALL_PERMS = PERMISSION_GROUPS.flatMap((g) => g.perms);

export default function Roles() {
  const { data: roles, isLoading } = useListRoles();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Role | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();
  const update = useUpdateRole();
  const deleteMut = useDeleteRole();

  const selected = useMemo(() => (roles ?? []).find((r) => r.id === selectedId) ?? roles?.[0] ?? null, [roles, selectedId]);

  function togglePerm(perm: string) {
    if (!selected) return;
    const has = selected.permissions.includes(perm);
    const next = has ? selected.permissions.filter((p) => p !== perm) : [...selected.permissions, perm];
    update.mutate({ id: selected.id, data: { permissions: next } }, {
      onSuccess: () => qc.invalidateQueries({ queryKey: getListRolesQueryKey() }),
      onError: (e) => toast({ title: "Failed", description: (e as Error).message, variant: "destructive" }),
    });
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Shield className="w-6 h-6 text-primary" />Roles & permissions</h1>
          <p className="text-muted-foreground">The matrix below is the source of truth — every API route checks the caller's permissions against this table (cached ~60s). Toggle a permission to grant or revoke server access in real time.</p>
        </div>
        <Button onClick={() => setCreating(true)} data-testid="button-add-role"><Plus className="w-4 h-4 mr-2" />Add custom role</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Roles</CardTitle></CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-3 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (
              <ul className="divide-y">
                {(roles ?? []).map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => setSelectedId(r.id)}
                      className={`w-full text-left px-3 py-2.5 hover:bg-muted/40 flex items-center justify-between gap-2 ${selected?.id === r.id ? "bg-muted/60" : ""}`}
                      data-testid={`button-role-${r.name}`}
                    >
                      <div className="min-w-0">
                        <div className="font-medium capitalize truncate flex items-center gap-1.5">
                          {r.isBuiltin && <Lock className="w-3 h-3 text-muted-foreground" />}
                          {r.name}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{r.permissions.length} permissions</div>
                      </div>
                      {r.isBuiltin && <Badge variant="outline" className="text-[9px]">built-in</Badge>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          {!selected ? (
            <CardContent className="p-8 text-center text-muted-foreground">Select a role to view its permission matrix.</CardContent>
          ) : (
            <>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle className="capitalize flex items-center gap-2">
                    {selected.isBuiltin && <Lock className="w-4 h-4 text-muted-foreground" />}
                    {selected.name}
                  </CardTitle>
                  <CardDescription>{selected.description || "No description."}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <RoleEditButton role={selected} onSaved={() => qc.invalidateQueries({ queryKey: getListRolesQueryKey() })} />
                  {!selected.isBuiltin && (
                    <Button size="icon" variant="ghost" onClick={() => setDeleting(selected)} className="text-destructive"><Trash2 className="w-4 h-4" /></Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-xs text-muted-foreground flex justify-between items-center">
                  <span>Click a permission to toggle.</span>
                  <span>{selected.permissions.length} / {ALL_PERMS.length} granted</span>
                </div>
                <div className="space-y-4">
                  {PERMISSION_GROUPS.map((g) => (
                    <div key={g.label}>
                      <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">{g.label}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {g.perms.map((p) => {
                          const on = selected.permissions.includes(p);
                          return (
                            <button
                              key={p}
                              onClick={() => togglePerm(p)}
                              disabled={update.isPending}
                              className={`text-xs px-2 py-1 rounded-md border transition ${on ? "bg-primary/10 border-primary/40 text-primary" : "bg-muted/30 border-border text-muted-foreground hover:bg-muted"}`}
                              data-testid={`perm-${p}`}
                            >{p}</button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground border-l-2 border-primary/50 pl-3 bg-primary/5 py-2 rounded-r">
                  <strong>How this is enforced:</strong> every API route declares the permission it needs via <code>requirePermission(…)</code>. The server resolves the caller's role from this matrix (cached for 60 s with a built-in fallback), so toggles here propagate to the API within a minute — no app restart required. Staff records FK-reference this role list, so a role in use cannot be deleted.
                </p>
              </CardContent>
            </>
          )}
        </Card>
      </div>

      {creating && (
        <CreateRoleDialog onClose={() => setCreating(false)} onSaved={() => { qc.invalidateQueries({ queryKey: getListRolesQueryKey() }); setCreating(false); }} />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete role "{deleting?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>The role will be removed. If any staff member is currently assigned this role, the delete is blocked.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleting && deleteMut.mutate({ id: deleting.id }, {
                onSuccess: () => { toast({ title: "Role deleted" }); qc.invalidateQueries({ queryKey: getListRolesQueryKey() }); setDeleting(null); setSelectedId(null); },
                onError: (e) => toast({ title: "Cannot delete", description: (e as Error).message, variant: "destructive" }),
              })}
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RoleEditButton({ role, onSaved }: { role: Role; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState(role.description ?? "");
  const update = useUpdateRole();
  const { toast } = useToast();
  return (
    <>
      <Button size="icon" variant="ghost" onClick={() => { setDesc(role.description ?? ""); setOpen(true); }}><Pencil className="w-4 h-4" /></Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit "{role.name}"</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider">Description</Label>
              <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => update.mutate({ id: role.id, data: { description: desc } }, {
              onSuccess: () => { toast({ title: "Role updated" }); onSaved(); setOpen(false); },
              onError: (e) => toast({ title: "Failed", description: (e as Error).message, variant: "destructive" }),
            })} disabled={update.isPending}>{update.isPending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CreateRoleDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [perms, setPerms] = useState<string[]>([]);
  const create = useCreateRole();
  const { toast } = useToast();
  function toggle(p: string) { setPerms((s) => s.includes(p) ? s.filter((x) => x !== p) : [...s, p]); }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate({ data: { name: name.trim().toLowerCase().replace(/\s+/g, "_"), description, permissions: perms } }, {
      onSuccess: () => { toast({ title: "Role created" }); onSaved(); },
      onError: (e) => toast({ title: "Failed", description: (e as Error).message, variant: "destructive" }),
    });
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New custom role</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs uppercase tracking-wider">Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. ward_supervisor" required /></div>
            <div className="space-y-1.5"><Label className="text-xs uppercase tracking-wider">Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          </div>
          <div className="space-y-2 max-h-[300px] overflow-y-auto border rounded p-3">
            {PERMISSION_GROUPS.map((g) => (
              <div key={g.label}>
                <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">{g.label}</div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {g.perms.map((p) => {
                    const on = perms.includes(p);
                    return <button type="button" key={p} onClick={() => toggle(p)} className={`text-xs px-2 py-1 rounded-md border ${on ? "bg-primary/10 border-primary/40 text-primary" : "bg-muted/30 border-border text-muted-foreground hover:bg-muted"}`}>{p}</button>;
                  })}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={create.isPending || !name.trim()}>{create.isPending ? "Creating…" : "Create role"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
