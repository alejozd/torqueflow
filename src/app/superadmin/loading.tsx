import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTableSkeleton } from "@/components/data-table-skeleton";

export default function SuperAdminLoading() {
  return (
    <main className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Talleres</h1>
        <Skeleton className="h-4 w-56" />
      </div>

      {/* Listado Card */}
      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTableSkeleton columns={4} />
        </CardContent>
      </Card>
    </main>
  );
}
