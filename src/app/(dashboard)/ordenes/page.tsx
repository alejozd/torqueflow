import Link from "next/link";
import { AlertCircle, AlertTriangle, ArrowDown, ArrowUp, Car, Clock, DollarSign, UserPlus, Wrench } from "lucide-react";
import { listOrdenes, listTecnicos, type OrdenWithDetalle } from "@/app/actions/orden-actions";
import { getAlertasTaller, type AlertaTaller } from "@/app/actions/alertas-taller-actions";
import { listClientesParaOrden } from "@/app/actions/cliente-actions";
import { listMarcasVehiculo, listTodosLosModelosVehiculo } from "@/app/actions/vehiculo-marca-modelo-actions";
import { getDiasAvisoVencimiento } from "@/app/actions/configuracion-taller-actions";
import { requireSession } from "@/lib/auth/guards";
import { NuevaOrdenDialog } from "./nueva-orden-dialog";
import { PRIORIDAD_BADGE_CLASSNAME } from "./prioridad-tono";
import {
  ALERTAS_VALIDAS,
  ESTADOS_VALIDOS,
  ETIQUETA_FILTRO_ALERTA,
  construirHrefOrdenes,
  filtrarPorAlerta,
  parseAlerta,
  parseEstado,
  parseOrder,
  parseSort,
  parseVista,
  type SortKey,
  type SortOrder,
} from "./filtros-ordenes";
import type { EstadoOrden } from "@/generated/prisma-tenant";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KPI_TONE, KpiCard } from "@/components/ui/kpi-card";
import { inferirColorVehiculo } from "@/lib/color-vehiculo";
import { formatoFechaCorta, formatoFechaRelativa, inicioMesBogota, inicioSemanaBogota } from "@/lib/fecha-bogota";
import { ETIQUETA_PRIORIDAD, ORDEN_PRIORIDAD, compararPorPrioridad, type MotivoAlerta } from "@/lib/orden/flujo";
import { cn } from "@/lib/utils";

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

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

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
// ANULADA is the exception (Fase 22, D10): a cancelled orden is not part of the
// live flow, so it only gets a column when that estado is what you filtered by.
function agruparPorEstado(ordenes: OrdenRow[], estadoFiltro?: EstadoOrden): ColumnaKanban[] {
  const estados = estadoFiltro === "ANULADA" ? ESTADOS_VALIDOS : ESTADOS_VALIDOS.filter((estado) => estado !== "ANULADA");
  return estados.map((estado) => ({
    estado,
    ordenes: ordenes
      .filter((orden) => orden.estado === estado)
      .sort((a, b) => compararPorPrioridad(a, b)),
  }));
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
  alertaFiltro,
}: {
  label: string;
  sortKey: SortKey;
  sortActual: SortKey | undefined;
  orderActual: SortOrder;
  estadoFiltro: EstadoOrden | undefined;
  vistaActual: "tabla" | "tablero";
  alertaFiltro: MotivoAlerta | undefined;
}) {
  const isActive = sortActual === sortKey;
  const nextOrder: SortOrder = isActive && orderActual === "desc" ? "asc" : "desc";
  return (
    <Link
      href={construirHrefOrdenes({
        estado: estadoFiltro,
        vista: vistaActual,
        sort: sortKey,
        order: nextOrder,
        alerta: alertaFiltro,
      })}
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
    case "prioridad":
      cmp = ORDEN_PRIORIDAD[b.prioridad] - ORDEN_PRIORIDAD[a.prioridad];
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
  alertaFiltro: MotivoAlerta | undefined,
  vistaActual: "tabla" | "tablero",
  ahora: Date,
  alertas: Map<string, AlertaTaller>,
): DataTableColumn<OrdenRow>[] {
  const sortableHeaderProps = { sortActual, orderActual, estadoFiltro, vistaActual, alertaFiltro };
  return [
    {
      header: "Orden",
      cell: (orden) => <span className="font-mono text-sm font-medium">#{orden.id.slice(-8).toUpperCase()}</span>,
    },
    {
      header: "Vehículo",
      cell: (orden) => {
        const tono = inferirColorVehiculo(orden.vehiculo.color);
        return (
        <div className="flex flex-col gap-1">
          <Badge
            variant="outline"
            className={cn("w-fit font-mono text-xs tracking-wider", tono && "border-transparent", tono?.bg, tono?.text)}
          >
            <Car />
            {orden.vehiculo.placa.toUpperCase()}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {orden.vehiculo.marca} {orden.vehiculo.modelo}
            {orden.vehiculo.color ? ` · ${orden.vehiculo.color}` : ""}
          </span>
        </div>
        );
      },
    },
    {
      header: <SortableHeader label="Cliente" sortKey="cliente" {...sortableHeaderProps} />,
      cell: (orden) => (
        <div className="flex flex-col gap-0.5">
          <span>{orden.cliente.nombre}</span>
          <span className="text-xs text-muted-foreground">{orden.cliente.documento ?? "Sin documento"}</span>
        </div>
      ),
    },
    {
      header: <SortableHeader label="Estado" sortKey="estado" {...sortableHeaderProps} />,
      cell: (orden) => {
        const alerta = alertas.get(orden.id);
        return (
          <div className="flex flex-col gap-1">
            <Badge
              variant={ESTADO_BADGE_VARIANT[orden.estado]}
              className={cn("w-fit gap-1.5", ESTADO_BADGE_CLASSNAME[orden.estado])}
            >
              <span className="size-1.5 shrink-0 rounded-full" style={{ background: ESTADO_DOT_COLOR[orden.estado] }} />
              {ESTADO_LABELS[orden.estado]}
            </Badge>
            {alerta ? (
              <Badge
                variant="outline"
                className="w-fit gap-1 border-transparent bg-destructive/10 text-destructive"
                title={`${ETIQUETA_FILTRO_ALERTA[alerta.motivo]}: ${alerta.dias} días sin actividad`}
              >
                <Clock className="size-3 shrink-0" />
                {alerta.dias} {alerta.dias === 1 ? "día" : "días"}
              </Badge>
            ) : null}
          </div>
        );
      },
    },
    {
      header: "Mecánico",
      cell: (orden) =>
        orden.mecanico ? (
          <span className="inline-flex items-center gap-1.5">
            <Wrench className="size-3.5 shrink-0 text-muted-foreground" />
            {orden.mecanico.nombre}
          </span>
        ) : (
          <Badge
            variant="outline"
            className="gap-1 border-transparent bg-[oklch(0.7_0.15_60/0.15)] text-[oklch(0.55_0.15_60)]"
          >
            <AlertTriangle className="size-3.5 shrink-0" />
            Sin asignar
          </Badge>
        ),
    },
    {
      header: <SortableHeader label="Ingreso" sortKey="fecha" {...sortableHeaderProps} />,
      cell: (orden) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-sm">{formatoFechaCorta.format(orden.createdAt)}</span>
          <span className="text-xs text-muted-foreground">{formatoFechaRelativa(orden.createdAt, ahora)}</span>
        </div>
      ),
    },
    {
      header: <SortableHeader label="Prioridad" sortKey="prioridad" {...sortableHeaderProps} />,
      cell: (orden) => (
        <Badge
          variant="outline"
          className={cn("gap-1.5", PRIORIDAD_BADGE_CLASSNAME[orden.prioridad])}
          data-prioridad={orden.prioridad}
        >
          {ETIQUETA_PRIORIDAD[orden.prioridad]}
        </Badge>
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
      sticky: true,
      cell: (orden) => <span className="font-mono font-medium">{formatoMoneda.format(calcularTotalOrden(orden))}</span>,
    },
  ];
}

export default async function OrdenesPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; vista?: string; sort?: string; order?: string; alerta?: string }>;
}) {
  const { estado, vista, sort, order, alerta } = await searchParams;
  const estadoFiltro = parseEstado(estado);
  const alertaFiltro = parseAlerta(alerta);
  const vistaActual = parseVista(vista);
  const sortActual = parseSort(sort);
  const orderActual = parseOrder(order);

  // Fetched once, unfiltered: the KPI cards summarize every orden of the sede
  // regardless of which estado the list below is currently filtered to, so a
  // single read is filtered client-side rather than re-querying per filter.
  const [ordenes, clientes, tecnicos, session, marcas, modelos, diasAviso, alertasTaller] = await Promise.all([
    listOrdenes(),
    listClientesParaOrden(),
    listTecnicos(),
    requireSession(),
    listMarcasVehiculo(),
    listTodosLosModelosVehiculo(),
    getDiasAvisoVencimiento(),
    getAlertasTaller(),
  ]);
  const esAdmin = session.user.role === "ADMIN";
  // Las alertas se cruzan por id (una sola lectura con select mínimo): el listado
  // no carga ítems, mano de obra, DVI ni daños solo para pintar la marca.
  const alertas = new Map(alertasTaller.alertas.map((item) => [item.ordenId, item]));
  const motivos = new Map(alertasTaller.alertas.map((item) => [item.ordenId, item.motivo]));
  const porEstado = estadoFiltro ? ordenes.filter((orden) => orden.estado === estadoFiltro) : ordenes;
  const filtradas = filtrarPorAlerta(porEstado, alertaFiltro, motivos);

  const ahora = new Date();
  const inicioMes = inicioMesBogota(ahora);
  const ordenesMes = ordenes.filter((orden) => orden.createdAt >= inicioMes).length;

  const enProceso = ordenes.filter((orden) => orden.estado === "EN_PROCESO").length;
  // TERMINADA orders are still physically in the shop (done working, not yet
  // picked up), so "En bahía" counts both -- billing status doesn't affect
  // whether the car occupies a bay.
  const terminadasTotal = ordenes.filter((orden) => orden.estado === "TERMINADA").length;
  const enBahia = enProceso + terminadasTotal;
  const terminadasSinFacturar = ordenes.filter((orden) => orden.estado === "TERMINADA" && !orden.factura).length;

  // Only BORRADOR/EN_PROCESO orders need a mecánico assigned to move forward
  // -- TERMINADA/ENTREGADA/ANULADA are past that step.
  const porAsignarMecanico = ordenes.filter(
    (orden) => (orden.estado === "BORRADOR" || orden.estado === "EN_PROCESO") && !orden.mecanico,
  ).length;

  const inicioSemana = inicioSemanaBogota(ahora);
  const facturadasSemana = ordenes.filter((orden) => orden.factura !== null && orden.createdAt >= inicioSemana);
  const ticketMedio =
    facturadasSemana.length > 0
      ? facturadasSemana.reduce((suma, orden) => suma + Number(orden.factura!.total), 0) / facturadasSemana.length
      : null;

  // El mismo filtro de estado que usa la tabla también recorta el tablero:
  // con un estado elegido, agruparPorEstado(filtradas) solo deja cards en esa
  // columna, así que se colapsa a mostrar únicamente esa columna en vez de
  // 4 columnas vacías.
  const columnasBase = agruparPorEstado(filtradas, estadoFiltro);
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
        <NuevaOrdenDialog clientes={clientes} tecnicos={tecnicos} marcas={marcas} modelos={modelos} esAdmin={esAdmin} diasAviso={diasAviso} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          title="En bahía"
          value={enBahia}
          subtitle={`${enProceso} en proceso, ${terminadasTotal} en Terminadas`}
          icon={<Wrench className={cn("size-5", KPI_TONE.info.icon)} />}
          iconBgColor={KPI_TONE.info.iconBg}
          className={KPI_TONE.info.cardBg}
        />

        <KpiCard
          title="Terminadas sin facturar"
          value={terminadasSinFacturar}
          valueColor="warning"
          subtitle={`${terminadasSinFacturar} listas para entrega`}
          icon={<AlertCircle className={cn("size-5", KPI_TONE.warning.icon)} />}
          iconBgColor={KPI_TONE.warning.iconBg}
          className={KPI_TONE.warning.cardBg}
        />

        <KpiCard
          title="Por asignar mecánico"
          value={porAsignarMecanico}
          valueColor="warning"
          subtitle={`${porAsignarMecanico} vehículos esperando bahía libre`}
          icon={<UserPlus className={cn("size-5", KPI_TONE.warning.icon)} />}
          iconBgColor={KPI_TONE.warning.iconBg}
          className={KPI_TONE.warning.cardBg}
        />

        <KpiCard
          title="Ticket medio"
          value={ticketMedio !== null ? formatoMoneda.format(ticketMedio) : "—"}
          valueColor="success"
          subtitle="Esta semana"
          icon={<DollarSign className={cn("size-5", KPI_TONE.success.icon)} />}
          iconBgColor={KPI_TONE.success.iconBg}
          className={KPI_TONE.success.cardBg}
        />

        <KpiCard
          title="Estancadas"
          value={alertasTaller.alertas.length}
          valueColor={alertasTaller.alertas.length > 0 ? "warning" : "success"}
          subtitle={`Sin actividad en ${alertasTaller.diasUmbral} días o más`}
          icon={<Clock className={cn("size-5", KPI_TONE.warning.icon)} />}
          iconBgColor={KPI_TONE.warning.iconBg}
          className={KPI_TONE.warning.cardBg}
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
                href={construirHrefOrdenes({ vista: vistaActual, sort: sortActual, order: orderActual, alerta: alertaFiltro })}
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
                  href={construirHrefOrdenes({
                    estado: value,
                    vista: vistaActual,
                    sort: sortActual,
                    order: orderActual,
                    alerta: alertaFiltro,
                  })}
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

            {/* Fase 22: lo que quedó parado o listo sin entregar, filtrable sin
                perderse de la vista de estados. */}
            <nav aria-label="Filtrar por alerta" className="flex flex-wrap gap-2">
              {ALERTAS_VALIDAS.map((motivo) => {
                const cuantas = alertasTaller.alertas.filter((item) => item.motivo === motivo).length;
                return (
                  <Link
                    key={motivo}
                    href={construirHrefOrdenes({
                      estado: estadoFiltro,
                      vista: vistaActual,
                      sort: sortActual,
                      order: orderActual,
                      alerta: alertaFiltro === motivo ? undefined : motivo,
                    })}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
                      alertaFiltro === motivo
                        ? "border-destructive bg-destructive text-white"
                        : "border-input bg-transparent hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <Clock className="size-3.5 shrink-0" />
                    {ETIQUETA_FILTRO_ALERTA[motivo]}
                    <span className="font-mono text-xs">{cuantas}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="flex gap-1 rounded-full border border-input p-0.5">
              <Link
                href={construirHrefOrdenes({ estado: estadoFiltro, vista: "tablero", sort: sortActual, order: orderActual, alerta: alertaFiltro })}
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
                href={construirHrefOrdenes({ estado: estadoFiltro, vista: "tabla", sort: sortActual, order: orderActual, alerta: alertaFiltro })}
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
              columns={buildColumns(sortActual, orderActual, estadoFiltro, alertaFiltro, vistaActual, ahora, alertas)}
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
                            <span className="flex items-center gap-1">
                              <Badge
                                variant="outline"
                                className={cn("text-[10px]", PRIORIDAD_BADGE_CLASSNAME[orden.prioridad])}
                              >
                                {ETIQUETA_PRIORIDAD[orden.prioridad]}
                              </Badge>
                              <span className="font-mono text-[10px] text-muted-foreground">
                                #{orden.id.slice(-8).toUpperCase()}
                              </span>
                            </span>
                          </div>
                          {alertas.has(orden.id) ? (
                            <Badge
                              variant="outline"
                              className="w-fit gap-1 border-transparent bg-destructive/10 text-[10px] text-destructive"
                            >
                              <Clock className="size-3 shrink-0" />
                              {alertas.get(orden.id)!.dias} días sin actividad
                            </Badge>
                          ) : null}
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
