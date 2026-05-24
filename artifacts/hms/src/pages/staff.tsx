import { useMemo, useState } from "react";
import {
  useListStaff,
  useCreateStaff,
  useUpdateStaff,
  useDeleteStaff,
  useListRoles,
  getListStaffQueryKey,
  type Staff,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Search, Plus, Pencil, Trash2, UserCog, UserCheck, UserX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const DEPARTMENTS = ["Emergency","ICU","General Medicine","Pediatrics","Cardiology","Orthopedics","Obstetrics","Surgery","Radiology","Pathology","Pharmacy","Administration"];

export default function Staff() {
  const { data: staff, isLoading } = useListStaff();
  const { data: roles } = useListRoles();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editing, setEditing] = useState<Staff | "new" | null>(null);
  const [deleting, setDeleting] = useState<Staff | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (staff ?? []).filter((s) => {
      if (roleFilter !== "all" && s.role !== roleFilter) return false;
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q)
        || s.staffId.toLowerCase().includes(q)
        || s.email.toLowerCase().includes(q)
        || s.phone.toLowerCase().includes(q)
        || s.department.toLowerCase().includes(q);
    });
  }, [staff, search, roleFilter, statusFilter]);

  const updateMut = useUpdateStaff();
  const deleteMut = useDeleteStaff();

  function toggleStatus(p: Staff) {
    const next = p.status === "active" ? "suspended" : "active";
    updateMut.mutate(
      { id: p.id, data: { status: next } },
      {
        onSuccess: () => {
          toast({ title: `Marked ${p.name} as ${next}` });
          qc.invalidateQueries({ queryKey: getListStaffQueryKey() });
        },
        onError: (e) => toast({ title: "Failed", description: (e as Error).message, variant: "destructive" }),
      },
    );
  }

  const stats = useMemo(() => {
    const list = staff ?? [];
    return {
      total: list.length,
      active: list.filter((s) => s.status === "active").length,
      suspended: list.filter((s) => s.status === "suspended").length,
    };
  }, [staff]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><UserCog className="w-6 h-6 text-primary" />Staff Directory</h1>
          <p className="text-muted-foreground">Hospital personnel — onboard, edit, suspend, or remove.</p>
        </div>
        <Button onClick={() => setEditing("new")} data-testid="button-add-staff"><Plus className="w-4 h-4 mr-2" />Add staff</Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total staff" value={stats.total} icon={UserCog} />
        <StatCard label="Active" value={stats.active} icon={UserCheck} tone="text-success" />
        <StatCard label="Suspended" value={stats.suspended} icon={UserX} tone="text-destructive" />
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap gap-2 items-center border-b">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search by name, ID, email, phone…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" data-testid="input-search-staff" />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {(roles ?? []).map((r) => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="on_leave">On leave</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[120px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>)}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="h-32 text-center text-muted-foreground">No staff match the filters</TableCell></TableRow>
              ) : (
                filtered.map((p) => (
                  <TableRow key={p.id} data-testid={`row-staff-${p.id}`}>
                    <TableCell className="font-mono text-xs">{p.staffId}</TableCell>
                    <TableCell className="font-medium">{p.name}{p.specialization && <div className="text-xs text-muted-foreground">{p.specialization}</div>}</TableCell>
                    <TableCell className="capitalize">{p.role}</TableCell>
                    <TableCell>{p.department}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.joiningDate ? new Date(p.joiningDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</TableCell>
                    <TableCell><div className="text-sm">{p.phone}</div><div className="text-xs text-muted-foreground">{p.email}</div></TableCell>
                    <TableCell>
                      <Badge variant={p.status === "active" ? "default" : "secondary"} className="cursor-pointer" onClick={() => toggleStatus(p)} title="Click to toggle">{p.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => setEditing(p)} data-testid={`button-edit-${p.id}`}><Pencil className="w-4 h-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeleting(p)} className="text-destructive" data-testid={`button-delete-${p.id}`}><Trash2 className="w-4 h-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {editing && (
        <StaffDialog
          staff={editing === "new" ? null : editing}
          roles={(roles ?? []).map((r) => r.name)}
          onClose={() => setEditing(null)}
          onSaved={() => { qc.invalidateQueries({ queryKey: getListStaffQueryKey() }); setEditing(null); }}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the staff record. If they have any clinical records (appointments, encounters, admissions) the server will block the delete — suspend the account instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && deleteMut.mutate({ id: deleting.id }, {
                onSuccess: () => { toast({ title: "Staff removed" }); qc.invalidateQueries({ queryKey: getListStaffQueryKey() }); setDeleting(null); },
                onError: (e) => toast({ title: "Cannot delete", description: (e as Error).message, variant: "destructive" }),
              })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone = "text-primary" }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; tone?: string }) {
  return (
    <Card><CardContent className="p-4 flex items-center justify-between">
      <div><div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div><div className="text-2xl font-bold tabular-nums mt-1">{value}</div></div>
      <Icon className={`w-8 h-8 ${tone}`} />
    </CardContent></Card>
  );
}

function StaffDialog({ staff, roles, onClose, onSaved }: { staff: Staff | null; roles: string[]; onClose: () => void; onSaved: () => void }) {
  const isNew = !staff;
  const [name, setName] = useState(staff?.name ?? "");
  const [role, setRole] = useState(staff?.role ?? (roles[0] ?? "doctor"));
  const [department, setDepartment] = useState(staff?.department ?? "General Medicine");
  const [email, setEmail] = useState(staff?.email ?? "");
  const [phone, setPhone] = useState(staff?.phone ?? "");
  const [specialization, setSpecialization] = useState(staff?.specialization ?? "");
  const [joiningDate, setJoiningDate] = useState(staff?.joiningDate ?? new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState(staff?.status ?? "active");
  const { toast } = useToast();
  const create = useCreateStaff();
  const update = useUpdateStaff();
  const pending = create.isPending || update.isPending;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const onError = (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" });
    if (isNew) {
      create.mutate({ data: { name, role, department, email, phone, specialization: specialization || undefined, joiningDate: joiningDate || undefined } }, {
        onSuccess: () => { toast({ title: "Staff added" }); onSaved(); },
        onError,
      });
    } else {
      update.mutate({ id: staff!.id, data: { name, role, department, email, phone, specialization, joiningDate, status } }, {
        onSuccess: () => { toast({ title: "Staff updated" }); onSaved(); },
        onError,
      });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add staff member" : `Edit ${staff!.name}`}</DialogTitle>
          <DialogDescription>{isNew ? "Onboard a new staff member." : "Update profile and assignment."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Full name" required><Input value={name} onChange={(e) => setName(e.target.value)} required data-testid="input-name" /></Field>
            <Field label="Joining date"><Input type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} data-testid="input-joining" /></Field>
            <Field label="Role" required>
              <Select value={role} onValueChange={setRole}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                {roles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent></Select>
            </Field>
            <Field label="Department" required>
              <Select value={department} onValueChange={setDepartment}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                {DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent></Select>
            </Field>
            <Field label="Email" required><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
            <Field label="Phone" required><Input value={phone} onChange={(e) => setPhone(e.target.value)} required /></Field>
            <Field label="Specialization"><Input value={specialization} onChange={(e) => setSpecialization(e.target.value)} placeholder="e.g. Cardiologist" /></Field>
            {!isNew && (
              <Field label="Status">
                <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="on_leave">On leave</SelectItem>
                </SelectContent></Select>
              </Field>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={pending} data-testid="button-save-staff">{pending ? "Saving…" : isNew ? "Add staff" : "Save changes"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}{required && <span className="text-destructive ml-0.5">*</span>}</Label>
      {children}
    </div>
  );
}
