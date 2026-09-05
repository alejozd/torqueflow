import Link from "next/link";
import { AlertTriangle, CheckCircle, Clock, Percent } from "lucide-react";
import { listCotizaciones, listVehiculosParaCotizacion, type CotizacionConDetalle } from "@/app/actions/cotizacion-actions";
import { NuevaCotizacionDialog } from "./nueva-cotizacion-dialog";
import type { EstadoCotizacion } from "@/generated/prisma-tenant";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { KPI_TONE, KpiCard } from "@/components/ui/kpi-card";
import { inferirColorVehiculo } from "@/lib/color-vehiculo";
import { formatoFechaCorta } from "@/lib/fecha-bogota";
import { cn } from "@/lib/utils";

const ESTADOS_VALIDOS: EstadoCotizacion[] = ["BORRADOR", "ENVIADA", "APROBADA", "RECHAZADA", "VENCIDA"];

const ESTADO_LABELS: Record<EstadoCotizacion, string> = {
  BORRADOR: "Borrador",
  ENVIADA: "Enviada",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
  VENCIDA: "Vencida",
};

// BORRADOR (neutral) -> ENVIADA (blue) -> APROBADA (green) / RECHAZADA (red)
// / VENCIDA (amber, Badge's own solid "default" fill -- same "needs
// attention" semantic facturas/page.tsx gives PENDIENTE).
const ESTADO_BADGE_VARIANT: Partial<Record<EstadoCotizacion, "outline" | "destructive" | "default">> = {
  BORRADOR: "outline",
  RECHAZADA: "destructive",
  VENCIDA: "default",
};

const ESTADO_BADGE_CLASSNAME: Record<EstadoCotizacion, string> = {
  BORRADOR: "",
  ENVIADA: "border-transparent bg-[oklch(0.44_0.12_250/0.1)] text-[oklch(0.44_0.12_250)]",
  APROBADA: "border-transparent bg-[oklch(0.4_0.1_150/0.1)] text-[oklch(0.4_0.1_150)]",
  RECHAZADA: "",
  VENCIDA: "",
};

const ESTADO_DOT_COLOR: Record<EstadoCotizacion, string> = {
  BORRADOR: "oklch(0.7 0 0)",
  ENVIADA: "oklch(0.44 0.12 250)",
  APROBADA: "oklch(0.4 0.1 150)",
  RECHAZADA: "var(--destructive)",
  VENCIDA: "var(--primary-foreground)",
};

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function construirHrefCotizaciones(base: { estado?: EstadoCotizacion; q?: string }): string {
  const params = new URLSearchParams();
  if (base.estado) params.set("estado", base.estado);
  if (base.q) params.set("q", base.q);
  const query = params.toString();
  return query ? `/cotizaciones?${query}` : "/cotizaciones";
}

