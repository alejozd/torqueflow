import Link from "next/link";
import { listOrdenes, listTecnicos, type OrdenWithDetalle } from "@/app/actions/orden-actions";
import { listClientesParaOrden } from "@/app/actions/cliente-actions";
import { NuevaOrdenDialog } from "./nueva-orden-dialog";
import type { EstadoOrden } from "@/generated/prisma-tenant";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const ESTADOS_VALIDOS: EstadoOrden[] = ["BORRADOR", "EN_PROCESO", "TERMINADA", "ENTREGADA", "ANULADA"];

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
  const manoObraTotal = orden.manoDeObra.reduce(
    (suma, linea) => suma + Number(linea.horas) * Number(linea.precioHora),
    0,
  );
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

function construirHrefOrdenes(base: { estado?: EstadoOrden; vista?: "tabla" | "tablero" }): string {
  const params = new URLSearchParams();
  if (base.estado) params.set("estado", base.estado);
  if (base.vista && base.vista !== "tabla") params.set("vista", base.vista);
  const query = params.toString();
  return query ? `/ordenes?${query}` : "/ordenes";
}

const COLUMNS: DataTableColumn<OrdenRow>[] = [
  {
    header: "Orden",
    cell: (orden) => (
      <Link href={`/ordenes/${orden.id}`} className="font-mono text-sm font-medium hover:underline">
        #{orden.id.slice(-8).toUpperCase()}
      </Link>
    ),
  },
  {
    header: "Vehículo",
    cell: (orden) => <span className="font-mono text-sm">{orden.vehiculo.placa}</span>,
  },
  {
    header: "Cliente",
    cell: (orden) => orden.cliente.nombre,
  },
  {
    header: "Estado",
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
    header: "Ingreso",
    cell: (orden) => <span className="text-sm text-muted-foreground">{formatoFecha.format(orden.createdAt)}</span>,
  },
  {
    header: "Ítems",
    cell: (orden) => <span className="font-mono">{contarItems(orden)}</span>,
  },
  {
    header: "Total",
    cell: (orden) => <span className="font-mono font-medium">{formatoMoneda.format(calcularTotalOrden(orden))}</span>,
  },
];

export default async function OrdenesPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; vista?: string }>;
}) {
  const { estado, vista } = await searchParams;
  const estadoFiltro = ESTADOS_VALIDOS.includes(estado as EstadoOrden) ? (estado as EstadoOrden) : undefined;
  const vistaActual: "tabla" | "tablero" = vista === "tablero" ? "tablero" : "tabla";

  // Fetched once, unfiltered: the KPI cards summarize every orden of the sede
  // regardless of which estado the list below is currently filtered to, so a
  // single read is filtered client-side rather than re-querying per filter.
  const [ordenes, clientes, tecnicos] = await Promise.all([
    listOrdenes(),
    listClientesParaOrden(),
    listTecnicos(),
  ]);
  const filtradas = estadoFiltro ? ordenes.filter((orden) => orden.estado === estadoFiltro) : ordenes;

  const enProceso = ordenes.filter((orden) => orden.estado === "EN_PROCESO").length;
  const terminadasSinFacturar = ordenes.filter((orden) => orden.estado === "TERMINADA" && !orden.factura).length;

  const entregadas = ordenes.filter((orden) => orden.entregadaAt !== null);
  const tiempoMedioDias =
    entregadas.length > 0
      ? entregadas.reduce(
          (suma, orden) => suma + (orden.entregadaAt!.getTime() - orden.createdAt.getTime()),
          0,
        ) /
        entregadas.length /
        (1000 * 60 * 60 * 24)
      : null;

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
        <h1 className="text-2xl font-semibold">Órdenes de trabajo</h1>
        <NuevaOrdenDialog clientes={clientes} tecnicos={tecnicos} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">En proceso</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-mono text-2xl font-semibold">{enProceso}</span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Terminadas sin facturar</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-mono text-2xl font-semibold">{terminadasSinFacturar}</span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Tiempo medio</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-mono text-2xl font-semibold">
              {tiempoMedioDias !== null ? `${tiempoMedioDias.toFixed(1)}d` : "—"}
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Ticket medio</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-mono text-2xl font-semibold">
              {ticketMedio !== null ? formatoMoneda.format(ticketMedio) : "—"}
            </span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
              <Link
                href={construirHrefOrdenes({ vista: vistaActual })}
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
                  href={construirHrefOrdenes({ estado: value, vista: vistaActual })}
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

            <div className="flex gap-1 rounded-full border border-input p-0.5">
              <Link
                href={construirHrefOrdenes({ estado: estadoFiltro, vista: "tablero" })}
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
                href={construirHrefOrdenes({ estado: estadoFiltro, vista: "tabla" })}
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
              columns={COLUMNS}
              rows={filtradas}
              getRowKey={(orden) => orden.id}
              emptyMessage="No hay órdenes de trabajo en este estado."
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
