import Link from "next/link";
import { AlertCircle, ArrowDown, ArrowUp, DollarSign, UserPlus, Wrench } from "lucide-react";
import { listOrdenes, listTecnicos, type OrdenWithDetalle } from "@/app/actions/orden-actions";
import { listClientesParaOrden } from "@/app/actions/cliente-actions";
import { NuevaOrdenDialog } from "./nueva-orden-dialog";
import type { EstadoOrden } from "@/generated/prisma-tenant";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KPI_TONE, KpiCard } from "@/components/ui/kpi-card";
import { cn } from "@/lib/utils";

const ESTADOS_VALIDOS: EstadoOrden[] = ["BORRADOR", "EN_PROCESO", "TERMINADA", "ENTREGADA", "ANULADA"];

type SortKey = "fecha" | "total" | "estado" | "cliente";
type SortOrder = "asc" | "desc";
const SORT_KEYS: SortKey[] = ["fecha", "total", "estado", "cliente"];

const ESTADO_LABELS: Record<EstadoOrden, string> = {
  BORRADOR: "Borrador",
  EN_PROCESO: "En proceso",
  TERMINADA: "Terminada",
  ENTREGADA: "Entregada",
  ANULADA: "Anulada",
};

// Draft -> in progress (amber, active work) -> finished (blue, ready) ->
// delivered (green, done) -> cancelled (red). Badge's own variants only cover
// default/secondary/destructive/outline, so the amber/blue/green states use
// the same bg-X/10 + text-X className mechanism the destructive variant uses.
const ESTADO_BADGE_CLASSNAME: Record<EstadoOrden, string> = {
  BORRADOR: "",
  EN_PROCESO: "border-transparent bg-[oklch(0.7_0.15_60/0.15)] text-[oklch(0.55_0.15_60)]",
  TERMINADA: "border-transparent bg-[oklch(0.44_0.12_250/0.1)] text-[oklch(0.44_0.12_250)]",
  ENTREGADA: "border-transparent bg-[oklch(0.4_0.1_150/0.1)] text-[oklch(0.4_0.1_150)]",
  ANULADA: "",
};

const ESTADO_BADGE_VARIANT: Partial<Record<EstadoOrden, "outline" | "destructive">> = {
  BORRADOR: "outline",
  ANULADA: "destructive",
};

// Dot/left-border tone per columna del tablero -- mismos tonos que
// ESTADO_BADGE_CLASSNAME (o el neutro/destructivo estándar para los estados
// que usan variant en vez de className propio).
const ESTADO_DOT_COLOR: Record<EstadoOrden, string> = {
  BORRADOR: "oklch(0.7 0 0)",
  EN_PROCESO: "oklch(0.55 0.15 60)",
  TERMINADA: "oklch(0.44 0.12 250)",
  ENTREGADA: "oklch(0.4 0.1 150)",
  ANULADA: "oklch(0.5 0.2 27)",
};

const formatoFecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" });

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

/**
 * America/Bogota is a fixed UTC-5 offset with no daylight saving time (same
 * assumption citas/page.tsx and facturas/page.tsx document), so "this month"
 * is derived without a timezone library: read the Bogota calendar month, then
 * reconstruct that month's first instant as an explicit UTC-5 timestamp.
 */
const formatoMesBogota = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
});

function inicioMesBogota(fecha: Date): Date {
  const [anioStr, mesStr] = formatoMesBogota.format(fecha).split("-");
  return new Date(`${anioStr}-${mesStr}-01T00:00:00-05:00`);
}

const formatoDiaBogota = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" });

/**
 * "Hoy" only for the just-created case (<1min, where "Hace 0 minutos" would
 * read oddly); every other same-day order shows "Hace X horas" instead of a
 * flat "Hoy" so recency inside the day stays visible. Orders 7+ days old fall
 * back to the absolute date -- "Hace 34 días" is harder to place mentally.
 */
