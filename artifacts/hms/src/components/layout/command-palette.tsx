import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useListPatients, useMe } from "@workspace/api-client-react";
import {
  Activity, Users, Calendar, Clock, BedDouble, TestTube, Cross,
  ShieldPlus, IndianRupee, Package, Scissors, Syringe, FileSignature,
  ClipboardCheck, Video, MessageSquare, ListTree, UserCog, Settings,
  Bell, UserPlus, FilePlus2, Stethoscope, CalendarPlus, Wallet, BarChart3,
} from "lucide-react";

type NavCmd = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  section: string;
  keywords?: string;
  roles?: string[];
};

const NAV: NavCmd[] = [
  { label: "Dashboard", href: "/dashboard", icon: Activity, section: "Navigate" },
  { label: "Patients", href: "/patients", icon: Users, section: "Navigate", keywords: "patient mrn uhid", roles: ["admin", "doctor", "nurse", "receptionist", "labtech", "pharmacist"] },
  { label: "Appointments", href: "/appointments", icon: Calendar, section: "Navigate", roles: ["admin", "doctor", "nurse", "receptionist"] },
  { label: "OPD Queue", href: "/opd", icon: Clock, section: "Navigate", keywords: "queue token", roles: ["admin", "doctor", "nurse", "receptionist"] },
  { label: "IPD Wards", href: "/ipd", icon: BedDouble, section: "Navigate", keywords: "inpatient", roles: ["admin", "doctor", "nurse"] },
  { label: "Bed Manager", href: "/beds", icon: BedDouble, section: "Navigate", roles: ["admin", "nurse", "doctor", "receptionist"] },
  { label: "Laboratory", href: "/lab", icon: TestTube, section: "Navigate", roles: ["admin", "doctor", "labtech", "nurse"] },
  { label: "Radiology", href: "/radiology", icon: Cross, section: "Navigate", roles: ["admin", "doctor", "nurse"] },
  { label: "Pharmacy", href: "/pharmacy", icon: ShieldPlus, section: "Navigate", roles: ["admin", "pharmacist", "doctor"] },
  { label: "Prescriptions", href: "/prescriptions", icon: ClipboardCheck, section: "Navigate", roles: ["admin", "doctor", "pharmacist", "nurse"] },
  { label: "Billing", href: "/billing", icon: IndianRupee, section: "Navigate", keywords: "invoice gst", roles: ["admin", "accountant", "cashier", "receptionist"] },
  { label: "Cashier Drawer", href: "/billing/cashier", icon: Wallet, section: "Navigate", keywords: "cash session shift close", roles: ["admin", "accountant", "cashier"] },
  { label: "Billing Reports", href: "/billing/reports", icon: BarChart3, section: "Navigate", keywords: "gstr1 collections outstanding csv", roles: ["admin", "accountant"] },
  { label: "Inventory", href: "/inventory", icon: Package, section: "Navigate", roles: ["admin", "pharmacist"] },
  { label: "OT Bookings", href: "/ot", icon: Scissors, section: "Navigate", keywords: "operation theatre surgery", roles: ["admin", "doctor", "nurse"] },
  { label: "Vaccinations", href: "/vaccinations", icon: Syringe, section: "Navigate", roles: ["admin", "doctor", "nurse"] },
  { label: "Consent Forms", href: "/consent", icon: FileSignature, section: "Navigate", roles: ["admin", "doctor", "nurse"] },
  { label: "Checkups", href: "/checkups", icon: Stethoscope, section: "Navigate", roles: ["admin", "doctor", "nurse"] },
  { label: "Video Library", href: "/videos", icon: Video, section: "Navigate", roles: ["admin", "doctor", "nurse"] },
  { label: "Drug Library", href: "/drugs", icon: ShieldPlus, section: "Navigate", roles: ["admin", "pharmacist", "doctor"] },
  { label: "Staff Directory", href: "/staff", icon: UserCog, section: "Navigate", roles: ["admin"] },
  { label: "Duty Roster", href: "/roster", icon: Calendar, section: "Navigate", roles: ["admin", "nurse", "doctor"] },
  { label: "Notification Templates", href: "/notifications/templates", icon: MessageSquare, section: "Navigate", roles: ["admin"] },
  { label: "Notification Log", href: "/notifications/log", icon: Bell, section: "Navigate", roles: ["admin"] },
  { label: "Audit Log", href: "/audit", icon: ListTree, section: "Navigate", roles: ["admin"] },
  { label: "Settings", href: "/settings", icon: Settings, section: "Navigate" },
];

