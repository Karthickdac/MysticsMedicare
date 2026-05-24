import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Hospital } from "lucide-react";

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
      if (!res.ok) {
        setError("Invalid MRN or phone");
      } else {
        setLocation("/portal/appointments");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto bg-primary text-primary-foreground p-3 rounded-xl">
            <Hospital className="w-6 h-6" />
          </div>
          <CardTitle>Patient Portal</CardTitle>
          <div className="text-sm text-muted-foreground">Sign in with your MRN and registered phone</div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="mrn">MRN</Label>
              <Input id="mrn" value={mrn} onChange={(e) => setMrn(e.target.value)} placeholder="MRN00001" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91XXXXXXXXXX" required />
            </div>
            {error && <div className="text-sm text-destructive">{error}</div>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
            <div className="text-xs text-muted-foreground text-center">
              Demo: use any seeded patient's MRN + phone.
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
