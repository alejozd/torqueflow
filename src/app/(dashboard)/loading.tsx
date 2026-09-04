import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function InicioLoading() {
  return (
    <main className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Card key={index}>
            <CardHeader>
              <Skeleton className="h-3.5 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Flujo del taller + Agenda de hoy */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Flujo del taller</CardTitle>
            <Skeleton className="h-4 w-40" />
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Skeleton className="h-2 w-full rounded-full" />

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="flex flex-col gap-1.5">
                  <Skeleton className="h-6 w-8" />
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="flex items-center justify-between gap-3 py-1">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-16" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-8 w-20" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Agenda de hoy</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-24 w-full rounded-lg" />
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Facturación · últimos 7 días */}
      <Card>
        <CardHeader>
          <CardTitle>Facturación · últimos 7 días</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-32 items-end gap-3">
            {Array.from({ length: 7 }).map((_, index) => (
              <div key={index} className="flex flex-1 flex-col items-center gap-1.5">
                <Skeleton className="w-full" style={{ height: `${30 + ((index * 13) % 70)}%` }} />
                <Skeleton className="h-3 w-8" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Alertas de inventario */}
      <Card>
        <CardHeader>
          <CardTitle>Alertas de inventario</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-3.5 w-56" />
                <Skeleton className="h-3.5 w-12" />
              </div>
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