const ACTIONS: NavCmd[] = [
  { label: "Register new patient", href: "/patients/new", icon: UserPlus, section: "Quick actions", roles: ["admin", "doctor", "nurse", "receptionist"] },
  { label: "Book new appointment", href: "/appointments/new", icon: CalendarPlus, section: "Quick actions", keywords: "schedule slot opd visit", roles: ["admin", "doctor", "nurse", "receptionist"] },
  { label: "Create new bill", href: "/billing/new", icon: FilePlus2, section: "Quick actions", keywords: "invoice gst", roles: ["admin", "accountant", "cashier", "receptionist"] },
];

// Roles allowed to look up patients via the palette (avoid PHI leak to billing-only roles).
const PATIENT_LOOKUP_ROLES = new Set(["admin", "doctor", "nurse", "receptionist", "labtech", "pharmacist"]);

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const { data: session } = useMe();
  const role = (session?.role as string | undefined) ?? "";
  const canLookupPatients = PATIENT_LOOKUP_ROLES.has(role);
  const navVisible = NAV.filter((n) => !n.roles || n.roles.includes(role));
  const actionsVisible = ACTIONS.filter((a) => !a.roles || a.roles.includes(role));
  const shouldSearchPatients = open && canLookupPatients && search.length > 1;

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  function go(href: string) {
    onOpenChange(false);
    setTimeout(() => setLocation(href), 30);
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search patients, navigate, or run a command…" value={search} onValueChange={setSearch} />
      <CommandList className="max-h-[440px]">
        <CommandEmpty>No results found.</CommandEmpty>

        {shouldSearchPatients && (
          <PatientResults search={search} onPick={(id) => go(`/patients/${id}`)} />
        )}

        {actionsVisible.length > 0 && (
        <CommandGroup heading="Quick actions">
          {actionsVisible.map((a) => (
            <CommandItem key={a.href} value={`${a.label} ${a.keywords ?? ""}`} onSelect={() => go(a.href)}>
              <a.icon className="w-4 h-4 mr-2 text-primary" />
              {a.label}
            </CommandItem>
          ))}
        </CommandGroup>
        )}

        <CommandSeparator />

        <CommandGroup heading="Navigate">
          {navVisible.map((n) => (
            <CommandItem key={n.href} value={`${n.label} ${n.keywords ?? ""}`} onSelect={() => go(n.href)}>
              <n.icon className="w-4 h-4 mr-2 text-muted-foreground" />
              {n.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

// Patient lookup is split into its own component so the underlying React Query
// only mounts (and hits /api/patients) when the user is authorized AND actively
// searching. This prevents background PHI overfetch for any other role.
function PatientResults({ search, onPick }: { search: string; onPick: (id: number) => void }) {
  const { data: patients } = useListPatients({ search });
  if (!patients || patients.length === 0) return null;
  return (
    <>
      <CommandGroup heading="Patients">
        {patients.slice(0, 6).map((p) => (
          <CommandItem
            key={p.id}
            value={`patient ${p.name} ${p.uhid} ${p.phone}`}
            onSelect={() => onPick(p.id)}
          >
            <Users className="w-4 h-4 mr-2 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{p.name}</div>
              <div className="text-xs text-muted-foreground truncate">{p.uhid} · {p.phone}</div>
            </div>
          </CommandItem>
        ))}
      </CommandGroup>
      <CommandSeparator />
    </>
  );
}

export function useCommandPaletteHotkey(open: () => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        open();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
}
