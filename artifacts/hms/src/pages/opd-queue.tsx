import { useGetOpdQueue, useCallNextToken } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { Play, Activity } from "lucide-react";
import { getGetOpdQueueQueryKey } from "@workspace/api-client-react";

export default function OpdQueue() {
  const { data: queue, isLoading } = useGetOpdQueue();
  const callMutation = useCallNextToken();
  const queryClient = useQueryClient();

  const handleCallNext = (tokenId: number) => {
    callMutation.mutate(
      { id: tokenId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetOpdQueueQueryKey() });
        }
      }
    );
  };

  if (isLoading) {
    return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
  }

  // Group by department
  const byDept = queue?.reduce((acc: any, token) => {
    if (!acc[token.department]) acc[token.department] = [];
    acc[token.department].push(token);
    return acc;
  }, {}) || {};

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">OPD Token Queue</h1>
        <p className="text-muted-foreground">Manage outpatient department token calling.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Object.entries(byDept).map(([dept, tokens]: [string, any]) => {
          const called = tokens.filter((t: any) => t.status === 'called');
          const waiting = tokens.filter((t: any) => t.status === 'waiting');

          return (
            <Card key={dept} className="flex flex-col">
              <CardHeader className="bg-primary/5 pb-4 border-b border-border">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="w-5 h-5 text-primary" />
                  {dept}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 flex-1 flex flex-col">
                <div className="p-6 bg-card text-center border-b border-border">
                  <p className="text-sm text-muted-foreground mb-2">CURRENTLY SERVING</p>
                  {called.length > 0 ? (
                    <div className="space-y-4">
                      {called.map((t: any) => (
                        <div key={t.id} className="animate-in fade-in zoom-in duration-500">
                          <h2 className="text-6xl font-black text-primary tracking-tighter">#{t.tokenNumber}</h2>
                          <p className="text-lg font-medium mt-2">{t.patientName}</p>
                          {t.doctorName && <p className="text-sm text-muted-foreground">Dr. {t.doctorName}</p>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-3xl font-bold text-muted-foreground/30 py-4">--</div>
                  )}
                </div>

                <div className="p-4 flex-1 bg-muted/20">
                  <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase mb-3">Waiting ({waiting.length})</p>
                  <div className="space-y-2">
                    {waiting.map((t: any) => (
                      <div key={t.id} className="flex items-center justify-between p-3 bg-card rounded-md border border-border shadow-sm">
                        <div className="flex items-center gap-3">
                          <Badge variant="secondary" className="font-mono text-sm px-2">#{t.tokenNumber}</Badge>
                          <span className="font-medium text-sm">{t.patientName}</span>
                        </div>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-8 px-2 text-primary"
                          onClick={() => handleCallNext(t.id)}
                          disabled={callMutation.isPending}
                        >
                          <Play className="w-4 h-4 mr-1" />
                          Call
                        </Button>
                      </div>
                    ))}
                    {waiting.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">No waiting patients</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
