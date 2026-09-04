import Link from "next/link";
import { AlertCircle, CalendarCheck, ChevronRight, FileText, Package, Wrench } from "lucide-react";
import { requireSession } from "@/lib/auth/guards";
import { getDashboardOverview } from "@/app/actions/dashboard-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { KPI_TONE, KpiCard } from "@/components/ui/kpi-card";
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

// Timeline dot + tinted status badge per cita, in the Agenda de hoy panel.
// CONFIRMADA/PROGRAMADA colors per spec; CANCELADA reuses the destructive red
// already used everywhere else in the app, COMPLETADA is neutral gray (done,
// no action needed).
const ESTADO_CITA_TONO: Record<EstadoCita, { dot: string; badge: string }> = {
  PROGRAMADA: {
    dot: "bg-amber-500",
    badge: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  },
  CONFIRMADA: {
    dot: "bg-green-500",
    badge: "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  },
  COMPLETADA: {
    dot: "bg-gray-400",
    badge: "bg-gray-50 text-gray-700 dark:bg-gray-500/15 dark:text-gray-300",
  },
  CANCELADA: {
    dot: "bg-red-500",
    badge: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  },
};

const PLACA_CON_GUION = /^([A-Za-z]{3})(\d{3})$/;

/** "xyz789" -> "XYZ-789". Only the common 3-letter+3-digit shape gets a dash; anything else is just uppercased. */
function formatoPlaca(placa: string): string {
  const match = placa.match(PLACA_CON_GUION);
  return match ? `${match[1]}-${match[2]}`.toUpperCase() : placa.toUpperCase();
}

/** "14:30" -> "02:30 PM". `hora` is already a formatted "HH:MM" string from getDashboardOverview. */
function formatoHora12h(hora24: string): string {
  const [horas, minutos] = hora24.split(":").map(Number);
  const periodo = horas >= 12 ? "PM" : "AM";
  const horas12 = horas % 12 === 0 ? 12 : horas % 12;
  return `${String(horas12).padStart(2, "0")}:${String(minutos).padStart(2, "0")} ${periodo}`;
}

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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          title="En el taller"
          value={overview.enTaller.total}
          subtitle={overview.enTaller.terminadasHoy > 0 ? `${overview.enTaller.terminadasHoy} terminadas hoy` : undefined}
          icon={<Wrench className={cn("size-5", KPI_TONE.info.icon)} />}
          iconBgColor={KPI_TONE.info.iconBg}
          className={KPI_TONE.info.cardBg}
        />

        <KpiCard
          title="Citas de hoy"
          value={overview.citasHoy.total}
          subtitle={
            overview.citasHoy.proxima
              ? `Próxima ${overview.citasHoy.proxima.hora} · ${overview.citasHoy.proxima.placa}`
              : undefined
          }
          icon={<CalendarCheck className={cn("size-5", KPI_TONE.info.icon)} />}
          iconBgColor={KPI_TONE.info.iconBg}
          className={KPI_TONE.info.cardBg}
        />

        <KpiCard
          title="Por facturar"
          value={overview.porFacturar.count}
          valueColor="warning"
          subtitle={overview.porFacturar.count > 0 ? formatoMoneda.format(overview.porFacturar.monto) : undefined}
          subtitleColor="warning"
          highlight={overview.porFacturar.count > 0}
          icon={<FileText className={cn("size-5", KPI_TONE.warning.icon)} />}
          iconBgColor={KPI_TONE.warning.iconBg}
          className={KPI_TONE.warning.cardBg}
        />

        <KpiCard
          title="Cartera"
          value={formatoMoneda.format(overview.cartera.saldoPendiente)}
          valueColor="warning"
          subtitle={overview.cartera.facturasPendientes > 0 ? `${overview.cartera.facturasPendientes} facturas pendientes` : undefined}
          subtitleColor="warning"
          highlight={overview.cartera.facturasPendientes > 0}
          icon={<AlertCircle className={cn("size-5", KPI_TONE.warning.icon)} />}
          iconBgColor={KPI_TONE.warning.iconBg}
          className={KPI_TONE.warning.cardBg}
        />

        <KpiCard
          title="Stock bajo"
          value={overview.stockBajo.count}
          valueColor="danger"
          subtitle={overview.stockBajo.sinExistencias > 0 ? `${overview.stockBajo.sinExistencias} sin existencias` : undefined}
          subtitleColor="danger"
          highlight={overview.stockBajo.sinExistencias > 0}
          icon={<Package className={cn("size-5", KPI_TONE.danger.icon)} />}
          iconBgColor={KPI_TONE.danger.iconBg}
          className={KPI_TONE.danger.cardBg}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Flujo del taller</CardTitle>
            <Link href="/ordenes" className="text-sm text-primary hover:underline">
              Ver todas las órdenes ({overview.ordenesActivasCount}) →
            </Link>
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
                    className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm hover:bg-muted/50"
                  >
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-amber-100 px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wide text-amber-900 dark:bg-amber-500/20 dark:text-amber-300">
                          {formatoPlaca(orden.placa)}
                        </span>
                        <span className="font-semibold">
                          {orden.vehiculoMarca} {orden.vehiculoModelo}
                          {orden.vehiculoAnio ? ` · ${orden.vehiculoAnio}` : ""}
                        </span>
                        <span className="text-xs text-muted-foreground">#OT-{orden.id.slice(-8).toUpperCase()}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Cliente: {orden.clienteNombre} · Técnico: {orden.mecanicoNombre ?? "Sin asignar"}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant={ESTADO_ORDEN_BADGE[orden.estado]}>{ESTADO_ORDEN_LABELS[orden.estado]}</Badge>
                        <span className="font-mono text-sm">{formatoMoneda.format(orden.total)}</span>
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </div>
                  </Link>
                ))
              )}
            </div>

            {overview.ordenesRecientes.length > 0 ? (
              <p className="text-center text-xs text-muted-foreground">
                Mostrando {overview.ordenesRecientes.length} de {overview.ordenesActivasCount} órdenes activas hoy
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Agenda de hoy</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col">
            {overview.agendaHoy.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">No hay citas agendadas hoy en esta sede.</p>
            ) : (
              overview.agendaHoy.map((cita, index) => {
                const tono = ESTADO_CITA_TONO[cita.estado];
                const esUltima = index === overview.agendaHoy.length - 1;
                return (
                  <div key={cita.id} className={cn("flex gap-3", !esUltima && "pb-3")}>
                    <div className="relative flex w-2.5 shrink-0 flex-col items-center">
                      <span className={cn("mt-2 size-2.5 shrink-0 rounded-full", tono.dot)} />
                      {!esUltima ? <span className="absolute top-4 bottom-0 w-px bg-border" /> : null}
                    </div>
                    <div className="flex-1 rounded-lg border border-border bg-card p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{formatoHora12h(cita.hora)}</span>
                        <span className="rounded-md bg-amber-100 px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wide text-amber-900 dark:bg-amber-500/20 dark:text-amber-300">
                          {formatoPlaca(cita.placa)}
                        </span>
                      </div>
                      <p className="font-semibold">{cita.motivo}</p>
                      <p className="text-xs text-muted-foreground">
                        {cita.clienteNombre} · {cita.vehiculoMarca} {cita.vehiculoModelo}
                      </p>
                      <span className={cn("mt-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium", tono.badge)}>
                        {ESTADO_CITA_LABELS[cita.estado]}
                      </span>
                    </div>
                  </div>
                );
              })
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
