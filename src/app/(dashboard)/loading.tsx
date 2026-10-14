import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NavSeccionesDashboard } from "./secciones-dashboard";

/**
 * Skeleton del Inicio: copia la estructura de `page.tsx` (barra de secciones,
 * seis tarjetas, flujo + agenda, facturación, alertas del taller e inventario)
 * para que la página no salte al terminar de cargar. Si cambia la página, este
 * archivo cambia con ella (lo vigila `loading.test.tsx`).
 */
export default function InicioLoading() {
  return (
    <main className="flex flex-col gap-6">
      {/* Saludo + acciones */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>

      {/* La barra es estática: se puede usar ya mientras carga el resto. */}
      <NavSeccionesDashboard />

      {/* Resumen: las mismas seis tarjetas (título + ícono, cifra y una línea abajo) */}
      <div data-skeleton="resumen" className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index} className="h-full w-full">
            <CardContent className="flex flex-col gap-1.5">
              <div className="flex items-start justify-between gap-1.5">
                <Skeleton className="mt-0.5 h-3 w-20" />
                <Skeleton className="size-7 shrink-0 rounded-full" />
              </div>
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-4 w-24" />
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

            {/* Las cuatro órdenes recientes (filas de ~69 px) y el pie "Mostrando las 4…" */}
            <div className="flex flex-col divide-y">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-20" />
                      <Skeleton className="h-5 w-32" />
                    </div>
                    <Skeleton className="h-4 w-56" />
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Skeleton className="h-5 w-20 rounded-full" />
                    <Skeleton className="h-5 w-24" />
                  </div>
                </div>
              ))}
            </div>
            <Skeleton className="mx-auto h-4 w-72" />
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

      {/* Facturación: leyenda, cuatro cifras, gráfico con eje, lectura y tabla */}
      <Card data-skeleton="facturacion">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <CardTitle>Facturación · últimos 7 días</CardTitle>
          <div className="flex items-center gap-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-28" />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} data-skeleton="cifra" className="flex flex-col gap-1">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-7 w-32" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <div className="flex h-44 w-14 shrink-0 flex-col items-end justify-between">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-3 w-9" />
              ))}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="grid h-44 grid-cols-7 items-end">
                {Array.from({ length: 7 }).map((_, index) => (
                  <div key={index} className="flex h-full items-end justify-center">
                    <Skeleton
                      data-skeleton="barra"
                      className="w-6 rounded-b-none"
                      style={{ height: `${25 + ((index * 23) % 65)}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {Array.from({ length: 7 }).map((_, index) => (
                  <div key={index} className="flex justify-center">
                    <Skeleton className="h-3 w-10" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Título de 20 px y tres frases de una línea (20 px), como la lectura real */}
          <div data-skeleton="lectura" className="flex flex-col gap-1.5 rounded-lg border bg-muted/40 p-3">
            <Skeleton className="mb-0.5 h-5 w-40" />
            <Skeleton className="h-5 w-full max-w-2xl" />
            <Skeleton className="h-5 w-full max-w-md" />
            <Skeleton className="h-5 w-full max-w-xl" />
          </div>
          <Skeleton className="h-3 w-36" />
        </CardContent>
      </Card>

      {/* Alertas del taller: contadores y hasta cinco filas */}
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 py-4">
          <CardTitle>Alertas del taller</CardTitle>
          <Skeleton className="h-3 w-40" />
        </CardHeader>
        <div className="flex flex-wrap gap-2 px-4 pb-4">
          <Skeleton className="h-9 w-32 rounded-full" />
          <Skeleton className="h-9 w-32 rounded-full" />
        </div>
        <div className="flex flex-col divide-y border-t">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 px-4 py-2.5">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
        {/* Pie "Mostrando 5 de N · Ver todas" */}
        <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-40" />
        </div>
      </Card>

      {/* Alertas de inventario */}
      <Card className="gap-0 py-0">
        <CardHeader className="py-4">
          <CardTitle>Alertas de inventario</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-1 gap-4 px-4 pb-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
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
        <div className="flex flex-col border-t">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 border-t px-4 py-3 first:border-t-0">
              <Skeleton className="size-11 rounded-full" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-56" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-6 w-20" />
            </div>
          ))}
        </div>
      </Card>
    </main>
  );
}
