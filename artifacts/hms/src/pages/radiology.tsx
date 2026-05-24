import { useListRadiologyOrders } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Cross } from "lucide-react";

export default function Radiology() {
  const { data: orders, isLoading } = useListRadiologyOrders({});

  if (isLoading) {
    return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
  }

  const pending = orders?.filter(o => o.status === 'pending') || [];
  const completed = orders?.filter(o => o.status === 'completed') || [];

  const renderColumn = (title: string, items: any[]) => (
    <Card className="bg-muted/30 border-dashed">
      <CardHeader className="pb-3 border-b border-border bg-card">
        <CardTitle className="text-base flex items-center justify-between">
          {title}
          <Badge variant="secondary">{items.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        {items.map(order => (
          <Card key={order.id} className="shadow-sm">
            <CardContent className="p-3 space-y-2">
              <div className="flex justify-between items-start">
                <span className="font-semibold text-sm">{order.modality} - {order.bodyPart}</span>
                <span className="text-xs text-muted-foreground">{new Date(order.createdAt).toLocaleDateString()}</span>
              </div>
              <p className="text-sm font-medium">{order.patientName}</p>
            </CardContent>
          </Card>
        ))}
        {items.length === 0 && (
          <div className="text-center p-4 text-muted-foreground text-sm border border-dashed rounded-md">Empty</div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Cross className="w-6 h-6 text-primary" />
          Radiology Board
        </h1>
        <p className="text-muted-foreground">Manage and track imaging orders.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {renderColumn("Pending", pending)}
        {renderColumn("Completed", completed)}
      </div>
    </div>
  );
}
