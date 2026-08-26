import Link from "next/link";
import { listOrdenes, type OrdenWithDetalle } from "@/app/actions/orden-actions";
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
  searchParams: Promise<{ estado?: string }>;
}) {
  const { estado } = await searchParams;
  const estadoFiltro = ESTADOS_VALIDOS.includes(estado as EstadoOrden) ? (estado as EstadoOrden) : undefined;

  // Fetched once, unfiltered: the KPI cards summarize every orden of the sede
  // regardless of which estado the list below is currently filtered to, so a
  // single read is filtered client-side rather than re-querying per filter.
  const ordenes = await listOrdenes();
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

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Órdenes de trabajo</h1>

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
          <nav aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
            <Link
              href="/ordenes"
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
                href={`/ordenes?estado=${value}`}
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

          <DataTable
            columns={COLUMNS}
            rows={filtradas}
            getRowKey={(orden) => orden.id}
            emptyMessage="No hay órdenes de trabajo en este estado."
          />
        </CardContent>
      </Card>
    </main>
  );
}
