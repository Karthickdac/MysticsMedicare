import { useState } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Activity, Hospital, Lock, Mail } from "lucide-react";

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
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = (data: LoginFormValues) => {
    setError(null);
    loginMutation.mutate(
      { data },
      {
        onSuccess: () => {
          setLocation("/dashboard");
        },
        onError: (err: any) => {
          setError(err?.message || "Invalid email or password");
        },
      }
    );
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-muted/40 p-4">
      <div className="max-w-md w-full">
        <div className="flex flex-col items-center mb-8 space-y-2">
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center text-primary-foreground shadow-sm mb-2">
            <Activity className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Mystics MediCare Pro</h1>
          <p className="text-muted-foreground text-sm">Clinical Command Center OS</p>
        </div>

        <Card className="border-border shadow-md">
          <CardHeader className="space-y-1 pb-6">
            <CardTitle className="text-xl font-semibold">Sign in to your account</CardTitle>
            <CardDescription>
              Enter your credentials to access the secure clinical portal
            </CardDescription>
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
                          <Input
                            id="email"
                            placeholder="doctor@medicare.in"
                            className="pl-9"
                            data-testid="input-email"
                            {...field}
                          />
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
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password">Password</Label>
                      </div>
                      <FormControl>
                        <div className="relative">
                          <Lock className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                          <Input
                            id="password"
                            type="password"
                            className="pl-9"
                            data-testid="input-password"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full mt-2" 
                  disabled={loginMutation.isPending}
                  data-testid="button-submit-login"
                >
                  {loginMutation.isPending ? "Signing in..." : "Sign in"}
                </Button>
              </form>
            </Form>
          </CardContent>
          <CardFooter className="flex justify-center border-t border-border pt-6 pb-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Hospital className="w-4 h-4" />
              <span>Authorized personnel only</span>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
