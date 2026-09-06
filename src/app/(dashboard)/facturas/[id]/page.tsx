import Link from "next/link";
import { notFound } from "next/navigation";
import { getFactura } from "@/app/actions/factura-actions";
import { RegistrarPagoForm } from "./registrar-pago-form";
import type { EstadoFactura, MetodoPago } from "@/generated/prisma-tenant";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KPI_TONE } from "@/components/ui/kpi-card";
import { formatoFechaCorta } from "@/lib/fecha-bogota";
import { cn } from "@/lib/utils";

const METODO_PAGO_LABELS: Record<MetodoPago, string> = {
  EFECTIVO: "Efectivo",
  TARJETA: "Tarjeta",
  TRANSFERENCIA: "Transferencia",
  OTRO: "Otro",
};

// Same PENDIENTE/PAGADA badge convention as facturas/page.tsx and
// cotizaciones/[id]/page.tsx -- kept local here too rather than extracted to
// a shared module neither page asked for.
const ESTADO_LABELS: Record<EstadoFactura, string> = {
  PENDIENTE: "Pendiente",
  PAGADA: "Pagada",
};

const ESTADO_BADGE_VARIANT: Partial<Record<EstadoFactura, "default">> = {
  PENDIENTE: "default",
};

const ESTADO_BADGE_CLASSNAME: Record<EstadoFactura, string> = {
  PENDIENTE: "",
  PAGADA: "border-transparent bg-[oklch(0.4_0.1_150/0.1)] text-[oklch(0.4_0.1_150)]",
};

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

type Factura = NonNullable<Awaited<ReturnType<typeof getFactura>>>;
type PagoRow = Factura["pagos"][number];

// Merges orden.items and orden.manoDeObra into one shape so the "Detalle"
// card can render a single DataTable with proper columns -- same tipo-badge
// convention (Repuesto vs Mano de obra) as cotizaciones/[id]/page.tsx's
// buildItemColumns, kept consistent across both modules.
type DetalleRow = {
  id: string;
  tipo: "REPUESTO" | "MANO_OBRA";
  descripcion: string;
  cantidad: number | null;
  precioUnitario: number;
  importe: number;
};

function buildDetalleRows(factura: Factura): DetalleRow[] {
  const items: DetalleRow[] = factura.orden.items.map((item) => ({
    id: item.id,
    tipo: "REPUESTO" as const,
    descripcion: item.descripcion,
    cantidad: item.cantidad,
    precioUnitario: Number(item.precioUnitario),
    importe: item.cantidad * Number(item.precioUnitario),
  }));
  const manoDeObra: DetalleRow[] = factura.orden.manoDeObra.map((linea) => ({
    id: linea.id,
    tipo: "MANO_OBRA" as const,
    descripcion: linea.descripcion,
    cantidad: null,
    precioUnitario: Number(linea.valor),
    importe: Number(linea.valor),
  }));
  return [...items, ...manoDeObra];
}

const DETALLE_COLUMNS: DataTableColumn<DetalleRow>[] = [
  {
    header: "Concepto",
    cell: (row) => <span className="text-sm">{row.descripcion}</span>,
  },
  {
    header: "Tipo",
    cell: (row) => (
      <Badge
        variant="outline"
        className={
          row.tipo === "REPUESTO"
            ? "border-transparent bg-[oklch(0.7_0.15_60/0.15)] text-[10px] text-[oklch(0.55_0.15_60)]"
            : "border-transparent bg-[oklch(0.44_0.12_250/0.1)] text-[10px] text-[oklch(0.44_0.12_250)]"
        }
      >
        {row.tipo === "REPUESTO" ? "Repuesto" : "Mano de obra"}
      </Badge>
    ),
  },
  {
    header: "Cant.",
    className: "text-right",
    cell: (row) => <span className="font-mono text-sm">{row.cantidad ?? "—"}</span>,
  },
  {
    header: "Precio unit.",
    className: "text-right",
    cell: (row) => <span className="font-mono text-sm text-muted-foreground">{formatoMoneda.format(row.precioUnitario)}</span>,
  },
  {
    header: "Importe",
    className: "text-right",
    cell: (row) => <span className="font-mono text-sm font-medium">{formatoMoneda.format(row.importe)}</span>,
  },
];

