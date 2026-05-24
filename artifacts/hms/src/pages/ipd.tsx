import { useListBeds } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BedDouble } from "lucide-react";

export default function Ipd() {
  const { data: beds, isLoading } = useListBeds();

  if (isLoading) {
    return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
  }

  const byWard = beds?.reduce((acc: any, bed) => {
    if (!acc[bed.ward]) acc[bed.ward] = [];
    acc[bed.ward].push(bed);
    return acc;
  }, {}) || {};

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
      case 'occupied': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'cleaning': return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      case 'maintenance': return 'bg-red-500/10 text-red-600 border-red-500/20';
      default: return 'bg-gray-500/10 text-gray-600 border-gray-500/20';
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">IPD Bed Map</h1>
        <p className="text-muted-foreground">In-patient department bed occupancy and management.</p>
      </div>

      <div className="space-y-8">
        {Object.entries(byWard).map(([ward, wardBeds]: [string, any]) => (
          <div key={ward}>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <BedDouble className="w-5 h-5 text-primary" />
              Ward: {ward}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
              {wardBeds.map((bed: any) => (
                <Card key={bed.id} className={`border hover:shadow-md transition-shadow cursor-pointer ${getStatusColor(bed.status)}`}>
                  <CardContent className="p-4 flex flex-col items-center justify-center text-center h-32 relative">
                    <span className="text-xs font-semibold absolute top-2 left-2 opacity-50">{bed.code}</span>
                    <BedDouble className="w-8 h-8 mb-2 opacity-80" />
                    {bed.patientName ? (
                      <div className="space-y-1 w-full">
                        <p className="text-sm font-bold truncate px-1">{bed.patientName}</p>
                        <p className="text-[10px] uppercase tracking-wider opacity-70 truncate px-1">
                          Admitted {new Date(bed.admittedAt).toLocaleDateString()}
                        </p>
                      </div>
                    ) : (
                      <span className="text-xs font-semibold uppercase tracking-wider opacity-70">{bed.status}</span>
                    )}
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
