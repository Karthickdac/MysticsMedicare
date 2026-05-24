import { useListStaff } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function Staff() {
  const { data: staff, isLoading } = useListStaff();

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Staff Directory</h1>
        <p className="text-muted-foreground">Manage hospital personnel.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Personnel List</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
                  </TableRow>
                ))
              ) : staff?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    No staff found
                  </TableCell>
                </TableRow>
              ) : (
                staff?.map((person) => (
                  <TableRow key={person.id}>
                    <TableCell className="font-mono text-xs">{person.staffId}</TableCell>
                    <TableCell className="font-medium">{person.name}</TableCell>
                    <TableCell className="capitalize">{person.role}</TableCell>
                    <TableCell>{person.department}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{person.phone}</span>
                        <span className="text-xs text-muted-foreground">{person.email}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={person.status === 'active' ? 'default' : 'secondary'}>
                        {person.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
