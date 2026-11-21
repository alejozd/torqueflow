import Link from "next/link";
import { AlertCircle, ArrowDown, ArrowUp, Car, CheckCircle, DollarSign, FileText } from "lucide-react";
import { listFacturas, listOrdenesFacturables, type FacturaWithDetalle } from "@/app/actions/factura-actions";
import { getResumenFeTaller } from "@/app/actions/factura-electronica-actions";
import { cuentaParaDian, estaAnulada, estadoDian, necesitaAtencionDian, resumenCobros } from "@/lib/factura-electronica/textos";
import { InsigniaDian } from "./estado-dian";
import { NuevaFacturaDialog } from "./nueva-factura-dialog";
import type { EstadoFactura } from "@/generated/prisma-tenant";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { KPI_TONE, KpiCard } from "@/components/ui/kpi-card";
import { inferirColorVehiculo } from "@/lib/color-vehiculo";
import { formatoFechaCorta, formatoFechaRelativa, inicioMesBogota } from "@/lib/fecha-bogota";
import { cn } from "@/lib/utils";
import { requirePermiso } from "@/lib/auth/guards";

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

// PENDIENTE's badge is a SOLID --primary fill (Badge's own "default"
// variant), so its dot uses --primary-foreground (the badge's own text
// color) for contrast -- a --primary dot would be invisible on a --primary
// background. PAGADA's badge is a light tint, so its dot reuses the same
// green oklch as its text, same technique ordenes/page.tsx uses.
const ESTADO_DOT_COLOR: Record<EstadoFactura, string> = {
  PENDIENTE: "var(--primary-foreground)",
  PAGADA: "oklch(0.4 0.1 150)",
};

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function construirHrefFacturas(base: {
  estado?: EstadoFactura;
  q?: string;
  sort?: SortKey;
  order?: SortOrder;
  dian?: boolean;
}): string {
  const params = new URLSearchParams();
  if (base.estado) params.set("estado", base.estado);
  if (base.dian) params.set("dian", "pendientes");
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
  dian,
}: {
  label: string;
  sortKey: SortKey;
  sortActual: SortKey | undefined;
  orderActual: SortOrder;
  estadoFiltro: EstadoFactura | undefined;
  q: string | undefined;
  dian: boolean;
}) {
  const isActive = sortActual === sortKey;
  const nextOrder: SortOrder = isActive && orderActual === "desc" ? "asc" : "desc";
  return (
    <Link
      href={construirHrefFacturas({ estado: estadoFiltro, q, sort: sortKey, order: nextOrder, dian })}
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
  ahora: Date,
  dian: boolean,
  fe: { activa: boolean; activadaDesde: Date | null },
): DataTableColumn<FacturaRow>[] {
  const sortableHeaderProps = { sortActual, orderActual, estadoFiltro, q, dian };
  return [
    {
      header: "Factura",
      cell: (factura) => <span className="font-mono text-sm font-medium">#{factura.numero}</span>,
    },
    {
      header: "Cliente",
      cell: (factura) => (
        <div className="flex flex-col gap-0.5">
          <span>{factura.cliente.nombre}</span>
          <span className="text-xs text-muted-foreground">{factura.cliente.documento ?? "Sin documento"}</span>
        </div>
      ),
    },
    {
      header: "Vehículo",
      cell: (factura) => {
        const tono = inferirColorVehiculo(factura.orden.vehiculo.color);
        return (
          <div className="flex flex-col gap-1">
            <Badge
              variant="outline"
              className={cn("w-fit font-mono text-xs tracking-wider", tono && "border-transparent", tono?.bg, tono?.text)}
            >
              <Car />
              {factura.orden.vehiculo.placa.toUpperCase()}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {factura.orden.vehiculo.marca} {factura.orden.vehiculo.modelo}
              {factura.orden.vehiculo.color ? ` · ${factura.orden.vehiculo.color}` : ""}
            </span>
          </div>
        );
      },
    },
    {
      header: <SortableHeader label="Emitida" sortKey="fecha" {...sortableHeaderProps} />,
      cell: (factura) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-sm">{formatoFechaCorta.format(factura.createdAt)}</span>
          <span className="text-xs text-muted-foreground">{formatoFechaRelativa(factura.createdAt, ahora)}</span>
        </div>
      ),
    },
    {
      header: <SortableHeader label="Estado" sortKey="estado" {...sortableHeaderProps} />,
      cell: (factura) =>
        estaAnulada(factura) ? (
          <Badge variant="outline" className="gap-1.5 text-muted-foreground">
            <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground" />
            Anulada
          </Badge>
        ) : (
          <Badge
            variant={ESTADO_BADGE_VARIANT[factura.estado]}
            className={cn("gap-1.5", ESTADO_BADGE_CLASSNAME[factura.estado])}
          >
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: ESTADO_DOT_COLOR[factura.estado] }}
            />
            {ESTADO_LABELS[factura.estado]}
          </Badge>
        ),
    },
    ...(fe.activa
      ? [
          {
            header: "DIAN",
            cell: (factura: FacturaRow) =>
              cuentaParaDian(factura.createdAt, fe.activadaDesde) || factura.documentosElectronicos.length > 0 ? (
                <InsigniaDian
                  estado={estadoDian(factura.documentosElectronicos[0], ahora)}
                  ambiente={factura.documentosElectronicos[0]?.ambiente}
                />
              ) : (
                <span className="text-muted-foreground">—</span>
              ),
          } satisfies DataTableColumn<FacturaRow>,
        ]
      : []),
    {
      header: <SortableHeader label="Total" sortKey="total" {...sortableHeaderProps} />,
      className: "text-right",
      cell: (factura) => <span className="font-mono font-medium">{formatoMoneda.format(Number(factura.total))}</span>,
    },
    {
      header: <SortableHeader label="Saldo" sortKey="saldo" {...sortableHeaderProps} />,
      className: "text-right",
      sticky: true,
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
  searchParams: Promise<{ estado?: string; q?: string; sort?: string; order?: string; dian?: string }>;
}) {
  await requirePermiso("facturas.ver");
  const { estado, q, sort, order, dian } = await searchParams;
  const filtroDian = dian === "pendientes";
  const estadoFiltro = ESTADOS_VALIDOS.includes(estado as EstadoFactura) ? (estado as EstadoFactura) : undefined;
  const busqueda = q?.trim().toLowerCase() ?? "";
  const sortActual = SORT_KEYS.includes(sort as SortKey) ? (sort as SortKey) : undefined;
  const orderActual: SortOrder = order === "asc" ? "asc" : "desc";

  // Fetched once, unfiltered: the KPI cards summarize every factura of the
  // sede regardless of which estado the list below is currently filtered to.
  const [facturas, ordenesFacturables, fe] = await Promise.all([
    listFacturas(),
    listOrdenesFacturables(),
    getResumenFeTaller(),
  ]);
  const ahora = new Date();
  const filtradas = facturas
    .filter(
      (factura) =>
        !estadoFiltro || (factura.estado === estadoFiltro && !(estadoFiltro === "PAGADA" && estaAnulada(factura))),
    )
    .filter(
      (factura) =>
        !filtroDian ||
        (fe.activa &&
          cuentaParaDian(factura.createdAt, fe.activadaDesde) &&
          necesitaAtencionDian(estadoDian(factura.documentosElectronicos[0], ahora))),
    )
    .filter(
      (factura) =>
        !busqueda ||
        String(factura.numero).includes(busqueda) ||
        factura.cliente.nombre.toLowerCase().includes(busqueda) ||
        factura.orden.vehiculo.placa.toLowerCase().includes(busqueda),
    );

  const inicioMes = inicioMesBogota(ahora);
  const finMes = inicioMesBogota(ahora, 1);
  const emitidasMes = facturas.filter((factura) => factura.createdAt >= inicioMes && factura.createdAt < finMes);

  // Las anuladas con nota crédito no cuentan como cobradas ni pagadas.
  const { cobrado, pagadas, ticketPromedio, porCobrarMonto, pendientes } = resumenCobros(facturas);

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-semibold">Facturas</h1>
          <Badge variant="outline" className="font-normal text-muted-foreground">
            {emitidasMes.length} {emitidasMes.length === 1 ? "factura" : "facturas"} este mes
          </Badge>
        </div>
        <NuevaFacturaDialog ordenes={ordenesFacturables} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Emitidas en el mes"
          value={emitidasMes.length}
          subtitle={`${emitidasMes.length} ${emitidasMes.length === 1 ? "factura" : "facturas"} este mes`}
          icon={<FileText className={cn("size-5", KPI_TONE.info.icon)} />}
          iconBgColor={KPI_TONE.info.iconBg}
          className={KPI_TONE.info.cardBg}
        />

        <KpiCard
          title="Por cobrar"
          value={formatoMoneda.format(porCobrarMonto)}
          valueColor="warning"
          subtitle={`${pendientes} ${pendientes === 1 ? "factura" : "facturas"} con saldo pendiente`}
          subtitleColor="warning"
          subtitleIcon="dot"
          highlight={pendientes > 0}
          icon={<AlertCircle className={cn("size-5", KPI_TONE.warning.icon)} />}
          iconBgColor={KPI_TONE.warning.iconBg}
          className={KPI_TONE.warning.cardBg}
        />

        <KpiCard
          title="Cobrado"
          value={formatoMoneda.format(cobrado)}
          valueColor="success"
          subtitle={`${pagadas} ${pagadas === 1 ? "factura pagada" : "facturas pagadas"}`}
          subtitleColor="success"
          subtitleIcon="up"
          icon={<CheckCircle className={cn("size-5", KPI_TONE.success.icon)} />}
          iconBgColor={KPI_TONE.success.iconBg}
          className={KPI_TONE.success.cardBg}
        />

        <KpiCard
          title="Ticket promedio"
          value={pagadas > 0 ? formatoMoneda.format(ticketPromedio) : "—"}
          valueColor="success"
          subtitle={pagadas > 0 ? `sobre ${pagadas} ${pagadas === 1 ? "factura pagada" : "facturas pagadas"}` : "Sin facturas pagadas aún"}
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
                href={construirHrefFacturas({ q, sort: sortActual, order: orderActual, dian: filtroDian })}
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
                  href={construirHrefFacturas({ estado: value, q, sort: sortActual, order: orderActual, dian: filtroDian })}
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
              {fe.activa ? (
                <Link
                  href={construirHrefFacturas({ estado: estadoFiltro, q, sort: sortActual, order: orderActual, dian: !filtroDian })}
                  aria-current={filtroDian ? "page" : undefined}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm transition-colors",
                    filtroDian
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  Sin enviar o rechazadas
                </Link>
              ) : null}
            </nav>

            <form role="search" className="flex items-center gap-2">
              {estadoFiltro ? <input type="hidden" name="estado" value={estadoFiltro} /> : null}
              {filtroDian ? <input type="hidden" name="dian" value="pendientes" /> : null}
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
            columns={buildColumns(sortActual, orderActual, estadoFiltro, q, ahora, filtroDian, fe)}
            rows={sortActual ? [...filtradas].sort((a, b) => compararFacturas(a, b, sortActual, orderActual)) : filtradas}
            getRowKey={(factura) => factura.id}
            rowHref={(factura) => `/facturas/${factura.id}`}
            emptyMessage={filtroDian ? "No hay facturas pendientes con la DIAN." : "No hay facturas en este estado."}
            headerClassName="bg-muted"
          />
        </CardContent>
      </Card>
    </main>
  );
}
