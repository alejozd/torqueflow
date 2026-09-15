import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTableSkeleton } from "@/components/data-table-skeleton";

export default function SuperAdminAuditoriaLoading() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">Auditoría de plataforma</h1>
        <Skeleton className="h-4 w-64" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Eventos</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTableSkeleton columns={5} />
        </CardContent>
      </Card>
    </div>
  );
}
