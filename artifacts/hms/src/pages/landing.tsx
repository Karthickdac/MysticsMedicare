import { Link } from "wouter";
import { Activity, ShieldCheck, Stethoscope, BedDouble, Receipt, Video } from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  { icon: Stethoscope, title: "OPD & IPD", body: "Token queues, encounter notes, ward & bed map." },
  { icon: BedDouble, title: "Bed Management", body: "Real-time availability across 5 wards, 80 beds." },
  { icon: Receipt, title: "GST Billing", body: "Indian GST-compliant invoices with CGST/SGST/IGST." },
  { icon: Video, title: "Video Recording", body: "Browser-based OPD/IPD recordings stored securely." },
  { icon: ShieldCheck, title: "Role-Based Access", body: "9 roles, full audit trail, bcrypt + session auth." },
  { icon: Activity, title: "WhatsApp & SMS", body: "DB-backed templates, live event log, retry-ready." },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            <span className="text-lg font-semibold">MediCare HMS Plus</span>
          </div>
          <Link href="/login">
            <Button>Staff Sign In</Button>
          </Link>
        </div>
      </header>

      <section className="container mx-auto px-6 py-20 text-center">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
          Complete Hospital Operations, <span className="text-primary">In One Place</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          A modern Hospital Management System for Indian healthcare providers — OPD, IPD,
          pharmacy, labs, radiology, billing and patient communications, GST-ready and
          built for clinical teams.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/login">
            <Button size="lg">Open Dashboard</Button>
          </Link>
          <a href="#features">
            <Button size="lg" variant="outline">Explore Features</Button>
          </a>
        </div>
      </section>

      <section id="features" className="container mx-auto px-6 pb-24">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-lg border bg-card p-6">
              <f.icon className="h-8 w-8 text-primary" />
              <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} MediCare HMS Plus · For Indian healthcare providers
      </footer>
    </div>
  );
}
