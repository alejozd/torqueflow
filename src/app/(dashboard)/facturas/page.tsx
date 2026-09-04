import Link from "next/link";
import { AlertCircle, ArrowDown, ArrowUp, CheckCircle, FileText, Zap } from "lucide-react";
import { listFacturas, listOrdenesFacturables, type FacturaWithDetalle } from "@/app/actions/factura-actions";
import { NuevaFacturaDialog } from "./nueva-factura-dialog";
import type { EstadoFactura } from "@/generated/prisma-tenant";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { cn } from "@/lib/utils";

const ESTADOS_VALIDOS: EstadoFactura[] = ["PENDIENTE", "PAGADA"];

type SortKey = "fecha" | "total" | "saldo" | "estado";
type SortOrder = "asc" | "desc";
const SORT_KEYS: SortKey[] = ["fecha", "total", "saldo", "estado"];

const ESTADO_LABELS: Record<EstadoFactura, string> = {
  PENDIENTE: "Pendiente",
  PAGADA: "Pagada",
};

// PENDIENTE reuses the primary variant: --primary is the same amber/orange
// the module spec calls for on a "pendiente" status. PAGADA is not one of
// Badge's own variants, so it reuses the bg-X/10 + text-X className
// mechanism the destructive variant uses internally.
const ESTADO_BADGE_VARIANT: Partial<Record<EstadoFactura, "default">> = {
  PENDIENTE: "default",
};

const ESTADO_BADGE_CLASSNAME: Record<EstadoFactura, string> = {
  PENDIENTE: "",
  PAGADA: "border-transparent bg-[oklch(0.4_0.1_150/0.1)] text-[oklch(0.4_0.1_150)]",
};

const formatoFecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" });

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

/**
 * America/Bogota is a fixed UTC-5 offset with no daylight saving time (same
 * assumption citas/page.tsx documents), so "this month" is derived without a
 * timezone library: read the Bogota calendar month, then reconstruct that
 * month's first instant as an explicit UTC-5 timestamp. Date.UTC normalizes
 * month overflow, so passing offsetMeses: 1 safely rolls December into the
 * next January.
 */
const formatoMesBogota = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
});

function inicioMesBogota(fecha: Date, offsetMeses = 0): Date {
  const [anioStr, mesStr] = formatoMesBogota.format(fecha).split("-");
  const base = new Date(Date.UTC(Number(anioStr), Number(mesStr) - 1 + offsetMeses, 1));
  const anio = base.getUTCFullYear();
  const mes = String(base.getUTCMonth() + 1).padStart(2, "0");
  return new Date(`${anio}-${mes}-01T00:00:00-05:00`);
}

function construirHrefFacturas(base: { estado?: EstadoFactura; q?: string; sort?: SortKey; order?: SortOrder }): string {
  const params = new URLSearchParams();
  if (base.estado) params.set("estado", base.estado);
  if (base.q) params.set("q", base.q);
  if (base.sort) params.set("sort", base.sort);
  if (base.sort && base.order === "asc") params.set("order", "asc");
  const query = params.toString();
  return query ? `/facturas?${query}` : "/facturas";
}

type FacturaRow = FacturaWithDetalle;

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
  q,
}: {
  label: string;
  sortKey: SortKey;
  sortActual: SortKey | undefined;
  orderActual: SortOrder;
  estadoFiltro: EstadoFactura | undefined;
  q: string | undefined;
}) {
  const isActive = sortActual === sortKey;
  const nextOrder: SortOrder = isActive && orderActual === "desc" ? "asc" : "desc";
  return (
    <Link
      href={construirHrefFacturas({ estado: estadoFiltro, q, sort: sortKey, order: nextOrder })}
      className="inline-flex items-center gap-1 hover:text-foreground"
    >
      {label}
      {isActive ? (orderActual === "desc" ? <ArrowDown className="size-3.5" /> : <ArrowUp className="size-3.5" />) : null}
    </Link>
  );
}

function compararFacturas(a: FacturaRow, b: FacturaRow, sort: SortKey, order: SortOrder): number {
  let cmp = 0;
  switch (sort) {
    case "fecha":
      cmp = a.createdAt.getTime() - b.createdAt.getTime();
      break;
    case "total":
      cmp = Number(a.total) - Number(b.total);
      break;
    case "saldo":
      cmp = Number(a.saldoPendiente) - Number(b.saldoPendiente);
      break;
    case "estado":
      cmp = a.estado.localeCompare(b.estado);
      break;
  }
  return order === "asc" ? cmp : -cmp;
}

