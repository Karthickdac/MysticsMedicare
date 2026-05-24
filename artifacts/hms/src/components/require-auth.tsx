import { useEffect } from "react";
import { useLocation } from "wouter";
import { useMe } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const { data, isLoading, isError } = useMe();

  useEffect(() => {
    if (!isLoading && (isError || !data)) {
      setLocation("/login");
    }
  }, [isLoading, isError, data, setLocation]);

  if (isLoading) return <div className="p-6"><Skeleton className="h-screen w-full" /></div>;
  if (!data) return null;
  return <>{children}</>;
}