const COLUMNS: DataTableColumn<CotizacionConDetalle>[] = [
  {
    header: "Cotización",
    cell: (cotizacion) => (
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-sm font-medium">#{cotizacion.numero}</span>
        <span className="text-xs text-muted-foreground">{formatoFechaCorta.format(cotizacion.createdAt)}</span>
      </div>
    ),
  },
  {
    header: "Vehículo",
    cell: (cotizacion) => {
      const tono = inferirColorVehiculo(cotizacion.vehiculo.color);
      return (
        <div className="flex flex-col gap-1">
          <Badge
            variant="outline"
            className={cn("w-fit font-mono text-xs tracking-wider", tono && "border-transparent", tono?.bg, tono?.text)}
          >
            {cotizacion.vehiculo.placa.toUpperCase()}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {cotizacion.vehiculo.marca} {cotizacion.vehiculo.modelo}
          </span>
        </div>
      );
    },
  },
  {
    header: "Cliente",
    cell: (cotizacion) => (
      <div className="flex flex-col gap-0.5">
        <span>{cotizacion.cliente.nombre}</span>
        <span className="text-xs text-muted-foreground">{cotizacion.cliente.documento ?? "Sin documento"}</span>
      </div>
    ),
  },
  {
    header: "Motivo",
    cell: (cotizacion) => <span className="text-sm text-muted-foreground">{cotizacion.motivo}</span>,
  },
  {
    header: "Estado",
    cell: (cotizacion) => (
      <Badge
        variant={ESTADO_BADGE_VARIANT[cotizacion.estado]}
        className={cn("gap-1.5", ESTADO_BADGE_CLASSNAME[cotizacion.estado])}
      >
        <span className="size-1.5 shrink-0 rounded-full" style={{ background: ESTADO_DOT_COLOR[cotizacion.estado] }} />
        {ESTADO_LABELS[cotizacion.estado]}
      </Badge>
    ),
  },
  {
    header: "Válida hasta",
    cell: (cotizacion) =>
      cotizacion.validaHasta ? (
        <span className="text-sm">{formatoFechaCorta.format(cotizacion.validaHasta)}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    header: "Ítems",
    cell: (cotizacion) => <span className="text-sm">{cotizacion.items.length}</span>,
  },
  {
    header: "Total",
    className: "text-right",
    cell: (cotizacion) => <span className="font-mono font-medium">{formatoMoneda.format(Number(cotizacion.total))}</span>,
  },
];

export default async function CotizacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; q?: string }>;
}) {
  const { estado, q } = await searchParams;
  const estadoFiltro = ESTADOS_VALIDOS.includes(estado as EstadoCotizacion) ? (estado as EstadoCotizacion) : undefined;
  const busqueda = q?.trim().toLowerCase() ?? "";

  // Fetched once, unfiltered: the KPI cards summarize every cotización of the
  // sede regardless of which estado the list below is currently filtered to.
  const [cotizaciones, vehiculos] = await Promise.all([listCotizaciones(), listVehiculosParaCotizacion()]);
  const filtradas = cotizaciones
    .filter((cotizacion) => !estadoFiltro || cotizacion.estado === estadoFiltro)
    .filter(
      (cotizacion) =>
        !busqueda ||
        String(cotizacion.numero).includes(busqueda) ||
        cotizacion.cliente.nombre.toLowerCase().includes(busqueda) ||
        cotizacion.vehiculo.placa.toLowerCase().includes(busqueda),
    );

  const ahora = new Date();
  const enUnaSemana = new Date(ahora.getTime() + 7 * 24 * 60 * 60 * 1000);

  const abiertas = cotizaciones.filter((cotizacion) => cotizacion.estado === "BORRADOR" || cotizacion.estado === "ENVIADA");
  const enviadas = cotizaciones.filter((cotizacion) => cotizacion.estado === "ENVIADA");
  const pendientesRespuestaMonto = enviadas.reduce((suma, cotizacion) => suma + Number(cotizacion.total), 0);

  const inicioMes = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1));
  const aprobadasMes = cotizaciones.filter((cotizacion) => cotizacion.estado === "APROBADA" && cotizacion.updatedAt >= inicioMes);

  const decididas = cotizaciones.filter((cotizacion) => cotizacion.estado === "APROBADA" || cotizacion.estado === "RECHAZADA");
  const aprobadas = decididas.filter((cotizacion) => cotizacion.estado === "APROBADA");
  const tasaAprobacion = decididas.length > 0 ? (aprobadas.length / decididas.length) * 100 : null;

  const vencenEstaSemana = enviadas.filter(
    (cotizacion) => cotizacion.validaHasta && cotizacion.validaHasta >= ahora && cotizacion.validaHasta <= enUnaSemana,
  );

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-semibold">Cotizaciones</h1>
          <Badge variant="outline" className="font-normal text-muted-foreground">
            {abiertas.length} {abiertas.length === 1 ? "cotización abierta" : "cotizaciones abiertas"} ·{" "}
            {formatoMoneda.format(pendientesRespuestaMonto)} pendientes de respuesta
          </Badge>
        </div>
        <NuevaCotizacionDialog vehiculos={vehiculos} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Abiertas"
          value={abiertas.length}
          valueColor="warning"
          subtitle={`${enviadas.length} ${enviadas.length === 1 ? "esperando respuesta" : "esperando respuesta"}`}
          subtitleColor="warning"
          subtitleIcon="dot"
          icon={<Clock className={cn("size-5", KPI_TONE.warning.icon)} />}
          iconBgColor={KPI_TONE.warning.iconBg}
          className={KPI_TONE.warning.cardBg}
        />

        <KpiCard
          title="Aprobadas"
          value={aprobadasMes.length}
          valueColor="success"
          subtitle="Este mes"
          subtitleColor="success"
          subtitleIcon="up"
          icon={<CheckCircle className={cn("size-5", KPI_TONE.success.icon)} />}
          iconBgColor={KPI_TONE.success.iconBg}
          className={KPI_TONE.success.cardBg}
        />

        <KpiCard
          title="Tasa de aprobación"
          value={tasaAprobacion !== null ? `${tasaAprobacion.toFixed(0)}%` : "—"}
          subtitle={decididas.length > 0 ? `sobre ${decididas.length} ${decididas.length === 1 ? "decisión" : "decisiones"}` : "Sin decisiones aún"}
          icon={<Percent className={cn("size-5", KPI_TONE.info.icon)} />}
          iconBgColor={KPI_TONE.info.iconBg}
          className={KPI_TONE.info.cardBg}
        />

        <KpiCard
          title="Vencen esta semana"
          value={vencenEstaSemana.length}
          valueColor="danger"
          subtitle={vencenEstaSemana.length > 0 ? "Requieren seguimiento" : "Ninguna por ahora"}
          subtitleColor="danger"
          subtitleIcon={vencenEstaSemana.length > 0 ? "dot" : "none"}
          icon={<AlertTriangle className={cn("size-5", KPI_TONE.danger.icon)} />}
          iconBgColor={KPI_TONE.danger.iconBg}
          className={KPI_TONE.danger.cardBg}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
              <Link
                href={construirHrefCotizaciones({ q })}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors",
                  estadoFiltro === undefined
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-transparent hover:bg-accent hover:text-accent-foreground"
                )}
              >
                Todas
              </Link>
              {ESTADOS_VALIDOS.map((value) => (
                <Link
                  key={value}
                  href={construirHrefCotizaciones({ estado: value, q })}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm transition-colors",
                    estadoFiltro === value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-transparent hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  {ESTADO_LABELS[value]}
                </Link>
              ))}
            </nav>

            <form role="search" className="flex items-center gap-2">
              {estadoFiltro ? <input type="hidden" name="estado" value={estadoFiltro} /> : null}
              <Input
                type="search"
                name="q"
                defaultValue={q ?? ""}
                placeholder="Buscar por número, cliente o placa…"
                className="w-56"
              />
              <Button type="submit" variant="outline" size="sm">
                Buscar
              </Button>
            </form>
          </div>

          <DataTable
            columns={COLUMNS}
            rows={filtradas}
            getRowKey={(cotizacion) => cotizacion.id}
            rowHref={(cotizacion) => `/cotizaciones/${cotizacion.id}`}
            emptyMessage="No hay cotizaciones en este estado."
            headerClassName="bg-muted"
          />
        </CardContent>
      </Card>
    </main>
  );
}
