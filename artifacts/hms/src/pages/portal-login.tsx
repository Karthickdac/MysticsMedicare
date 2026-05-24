import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Hospital, Sparkles, ShieldCheck, IdCard, Phone } from "lucide-react";

export default function PortalLogin() {
  const [, setLocation] = useLocation();
  const [mrn, setMrn] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const base = import.meta.env.BASE_URL;
      const res = await fetch(`${base}api/portal/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mrn, phone }),
      });
      if (!res.ok) setError("Invalid UHID or phone number");
      else setLocation("/portal/appointments");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,hsl(252_80%_55%/0.10),transparent_50%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_70%,hsl(195_90%_55%/0.08),transparent_50%)] pointer-events-none" />

      <Card className="w-full max-w-md shadow-xl border-card-border relative">
        <CardHeader className="space-y-3 text-center pb-6">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-brand-gradient text-white flex items-center justify-center shadow-md ring-1 ring-primary/20">
            <Sparkles className="w-7 h-7" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold tracking-tight">Patient Portal</CardTitle>
            <CardDescription className="mt-1">Sign in with your UHID and registered phone</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="mrn">UHID</Label>
              <div className="relative">
                <IdCard className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                <Input id="mrn" className="pl-9 h-11" value={mrn} onChange={(e) => setMrn(e.target.value)} placeholder="UH000041" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <div className="relative">
                <Phone className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                <Input id="phone" className="pl-9 h-11" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91XXXXXXXXXX" required />
              </div>
            </div>
            {error && <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded-md">{error}</div>}
            <Button
              type="submit"
              className="w-full h-11 bg-brand-gradient text-white font-semibold shadow-md hover:opacity-95"
              disabled={loading}
            >
              {loading ? "Signing in…" : "Sign in"}
            </Button>
            <div className="text-xs text-muted-foreground text-center pt-1">
              Demo: any seeded patient's UHID and registered phone.
            </div>
          </form>
        </CardContent>
        <div className="border-t border-border px-6 py-3 flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Secure session</span>
          <a href="/login" className="text-primary hover:underline font-medium flex items-center gap-1"><Hospital className="w-3 h-3" /> Staff sign in</a>
        </div>
      </Card>
    </div>
  );
}
