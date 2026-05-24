import { useState } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Sparkles, Hospital, Lock, Mail, ShieldCheck, Stethoscope, BedDouble, TestTube, IndianRupee } from "lucide-react";

import { useLogin } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const loginMutation = useLogin();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = (data: LoginFormValues) => {
    setError(null);
    loginMutation.mutate(
      { data },
      {
        onSuccess: () => setLocation("/dashboard"),
        onError: (err: any) => setError(err?.message || "Invalid email or password"),
      },
    );
  };

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2 bg-background">
      {/* Left brand panel */}
      <div className="hidden lg:flex relative overflow-hidden bg-sidebar-gradient text-white p-12 flex-col justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,hsl(252_95%_70%/0.25),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_70%,hsl(195_90%_55%/0.18),transparent_50%)]" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-11 h-11 rounded-xl bg-brand-gradient flex items-center justify-center shadow-lg ring-1 ring-white/20">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="font-bold text-xl tracking-tight">Mystics MediCare</div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-white/60 font-semibold">Pro · Clinical OS</div>
            </div>
          </div>

          <h2 className="text-4xl xl:text-5xl font-bold tracking-tight leading-tight mb-4">
            One workspace.<br />
            <span className="text-brand-gradient bg-gradient-to-r from-violet-300 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent">
              Every clinical workflow.
            </span>
          </h2>
          <p className="text-white/70 text-base max-w-md">
            OPD, IPD, pharmacy, labs, billing and patient engagement — built for Indian hospitals.
          </p>
        </div>

        <div className="relative grid grid-cols-2 gap-3 max-w-md">
          <FeaturePill icon={Stethoscope} label="OPD & Encounters" />
          <FeaturePill icon={BedDouble} label="IPD & Beds" />
          <FeaturePill icon={TestTube} label="Labs & Radiology" />
          <FeaturePill icon={IndianRupee} label="GST Billing" />
        </div>

        <div className="relative text-xs text-white/40 flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5" /> HIPAA-aligned · End-to-end audit · Role-based access
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex flex-col items-center mb-8 space-y-2">
            <div className="w-12 h-12 rounded-xl bg-brand-gradient flex items-center justify-center text-white shadow-md">
              <Sparkles className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Mystics MediCare Pro</h1>
          </div>

          <Card className="border-card-border shadow-xl">
            <CardHeader className="space-y-1 pb-6">
              <CardTitle className="text-2xl font-bold tracking-tight">Welcome back</CardTitle>
              <CardDescription>Sign in with your hospital credentials</CardDescription>
            </CardHeader>
            <CardContent>
              {error && (
                <Alert variant="destructive" className="mb-6">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <Label htmlFor="email">Email</Label>
                        <FormControl>
                          <div className="relative">
                            <Mail className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                            <Input id="email" placeholder="doctor@medicare.in" className="pl-9 h-11" data-testid="input-email" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <Label htmlFor="password">Password</Label>
                        <FormControl>
                          <div className="relative">
                            <Lock className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                            <Input id="password" type="password" className="pl-9 h-11" data-testid="input-password" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    className="w-full h-11 mt-2 bg-brand-gradient text-white font-semibold shadow-md hover:opacity-95"
                    disabled={loginMutation.isPending}
                    data-testid="button-submit-login"
                  >
                    {loginMutation.isPending ? "Signing in…" : "Sign in to console"}
                  </Button>
                </form>
              </Form>

              <div className="mt-6 p-3 rounded-lg bg-muted/60 border border-border text-xs text-muted-foreground space-y-1">
                <div className="font-semibold text-foreground">Demo logins</div>
                <div>admin@medicare.in · doctor@medicare.in · nurse@medicare.in</div>
                <div className="opacity-70">Password = role + 123 (e.g. <code className="font-mono">admin123</code>)</div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between border-t border-border pt-5 pb-5 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Hospital className="w-4 h-4" />
                <span>Authorized personnel only</span>
              </div>
              <a href="/portal/login" className="text-primary hover:underline font-medium">Patient login</a>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}

function FeaturePill({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 backdrop-blur-sm">
      <Icon className="w-4 h-4 text-white/70" />
      <span className="text-sm font-medium text-white/90">{label}</span>
    </div>
  );
}
