import Link from "next/link";
import { requireSession } from "@/lib/auth/guards";
import { getDashboardOverview } from "@/app/actions/dashboard-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EstadoCita, EstadoOrden } from "@/generated/prisma-tenant";

const formatoFechaLarga = new Intl.DateTimeFormat("es-CO", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "America/Bogota",
});

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const ESTADO_ORDEN_LABELS: Record<EstadoOrden, string> = {
  BORRADOR: "Borrador",
  EN_PROCESO: "En proceso",
  TERMINADA: "Terminada",
  ENTREGADA: "Entregada",
  ANULADA: "Anulada",
};

const ESTADO_ORDEN_BADGE: Record<EstadoOrden, "secondary" | "default" | "outline" | "destructive"> = {
  BORRADOR: "outline",
  EN_PROCESO: "secondary",
  TERMINADA: "default",
  ENTREGADA: "default",
  ANULADA: "destructive",
};

const ESTADO_CITA_LABELS: Record<EstadoCita, string> = {
  PROGRAMADA: "Programada",
  CONFIRMADA: "Confirmada",
  CANCELADA: "Cancelada",
  COMPLETADA: "Completada",
};

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export default async function InicioPage() {
  const [session, overview] = await Promise.all([requireSession(), getDashboardOverview()]);

  const nombre = session.user.name ?? session.user.email;
  const flujoTotal =
    overview.flujo.borrador + overview.flujo.enProceso + overview.flujo.terminadas + overview.flujo.entregadasHoy;
  const facturacionMax = Math.max(1, ...overview.facturacion7Dias.map((dia) => dia.total));

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Buenos días, {nombre}</h1>
          <p className="text-sm text-muted-foreground">{capitalizar(formatoFechaLarga.format(new Date()))}</p>
          <p className="text-sm text-muted-foreground">
            Sede {session.user.sedeActivaNombre} · {overview.enTaller.total} órdenes en el taller ·{" "}
            {overview.citasHoy.total} citas de hoy
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/*
            There is no standalone "create orden" route: an orden is always
            created from the vehículo it belongs to
            (src/app/(dashboard)/vehiculos/[id]/nueva-orden-form.tsx). /clientes
            is the real first step of that flow (find the client, open their
            vehículo, create the orden there) -- linking anywhere else here
            would be a dead end or a fabricated modal.
          */}
          <Link href="/clientes" className={buttonVariants({})}>
            Nueva orden
          </Link>
          <Link href="/citas" className={buttonVariants({ variant: "outline" })}>
            Agendar cita
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">En el taller</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <span className="font-mono text-2xl font-semibold">{overview.enTaller.total}</span>
            {overview.enTaller.terminadasHoy > 0 ? (
              <span className="text-xs text-muted-foreground">{overview.enTaller.terminadasHoy} terminadas hoy</span>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Citas de hoy</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <span className="font-mono text-2xl font-semibold">{overview.citasHoy.total}</span>
            {overview.citasHoy.proxima ? (
              <span className="font-mono text-xs text-muted-foreground">
                Próxima {overview.citasHoy.proxima.hora} · {overview.citasHoy.proxima.placa}
              </span>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Por facturar</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <span className="font-mono text-2xl font-semibold">{overview.porFacturar.count}</span>
            {overview.porFacturar.count > 0 ? (
              <span className="font-mono text-xs text-muted-foreground">{formatoMoneda.format(overview.porFacturar.monto)}</span>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Cartera</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <span className="font-mono text-2xl font-semibold text-[oklch(0.5_0.2_27)]">
              {formatoMoneda.format(overview.cartera.saldoPendiente)}
            </span>
            {overview.cartera.facturasPendientes > 0 ? (
              <span className="text-xs text-muted-foreground">{overview.cartera.facturasPendientes} facturas pendientes</span>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Stock bajo</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <span className="font-mono text-2xl font-semibold">{overview.stockBajo.count}</span>
            {overview.stockBajo.sinExistencias > 0 ? (
              <span className="text-xs text-[oklch(0.5_0.2_27)]">{overview.stockBajo.sinExistencias} sin existencias</span>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Flujo del taller</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
              {flujoTotal > 0 ? (
                <>
                  <div className="h-full bg-[oklch(0.556_0_0)]" style={{ width: `${(overview.flujo.borrador / flujoTotal) * 100}%` }} />
                  <div className="h-full bg-[oklch(0.44_0.12_250)]" style={{ width: `${(overview.flujo.enProceso / flujoTotal) * 100}%` }} />
                  <div className="h-full bg-primary" style={{ width: `${(overview.flujo.terminadas / flujoTotal) * 100}%` }} />
                  <div className="h-full bg-[oklch(0.4_0.1_150)]" style={{ width: `${(overview.flujo.entregadasHoy / flujoTotal) * 100}%` }} />
                </>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="flex flex-col gap-0.5">
                <span className="font-mono text-lg font-semibold">{overview.flujo.borrador}</span>
                <span className="text-xs text-muted-foreground">Borrador</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="font-mono text-lg font-semibold">{overview.flujo.enProceso}</span>
                <span className="text-xs text-muted-foreground">En proceso</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="font-mono text-lg font-semibold">{overview.flujo.terminadas}</span>
                <span className="text-xs text-muted-foreground">Terminadas</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="font-mono text-lg font-semibold">{overview.flujo.entregadasHoy}</span>
                <span className="text-xs text-muted-foreground">Entregadas hoy</span>
              </div>
            </div>

            <div className="flex flex-col divide-y">
              {overview.ordenesRecientes.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">No hay órdenes recientes en esta sede.</p>
              ) : (
                overview.ordenesRecientes.map((orden) => (
                  <Link
                    key={orden.id}
                    href={`/ordenes/${orden.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm hover:bg-muted/50"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono font-medium">{orden.placa}</span>
                      <span className="text-xs text-muted-foreground">
                        {orden.clienteNombre} · {orden.mecanicoNombre ?? "Sin asignar"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={ESTADO_ORDEN_BADGE[orden.estado]}>{ESTADO_ORDEN_LABELS[orden.estado]}</Badge>
                      <span className="font-mono text-sm">{formatoMoneda.format(orden.total)}</span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Agenda de hoy</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {overview.agendaHoy.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">No hay citas agendadas hoy en esta sede.</p>
            ) : (
              overview.agendaHoy.map((cita) => (
                <div key={cita.id} className="flex flex-col gap-1 py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-medium">{cita.hora}</span>
                    <Badge variant={cita.estado === "CANCELADA" ? "destructive" : "outline"}>
                      {ESTADO_CITA_LABELS[cita.estado]}
                    </Badge>
                  </div>
                  <span className="font-mono text-xs">{cita.placa}</span>
                  <span className="text-xs text-muted-foreground">
                    {cita.motivo} · {cita.clienteNombre}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Facturación · últimos 7 días</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-32 items-end gap-3">
            {overview.facturacion7Dias.map((dia) => (
              <div key={dia.fecha} className="flex flex-1 flex-col items-center gap-1.5">
                <div
                  className="w-full min-w-2 rounded-t-sm bg-primary/80"
                  style={{ height: `${Math.max(4, (dia.total / facturacionMax) * 100)}%` }}
                  title={formatoMoneda.format(dia.total)}
                />
                <span className="text-[0.6875rem] text-muted-foreground">
                  {new Date(`${dia.fecha}T00:00:00.000Z`).toLocaleDateString("es-CO", {
                    day: "2-digit",
                    month: "2-digit",
                    timeZone: "UTC",
                  })}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Alertas de inventario</CardTitle>
          <Link href="/repuestos" className="text-sm text-primary hover:underline">
            Ver repuestos →
          </Link>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {overview.alertasInventario.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">No hay repuestos con stock bajo en esta sede.</p>
          ) : (
            overview.alertasInventario.map((repuesto) => {
              const ratio = repuesto.stockMinimo > 0 ? repuesto.stockActual / repuesto.stockMinimo : 0;
              return (
                <div key={repuesto.id} className="flex flex-col gap-1.5 py-2.5 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="font-mono text-xs text-muted-foreground">{repuesto.codigo}</span> — {repuesto.nombre}
                    </span>
                    <span className="font-mono text-xs">
                      {repuesto.stockActual}/{repuesto.stockMinimo}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", repuesto.stockActual === 0 ? "bg-[oklch(0.5_0.2_27)]" : "bg-[oklch(0.7_0.15_60)]")}
                      style={{ width: `${Math.min(100, ratio * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </main>
  );
}