function buildColumns(
  sortActual: SortKey | undefined,
  orderActual: SortOrder,
  estadoFiltro: EstadoFactura | undefined,
  q: string | undefined,
): DataTableColumn<FacturaRow>[] {
  const sortableHeaderProps = { sortActual, orderActual, estadoFiltro, q };
  return [
    {
      header: "Factura",
      cell: (factura) => <span className="font-mono text-sm font-medium">#{factura.numero}</span>,
    },
    {
      header: "Cliente",
      cell: (factura) => factura.cliente.nombre,
    },
    {
      header: "Vehículo",
      cell: (factura) => <span className="font-mono text-sm">{factura.orden.vehiculo.placa}</span>,
    },
    {
      header: <SortableHeader label="Emitida" sortKey="fecha" {...sortableHeaderProps} />,
      cell: (factura) => <span className="text-sm text-muted-foreground">{formatoFecha.format(factura.createdAt)}</span>,
    },
    {
      header: <SortableHeader label="Estado" sortKey="estado" {...sortableHeaderProps} />,
      cell: (factura) => (
        <Badge variant={ESTADO_BADGE_VARIANT[factura.estado]} className={ESTADO_BADGE_CLASSNAME[factura.estado]}>
          {ESTADO_LABELS[factura.estado]}
        </Badge>
      ),
    },
    {
      header: <SortableHeader label="Total" sortKey="total" {...sortableHeaderProps} />,
      className: "text-right",
      cell: (factura) => <span className="font-mono font-medium">{formatoMoneda.format(Number(factura.total))}</span>,
    },
    {
      header: <SortableHeader label="Saldo" sortKey="saldo" {...sortableHeaderProps} />,
      className: "text-right",
      cell: (factura) =>
        Number(factura.saldoPendiente) > 0 ? (
          <span className="font-mono font-medium text-[oklch(0.5_0.2_27)]">
            {formatoMoneda.format(Number(factura.saldoPendiente))}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];
}

export default async function FacturasPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; q?: string; sort?: string; order?: string }>;
}) {
  const { estado, q, sort, order } = await searchParams;
  const estadoFiltro = ESTADOS_VALIDOS.includes(estado as EstadoFactura) ? (estado as EstadoFactura) : undefined;
  const busqueda = q?.trim().toLowerCase() ?? "";
  const sortActual = SORT_KEYS.includes(sort as SortKey) ? (sort as SortKey) : undefined;
  const orderActual: SortOrder = order === "asc" ? "asc" : "desc";

  // Fetched once, unfiltered: the KPI cards summarize every factura of the
  // sede regardless of which estado the list below is currently filtered to.
  const [facturas, ordenesFacturables] = await Promise.all([listFacturas(), listOrdenesFacturables()]);
  const filtradas = facturas
    .filter((factura) => !estadoFiltro || factura.estado === estadoFiltro)
    .filter(
      (factura) =>
        !busqueda ||
        String(factura.numero).includes(busqueda) ||
        factura.cliente.nombre.toLowerCase().includes(busqueda) ||
        factura.orden.vehiculo.placa.toLowerCase().includes(busqueda),
    );

  const ahora = new Date();
  const inicioMes = inicioMesBogota(ahora);
  const finMes = inicioMesBogota(ahora, 1);
  const emitidasMes = facturas.filter((factura) => factura.createdAt >= inicioMes && factura.createdAt < finMes);

  const pendientes = facturas.filter((factura) => factura.estado === "PENDIENTE");
  const porCobrarMonto = pendientes.reduce((suma, factura) => suma + Number(factura.saldoPendiente), 0);

  // "Cobrado" = total ya pagado de cada factura (total - saldoPendiente), sin
  // importar su estado actual: cubre un abono parcial sobre una factura que
  // sigue PENDIENTE, no solo las que ya quedaron en PAGADA.
  const cobrado = facturas.reduce((suma, factura) => suma + (Number(factura.total) - Number(factura.saldoPendiente)), 0);

  const pagadas = facturas.filter((factura) => factura.estado === "PAGADA");
  const ticketPromedio = pagadas.length > 0 ? cobrado / pagadas.length : 0;

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Facturas</h1>
        <NuevaFacturaDialog ordenes={ordenesFacturables} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Emitidas en el mes"
          value={emitidasMes.length}
          subtitle={`${emitidasMes.length} ${emitidasMes.length === 1 ? "factura" : "facturas"} este mes`}
          icon={<FileText className="size-5 text-primary" />}
        />

        <KpiCard
          title="Por cobrar"
          value={formatoMoneda.format(porCobrarMonto)}
          valueColor="warning"
          subtitle={`${pendientes.length} ${pendientes.length === 1 ? "factura" : "facturas"} con saldo pendiente`}
          subtitleColor="warning"
          subtitleIcon="dot"
          highlight={pendientes.length > 0}
          icon={<AlertCircle className="size-5 text-primary" />}
        />

        <KpiCard
          title="Cobrado"
          value={formatoMoneda.format(cobrado)}
          valueColor="success"
          subtitle={`${pagadas.length} ${pagadas.length === 1 ? "factura pagada" : "facturas pagadas"}`}
          subtitleColor="success"
          subtitleIcon="up"
          icon={<CheckCircle className="size-5 text-[oklch(0.4_0.1_150)]" />}
          iconBgColor="bg-[oklch(0.4_0.1_150/0.1)]"
        />

        <KpiCard
          title="Ticket promedio"
          value={pagadas.length > 0 ? formatoMoneda.format(ticketPromedio) : "—"}
          subtitle={pagadas.length > 0 ? `sobre ${pagadas.length} ${pagadas.length === 1 ? "factura pagada" : "facturas pagadas"}` : "Sin facturas pagadas aún"}
          icon={<Zap className="size-5 text-violet-600" />}
          iconBgColor="bg-violet-500/10"
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
                href={construirHrefFacturas({ q, sort: sortActual, order: orderActual })}
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
                  href={construirHrefFacturas({ estado: value, q, sort: sortActual, order: orderActual })}
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
              {sortActual ? <input type="hidden" name="sort" value={sortActual} /> : null}
              {sortActual && orderActual === "asc" ? <input type="hidden" name="order" value="asc" /> : null}
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
            columns={buildColumns(sortActual, orderActual, estadoFiltro, q)}
            rows={sortActual ? [...filtradas].sort((a, b) => compararFacturas(a, b, sortActual, orderActual)) : filtradas}
            getRowKey={(factura) => factura.id}
            rowHref={(factura) => `/facturas/${factura.id}`}
            emptyMessage="No hay facturas en este estado."
          />
        </CardContent>
      </Card>
    </main>
  );
}