function formatoFechaRelativa(fecha: Date, ahora: Date): string {
  const diffMs = ahora.getTime() - fecha.getTime();
  const diffMin = Math.floor(diffMs / (60 * 1000));
  if (diffMin < 1) return "Hoy";
  if (diffMin < 60) return `Hace ${diffMin} ${diffMin === 1 ? "minuto" : "minutos"}`;

  const mismoDia = formatoDiaBogota.format(fecha) === formatoDiaBogota.format(ahora);
  const diffHoras = Math.floor(diffMin / 60);
  if (mismoDia) return `Hace ${diffHoras} ${diffHoras === 1 ? "hora" : "horas"}`;

  const diffDias = Math.floor(diffHoras / 24);
  if (diffDias < 7) return `Hace ${diffDias} ${diffDias === 1 ? "día" : "días"}`;

  return formatoFecha.format(fecha);
}

type OrdenRow = OrdenWithDetalle;

/**
 * "Ítems" counts every line of the order (repuestos + mano de obra), not just
 * repuestos: that is what the mockup's "Ítems" column represents on an order
 * that can be entirely labor with no parts.
 */
function contarItems(orden: OrdenRow): number {
  return orden.items.length + orden.manoDeObra.length;
}

/**
 * A ya-facturada orden uses factura.total (the real invoiced amount, with
 * descuento/iva applied) instead of recomputing from items/manoDeObra, which
 * would drift from it. A not-yet-facturada orden has no other total to show,
 * so it is derived from its current items/manoDeObra lines.
 */
function calcularTotalOrden(orden: OrdenRow): number {
  if (orden.factura) return Number(orden.factura.total);
  const itemsTotal = orden.items.reduce((suma, item) => suma + item.cantidad * Number(item.precioUnitario), 0);
  const manoObraTotal = orden.manoDeObra.reduce((suma, linea) => suma + Number(linea.valor), 0);
  return itemsTotal + manoObraTotal;
}

function iniciales(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? "")
    .join("");
}

interface ColumnaKanban {
  estado: EstadoOrden;
  ordenes: OrdenRow[];
}

// Fixed ESTADOS_VALIDOS order (not grouped from `ordenes`' own order) so every
// columna renders even when empty, matching the mockup's always-visible board.
function agruparPorEstado(ordenes: OrdenRow[]): ColumnaKanban[] {
  return ESTADOS_VALIDOS.map((estado) => ({
    estado,
    ordenes: ordenes.filter((orden) => orden.estado === estado),
  }));
}

function construirHrefOrdenes(base: {
  estado?: EstadoOrden;
  vista?: "tabla" | "tablero";
  sort?: SortKey;
  order?: SortOrder;
}): string {
  const params = new URLSearchParams();
  if (base.estado) params.set("estado", base.estado);
  if (base.vista && base.vista !== "tabla") params.set("vista", base.vista);
  if (base.sort) params.set("sort", base.sort);
  if (base.sort && base.order === "asc") params.set("order", "asc");
  const query = params.toString();
  return query ? `/ordenes?${query}` : "/ordenes";
}

/**
 * Header link for the 4 sortable columns: toggles order when the same
 * column is clicked again, and resets to "desc" default when switching to a
 * different column (nextOrder only flips when this column is already active).
 */
function SortableHeader({
  label,
  sortKey,
  sortActual,
  orderActual,
  estadoFiltro,
  vistaActual,
}: {
  label: string;
  sortKey: SortKey;
  sortActual: SortKey | undefined;
  orderActual: SortOrder;
  estadoFiltro: EstadoOrden | undefined;
  vistaActual: "tabla" | "tablero";
}) {
  const isActive = sortActual === sortKey;
  const nextOrder: SortOrder = isActive && orderActual === "desc" ? "asc" : "desc";
  return (
    <Link
      href={construirHrefOrdenes({ estado: estadoFiltro, vista: vistaActual, sort: sortKey, order: nextOrder })}
      className="inline-flex items-center gap-1 hover:text-foreground"
    >
      {label}
      {isActive ? (orderActual === "desc" ? <ArrowDown className="size-3.5" /> : <ArrowUp className="size-3.5" />) : null}
    </Link>
  );
}

