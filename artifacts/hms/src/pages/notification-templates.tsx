import { useListNotificationTemplates, useGetNotificationTemplate, useUpdateNotificationTemplate, usePreviewNotificationTemplate } from "@workspace/api-client-react";
import { getListNotificationTemplatesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { MessageSquare, MessageCircle, Settings2, Phone } from "lucide-react";

export default function NotificationTemplates() {
  const { data: templates, isLoading } = useListNotificationTemplates({});
  const queryClient = useQueryClient();

  if (isLoading) {
    return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
  }

  // Group by eventKey
  const grouped = templates?.reduce((acc: any, t) => {
    if (!acc[t.eventKey]) acc[t.eventKey] = [];
    acc[t.eventKey].push(t);
    return acc;
  }, {}) || {};

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-primary" />
            Message Templates
          </h1>
          <p className="text-muted-foreground">Manage automated SMS and WhatsApp notifications.</p>
        </div>
        <Button>New Template</Button>
      </div>

      <div className="space-y-8">
        {Object.entries(grouped).map(([eventKey, groupTemplates]: [string, any]) => (
          <div key={eventKey} className="space-y-4">
            <h2 className="text-lg font-semibold tracking-tight px-1 flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-muted-foreground" />
              Event: {eventKey}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {groupTemplates.map((t: any) => (
                <Card key={t.id} className={`border-l-4 ${t.channel === 'whatsapp' ? 'border-l-emerald-500' : 'border-l-blue-500'}`}>
                  <CardHeader className="pb-3 border-b border-border bg-card/50">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {t.channel === 'whatsapp' ? <MessageCircle className="w-4 h-4 text-emerald-600" /> : <Phone className="w-4 h-4 text-blue-600" />}
                        <CardTitle className="text-base capitalize">{t.channel}</CardTitle>
                        <Badge variant={t.isActive ? "default" : "secondary"} className="ml-2">
                          {t.isActive ? "Active" : "Disabled"}
                        </Badge>
                      </div>
                      <Button variant="ghost" size="sm">Edit</Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    <div className="bg-muted/30 p-3 rounded-md font-mono text-sm whitespace-pre-wrap text-foreground/80">
                      {t.bodyTemplate}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {t.variables.map((v: string) => (
                        <Badge key={v} variant="outline" className="text-[10px] px-1.5 py-0">
                          {v}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
