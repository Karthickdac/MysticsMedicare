import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Hospital, Sparkles, ShieldCheck, IdCard, Phone, KeyRound } from "lucide-react";

const base = import.meta.env.BASE_URL;

type RequestResp = { sent: boolean; devCode?: string };

export default function PortalLogin() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<"request" | "verify">("request");
  const [mrn, setMrn] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setInfo(null); setLoading(true);
    try {
      const res = await fetch(`${base}api/portal/otp/request`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mrn, phone }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Could not send code. Try again.");
        return;
      }
      setDevCode(body.devCode ?? null);
      setStep("verify");
      setInfo(body.devCode
        ? "Code sent. (Demo mode — code shown below.)"
        : "If your details match, a code was sent to your registered phone.");
    } finally { setLoading(false); }
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setLoading(true);
    try {
      const res = await fetch(`${base}api/portal/otp/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mrn, code }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Invalid code");
        return;
      }
      setLocation("/portal/home");
    } finally { setLoading(false); }
  }

  async function onResend() {
    setCode("");
    const fakeEvt = { preventDefault: () => {} } as React.FormEvent;
    await onRequest(fakeEvt);
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
            <CardDescription className="mt-1">
              {step === "request" ? "Enter your UHID and registered phone to receive a one-time code." : "Enter the 6-digit code we just sent."}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {step === "request" ? (
            <form className="space-y-4" onSubmit={onRequest}>
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
              <Button type="submit" className="w-full h-11 bg-brand-gradient text-white font-semibold shadow-md hover:opacity-95" disabled={loading}>
                {loading ? "Sending code…" : "Send one-time code"}
              </Button>
              <div className="text-xs text-muted-foreground text-center pt-1">
                Demo: any seeded patient's UHID and registered phone.
              </div>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={onVerify}>
              <div className="text-sm bg-muted/50 border border-border rounded-md p-3 flex items-start gap-2">
                <KeyRound className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <div>{info}</div>
                  {devCode && (
                    <div className="font-mono text-base tracking-widest text-primary font-bold">{devCode}</div>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">One-time code</Label>
                <Input
                  id="code"
                  className="h-12 text-center text-lg font-mono tracking-[0.4em]"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                />
              </div>
              {error && <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded-md">{error}</div>}
              <Button type="submit" className="w-full h-11 bg-brand-gradient text-white font-semibold shadow-md hover:opacity-95" disabled={loading || code.length < 4}>
                {loading ? "Verifying…" : "Verify & sign in"}
              </Button>
              <div className="flex items-center justify-between text-xs">
                <button type="button" className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline" onClick={() => { setStep("request"); setCode(""); setDevCode(null); setError(null); setInfo(null); }}>
                  ← Use different details
                </button>
                <button type="button" className="text-primary hover:underline" onClick={onResend} disabled={loading}>
                  Resend code
                </button>
              </div>
            </form>
          )}
        </CardContent>
        <div className="border-t border-border px-6 py-3 flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Secure session</span>
          <a href="/login" className="text-primary hover:underline font-medium flex items-center gap-1"><Hospital className="w-3 h-3" /> Staff sign in</a>
        </div>
      </Card>
    </div>
  );
}
