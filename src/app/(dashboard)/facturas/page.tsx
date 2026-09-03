import Link from "next/link";
import { listFacturas, listOrdenesFacturables, type FacturaWithDetalle } from "@/app/actions/factura-actions";
import { NuevaFacturaDialog } from "./nueva-factura-dialog";
import type { EstadoFactura } from "@/generated/prisma-tenant";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const ESTADOS_VALIDOS: EstadoFactura[] = ["PENDIENTE", "PAGADA"];

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

function construirHrefFacturas(base: { estado?: EstadoFactura; q?: string }): string {
  const params = new URLSearchParams();
  if (base.estado) params.set("estado", base.estado);
  if (base.q) params.set("q", base.q);
  const query = params.toString();
  return query ? `/facturas?${query}` : "/facturas";
}

type FacturaRow = FacturaWithDetalle;

const COLUMNS: DataTableColumn<FacturaRow>[] = [
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
    header: "Emitida",
    cell: (factura) => <span className="text-sm text-muted-foreground">{formatoFecha.format(factura.createdAt)}</span>,
  },
  {
    header: "Estado",
    cell: (factura) => (
      <Badge variant={ESTADO_BADGE_VARIANT[factura.estado]} className={ESTADO_BADGE_CLASSNAME[factura.estado]}>
        {ESTADO_LABELS[factura.estado]}
      </Badge>
    ),
  },
  {
    header: "Total",
    className: "text-right",
    cell: (factura) => <span className="font-mono font-medium">{formatoMoneda.format(Number(factura.total))}</span>,
  },
  {
    header: "Saldo",
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

export default async function FacturasPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; q?: string }>;
}) {
  const { estado, q } = await searchParams;
  const estadoFiltro = ESTADOS_VALIDOS.includes(estado as EstadoFactura) ? (estado as EstadoFactura) : undefined;
  const busqueda = q?.trim().toLowerCase() ?? "";

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
  const emitidasMesMonto = emitidasMes.reduce((suma, factura) => suma + Number(factura.total), 0);

  const pendientes = facturas.filter((factura) => factura.estado === "PENDIENTE");
  const porCobrarMonto = pendientes.reduce((suma, factura) => suma + Number(factura.saldoPendiente), 0);

  // "Cobrado" = total ya pagado de cada factura (total - saldoPendiente), sin
  // importar su estado actual: cubre un abono parcial sobre una factura que
  // sigue PENDIENTE, no solo las que ya quedaron en PAGADA.
  const cobrado = facturas.reduce((suma, factura) => suma + (Number(factura.total) - Number(factura.saldoPendiente)), 0);

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Facturas</h1>
        <NuevaFacturaDialog ordenes={ordenesFacturables} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Emitidas en el mes</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <span className="font-mono text-2xl font-semibold">{emitidasMes.length}</span>
            {emitidasMes.length > 0 ? (
              <span className="font-mono text-xs text-muted-foreground">{formatoMoneda.format(emitidasMesMonto)}</span>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Por cobrar</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <span className="font-mono text-2xl font-semibold">{pendientes.length}</span>
            {pendientes.length > 0 ? (
              <span className="font-mono text-xs text-[oklch(0.5_0.2_27)]">{formatoMoneda.format(porCobrarMonto)}</span>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Cobrado</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-mono text-2xl font-semibold text-[oklch(0.4_0.1_150)]">
              {formatoMoneda.format(cobrado)}
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
                href={construirHrefFacturas({ q })}
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
                  href={construirHrefFacturas({ estado: value, q })}
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
            getRowKey={(factura) => factura.id}
            rowHref={(factura) => `/facturas/${factura.id}`}
            emptyMessage="No hay facturas en este estado."
          />
        </CardContent>
      </Card>
    </main>
  );
}
