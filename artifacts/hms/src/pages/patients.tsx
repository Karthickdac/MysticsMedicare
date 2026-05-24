import { useMemo, useState } from "react";
import { useListPatients, type Patient } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Plus, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/primitives/page-header";
import { FilterBar } from "@/components/primitives/filter-bar";
import { DataTable, type Column } from "@/components/primitives/data-table";
import { EmptyState } from "@/components/primitives/empty-state";

export default function Patients() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [gender, setGender] = useState<string>("");
  const { data: patients, isLoading } = useListPatients({ search: search || undefined });

  const filtered = useMemo(() => {
    if (!gender) return patients;
    return patients?.filter((p) => p.gender?.toLowerCase().startsWith(gender.toLowerCase()));
  }, [patients, gender]);

  const cols: Column<Patient>[] = [
    {
      key: "uhid",
      header: "UHID",
      cell: (p) => <span className="font-mono text-xs font-medium">{p.uhid}</span>,
      exportValue: (p) => p.uhid,
    },
    {
      key: "patient",
      header: "Patient",
      cell: (p) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-brand-gradient text-white flex items-center justify-center font-bold text-xs shrink-0">
            {p.name.substring(0, 2).toUpperCase()}
          </div>
          <span className="font-medium">{p.name}</span>
        </div>
      ),
      exportValue: (p) => p.name,
    },
    {
      key: "ag",
      header: "Age / Sex",
      cell: (p) => <span className="text-sm">{p.age}y · <span className="uppercase">{p.gender?.[0] ?? "—"}</span></span>,
      exportValue: (p) => `${p.age}y / ${p.gender ?? ""}`,
    },
    {
      key: "phone",
      header: "Contact",
      cell: (p) => <span className="font-mono text-xs">{p.phone}</span>,
      exportValue: (p) => p.phone,
    },
    {
      key: "registered",
      header: "Registered",
      cell: (p) => (
        <span className="text-muted-foreground text-sm">
          {new Date(p.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
        </span>
      ),
      exportValue: (p) => new Date(p.createdAt).toISOString().slice(0, 10),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (p) => (
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/patients/${p.id}`}>View</Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <PageHeader
        eyebrow="Records"
        title="Patients"
        description="Search, register, and manage patient records."
        icon={Users}
        actions={
          <Button asChild className="bg-brand-gradient text-white shadow-md hover:opacity-95">
            <Link href="/patients/new"><Plus className="w-4 h-4 mr-2" />Register Patient</Link>
          </Button>
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by UHID, name, or phone…"
        hasFilters={!!gender}
        onClear={() => setGender("")}
      >
        {(["male", "female", "other"] as const).map((g) => {
          const active = gender === g;
          return (
            <button
              key={g}
              type="button"
              aria-pressed={active}
              onClick={() => setGender(active ? "" : g)}
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-foreground hover:bg-muted/70"
              }`}
            >
              {g}
            </button>
          );
        })}
      </FilterBar>

      <DataTable
        columns={cols}
        data={filtered}
        loading={isLoading}
        rowKey={(p) => p.id}
        pageSize={25}
        exportable
        csvName="patients.csv"
        onRowClick={(p) => setLocation(`/patients/${p.id}`)}
        empty={
          <EmptyState
            icon={UserPlus}
            title="No patients found"
            description={search ? `No results for "${search}".` : "Register your first patient to get started."}
            action={<Button asChild><Link href="/patients/new"><Plus className="w-4 h-4 mr-2" />Register Patient</Link></Button>}
          />
        }
      />
    </div>
  );
}