function compararOrdenes(a: OrdenRow, b: OrdenRow, sort: SortKey, order: SortOrder): number {
  let cmp = 0;
  switch (sort) {
    case "fecha":
      cmp = a.createdAt.getTime() - b.createdAt.getTime();
      break;
    case "total":
      cmp = calcularTotalOrden(a) - calcularTotalOrden(b);
      break;
    case "estado":
      cmp = a.estado.localeCompare(b.estado);
      break;
    case "cliente":
      cmp = a.cliente.nombre.localeCompare(b.cliente.nombre);
      break;
  }
  return order === "asc" ? cmp : -cmp;
}

/**
 * The whole row is clickable via DataTable's rowHref (a stretched link),
 * not a per-cell <Link> -- one unified hover/cursor/click target instead of
 * fragmented underlines per cell. A function (not a module-level constant)
 * because the 4 sortable columns' headers depend on the current sort/filter
 * state to render their SortableHeader link with the right href/indicator.
 */
function buildColumns(
  sortActual: SortKey | undefined,
  orderActual: SortOrder,
  estadoFiltro: EstadoOrden | undefined,
  vistaActual: "tabla" | "tablero",
  ahora: Date,
): DataTableColumn<OrdenRow>[] {
  const sortableHeaderProps = { sortActual, orderActual, estadoFiltro, vistaActual };
  return [
    {
      header: "Orden",
      cell: (orden) => <span className="font-mono text-sm font-medium">#{orden.id.slice(-8).toUpperCase()}</span>,
    },
    {
      header: "Vehículo",
      cell: (orden) => <span className="font-mono text-sm">{orden.vehiculo.placa}</span>,
    },
    {
      header: <SortableHeader label="Cliente" sortKey="cliente" {...sortableHeaderProps} />,
      cell: (orden) => orden.cliente.nombre,
    },
    {
      header: <SortableHeader label="Estado" sortKey="estado" {...sortableHeaderProps} />,
      cell: (orden) => (
        <Badge variant={ESTADO_BADGE_VARIANT[orden.estado]} className={ESTADO_BADGE_CLASSNAME[orden.estado]}>
          {ESTADO_LABELS[orden.estado]}
        </Badge>
      ),
    },
    {
      header: "Mecánico",
      cell: (orden) =>
        orden.mecanico ? orden.mecanico.nombre : <span className="text-muted-foreground">Sin asignar</span>,
    },
    {
      header: <SortableHeader label="Ingreso" sortKey="fecha" {...sortableHeaderProps} />,
      cell: (orden) => (
        <span className="text-sm text-muted-foreground">{formatoFechaRelativa(orden.createdAt, ahora)}</span>
      ),
    },
    {
      header: "Ítems",
      className: "text-right",
      cell: (orden) => <span className="font-mono">{contarItems(orden)}</span>,
    },
    {
      header: <SortableHeader label="Total" sortKey="total" {...sortableHeaderProps} />,
      className: "text-right",
      cell: (orden) => <span className="font-mono font-medium">{formatoMoneda.format(calcularTotalOrden(orden))}</span>,
    },
  ];
}