const PAGOS_COLUMNS: DataTableColumn<PagoRow>[] = [
  {
    header: "Fecha",
    cell: (pago) => <span className="text-sm">{formatoFechaCorta.format(pago.createdAt)}</span>,
  },
  {
    header: "Método",
    cell: (pago) => <Badge variant="outline">{METODO_PAGO_LABELS[pago.metodoPago]}</Badge>,
  },
  {
    header: "Referencia",
    cell: (pago) => (
      <span className={cn("text-sm text-muted-foreground", pago.referencia && "font-mono")}>{pago.referencia ?? "—"}</span>
    ),
  },
  {
    header: "Monto",
    className: "text-right",
    cell: (pago) => <span className="font-mono text-sm font-medium">{formatoMoneda.format(Number(pago.monto))}</span>,
  },
];

export default async function FacturaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const factura = await getFactura(id);

  if (!factura) {
    notFound();
  }

  const detalleRows = buildDetalleRows(factura);
  const cobrado = Number(factura.total) - Number(factura.saldoPendiente);
  const saldoTone = Number(factura.saldoPendiente) > 0 ? KPI_TONE.warning : KPI_TONE.success;

  return (
    <main className="flex flex-col gap-4">
      <Link
        href="/facturas"
        className="flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        ← Facturas
      </Link>

      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Factura #{factura.numero}</h1>
          <Badge variant={ESTADO_BADGE_VARIANT[factura.estado]} className={ESTADO_BADGE_CLASSNAME[factura.estado]}>
            {ESTADO_LABELS[factura.estado]}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {factura.cliente.nombre} · {factura.orden.vehiculo.placa} · {formatoFechaCorta.format(factura.createdAt)}
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Cliente y vehículo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Cliente</p>
                  <p className="text-sm">{factura.cliente.nombre}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Teléfono</p>
                  <p className="text-sm">{factura.cliente.telefono ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Documento</p>
                  <p className="text-sm">{factura.cliente.documento ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Vehículo</p>
                  <p className="font-mono text-sm">{factura.orden.vehiculo.placa}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Modelo</p>
                  <p className="text-sm">
                    {factura.orden.vehiculo.marca} {factura.orden.vehiculo.modelo}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Orden</p>
                  <Link href={`/ordenes/${factura.ordenId}`} className="text-sm font-medium text-primary hover:underline">
                    Ver orden →
                  </Link>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Emitida por</p>
                  <p className="text-sm">
                    {factura.emitidaPor.nombre} · {formatoFechaCorta.format(factura.createdAt)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                Detalle{" "}
                <span className="font-normal text-muted-foreground">
                  · {detalleRows.length} {detalleRows.length === 1 ? "concepto" : "conceptos"}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={DETALLE_COLUMNS}
                rows={detalleRows}
                getRowKey={(row) => row.id}
                emptyMessage="Esta factura no tiene conceptos."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                Pagos{" "}
                <span className="font-normal text-muted-foreground">
                  · {factura.pagos.length} {factura.pagos.length === 1 ? "pago" : "pagos"}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <RegistrarPagoForm facturaId={factura.id} estado={factura.estado} />
              <DataTable
                columns={PAGOS_COLUMNS}
                rows={factura.pagos}
                getRowKey={(pago) => pago.id}
                emptyMessage="Aún no hay pagos registrados."
              />
            </CardContent>
          </Card>
        </div>

        <div className="sticky top-4 flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Liquidación</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-0">
              <div className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-mono">{formatoMoneda.format(Number(factura.subtotal))}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-muted-foreground">Descuento</span>
                <span className="font-mono">−{formatoMoneda.format(Number(factura.descuento))}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-muted-foreground">IVA (19%)</span>
                <span className="font-mono">{formatoMoneda.format(Number(factura.iva))}</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between border-t border-border pt-2.5">
                <span className="text-sm font-semibold">Total</span>
                <span className="font-mono text-lg font-semibold">{formatoMoneda.format(Number(factura.total))}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-muted-foreground">Cobrado</span>
                <span className={cn("font-mono", KPI_TONE.success.icon)}>{formatoMoneda.format(cobrado)}</span>
              </div>
              <div className={cn("mt-2 flex items-center justify-between rounded-lg px-3 py-2.5", saldoTone.cardBg)}>
                <span className={cn("text-sm font-medium", saldoTone.icon)}>Saldo pendiente</span>
                <span className={cn("font-mono text-sm font-semibold", saldoTone.icon)}>
                  {formatoMoneda.format(Number(factura.saldoPendiente))}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