export default async function OrdenesPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; vista?: string; sort?: string; order?: string }>;
}) {
  const { estado, vista, sort, order } = await searchParams;
  const estadoFiltro = ESTADOS_VALIDOS.includes(estado as EstadoOrden) ? (estado as EstadoOrden) : undefined;
  const vistaActual: "tabla" | "tablero" = vista === "tablero" ? "tablero" : "tabla";
  const sortActual = SORT_KEYS.includes(sort as SortKey) ? (sort as SortKey) : undefined;
  const orderActual: SortOrder = order === "asc" ? "asc" : "desc";

  // Fetched once, unfiltered: the KPI cards summarize every orden of the sede
  // regardless of which estado the list below is currently filtered to, so a
  // single read is filtered client-side rather than re-querying per filter.
  const [ordenes, clientes, tecnicos] = await Promise.all([
    listOrdenes(),
    listClientesParaOrden(),
    listTecnicos(),
  ]);
  const filtradas = estadoFiltro ? ordenes.filter((orden) => orden.estado === estadoFiltro) : ordenes;

  const ahora = new Date();
  const inicioMes = inicioMesBogota(ahora);
  const ordenesMes = ordenes.filter((orden) => orden.createdAt >= inicioMes).length;

  const enProceso = ordenes.filter((orden) => orden.estado === "EN_PROCESO").length;
  const terminadasSinFacturar = ordenes.filter((orden) => orden.estado === "TERMINADA" && !orden.factura).length;

  // Only BORRADOR/EN_PROCESO orders need a mecánico assigned to move forward
  // -- TERMINADA/ENTREGADA/ANULADA are past that step.
  const porAsignarMecanico = ordenes.filter(
    (orden) => (orden.estado === "BORRADOR" || orden.estado === "EN_PROCESO") && !orden.mecanico,
  ).length;

  const facturadas = ordenes.filter((orden) => orden.factura !== null);
  const ticketMedio =
    facturadas.length > 0
      ? facturadas.reduce((suma, orden) => suma + Number(orden.factura!.total), 0) / facturadas.length
      : null;

  // El mismo filtro de estado que usa la tabla también recorta el tablero:
  // con un estado elegido, agruparPorEstado(filtradas) solo deja cards en esa
  // columna, así que se colapsa a mostrar únicamente esa columna en vez de
  // 4 columnas vacías.
  const columnasBase = agruparPorEstado(filtradas);
  const columnas = estadoFiltro ? columnasBase.filter((columna) => columna.estado === estadoFiltro) : columnasBase;

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-semibold">Órdenes de trabajo</h1>
          <Badge variant="outline" className="font-normal text-muted-foreground">
            {ordenesMes} {ordenesMes === 1 ? "orden" : "órdenes"} este mes
          </Badge>
        </div>
        <NuevaOrdenDialog clientes={clientes} tecnicos={tecnicos} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="En bahía"
          value={enProceso}
          icon={<Wrench className={cn("size-5", KPI_TONE.info.icon)} />}
          iconBgColor={KPI_TONE.info.iconBg}
          className={KPI_TONE.info.cardBg}
        />

        <KpiCard
          title="Terminadas sin facturar"
          value={terminadasSinFacturar}
          valueColor="warning"
          icon={<AlertCircle className={cn("size-5", KPI_TONE.warning.icon)} />}
          iconBgColor={KPI_TONE.warning.iconBg}
          className={KPI_TONE.warning.cardBg}
        />

        <KpiCard
          title="Por asignar mecánico"
          value={porAsignarMecanico}
          valueColor="warning"
          icon={<UserPlus className={cn("size-5", KPI_TONE.warning.icon)} />}
          iconBgColor={KPI_TONE.warning.iconBg}
          className={KPI_TONE.warning.cardBg}
        />

        <KpiCard
          title="Ticket medio"
          value={ticketMedio !== null ? formatoMoneda.format(ticketMedio) : "—"}
          valueColor="success"
          icon={<DollarSign className={cn("size-5", KPI_TONE.success.icon)} />}
          iconBgColor={KPI_TONE.success.iconBg}
          className={KPI_TONE.success.cardBg}
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
                href={construirHrefOrdenes({ vista: vistaActual, sort: sortActual, order: orderActual })}
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
                  href={construirHrefOrdenes({ estado: value, vista: vistaActual, sort: sortActual, order: orderActual })}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
                    estadoFiltro === value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-transparent hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: estadoFiltro === value ? "currentColor" : ESTADO_DOT_COLOR[value] }}
                  />
                  {ESTADO_LABELS[value]}
                </Link>
              ))}
            </nav>

            <div className="flex gap-1 rounded-full border border-input p-0.5">
              <Link
                href={construirHrefOrdenes({ estado: estadoFiltro, vista: "tablero", sort: sortActual, order: orderActual })}
                className={cn(
                  "rounded-full px-3 py-1 text-sm transition-colors",
                  vistaActual === "tablero"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent hover:text-accent-foreground",
                )}
              >
                Tablero
              </Link>
              <Link
                href={construirHrefOrdenes({ estado: estadoFiltro, vista: "tabla", sort: sortActual, order: orderActual })}
                className={cn(
                  "rounded-full px-3 py-1 text-sm transition-colors",
                  vistaActual === "tabla"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent hover:text-accent-foreground",
                )}
              >
                Tabla
              </Link>
            </div>
          </div>

          {vistaActual === "tabla" ? (
            <DataTable
              columns={buildColumns(sortActual, orderActual, estadoFiltro, vistaActual, ahora)}
              rows={sortActual ? [...filtradas].sort((a, b) => compararOrdenes(a, b, sortActual, orderActual)) : filtradas}
              getRowKey={(orden) => orden.id}
              rowHref={(orden) => `/ordenes/${orden.id}`}
              emptyMessage="No hay órdenes de trabajo en este estado."
              headerClassName="bg-muted"
            />
          ) : (
            <div className="flex items-start gap-3 overflow-x-auto pb-1">
              {columnas.map((columna) => (
                <div
                  key={columna.estado}
                  className="flex w-64 shrink-0 flex-col gap-2 rounded-xl border border-border bg-muted/30 p-2"
                >
                  <div className="flex items-center gap-1.5 px-1.5 py-1">
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ background: ESTADO_DOT_COLOR[columna.estado] }}
                    />
                    <span className="flex-1 text-xs font-semibold">{ESTADO_LABELS[columna.estado]}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{columna.ordenes.length}</span>
                  </div>

                  <div className="flex flex-col gap-2">
                    {columna.ordenes.length === 0 ? (
                      <p className="px-1.5 text-xs text-muted-foreground">Sin órdenes</p>
                    ) : (
                      columna.ordenes.map((orden) => (
                        <Link
                          key={orden.id}
                          href={`/ordenes/${orden.id}`}
                          style={{ borderLeftColor: ESTADO_DOT_COLOR[columna.estado] }}
                          className="flex flex-col gap-1.5 rounded-lg border border-l-2 border-border bg-card p-2.5 text-xs transition-shadow hover:shadow-md"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[13px] font-semibold">{orden.vehiculo.placa}</span>
                            <span className="font-mono text-[10px] text-muted-foreground">
                              #{orden.id.slice(-8).toUpperCase()}
                            </span>
                          </div>
                          <p className="line-clamp-2 text-muted-foreground">
                            {orden.sintomas ?? "Sin síntomas registrados"}
                          </p>
                          <p className="text-[10.5px] text-muted-foreground">{orden.cliente.nombre}</p>
                          <div className="flex items-center justify-between gap-2 border-t border-border pt-1.5">
                            <span className="flex min-w-0 items-center gap-1.5 text-[10.5px] text-muted-foreground">
                              <span className="grid size-4 shrink-0 place-items-center rounded-full bg-muted text-[8.5px] font-semibold text-foreground">
                                {orden.mecanico ? iniciales(orden.mecanico.nombre) : "–"}
                              </span>
                              <span className="truncate">{orden.mecanico ? orden.mecanico.nombre : "Sin asignar"}</span>
                            </span>
                            <span className="shrink-0 font-mono text-[11px] font-medium">
                              {formatoMoneda.format(calcularTotalOrden(orden))}
                            </span>
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
