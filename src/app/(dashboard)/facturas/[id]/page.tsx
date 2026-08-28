import { notFound } from "next/navigation";
import { getFactura } from "@/app/actions/factura-actions";
import { RegistrarPagoForm } from "./registrar-pago-form";
import type { EstadoFactura, MetodoPago } from "@/generated/prisma-tenant";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const METODO_PAGO_LABELS: Record<MetodoPago, string> = {
  EFECTIVO: "Efectivo",
  TARJETA: "Tarjeta",
  TRANSFERENCIA: "Transferencia",
  OTRO: "Otro",
};

// Same PENDIENTE/PAGADA badge convention as facturas/page.tsx.
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
type ItemRow = Factura["orden"]["items"][number];
type ManoObraRow = Factura["orden"]["manoDeObra"][number];
type PagoRow = Factura["pagos"][number];

const ITEMS_COLUMNS: DataTableColumn<ItemRow>[] = [
  {
    header: "Ítem",
    cell: (item) => (
      <>
        {item.descripcion} — {item.cantidad} x {item.precioUnitario.toString()}
      </>
    ),
  },
];

const MANO_OBRA_COLUMNS: DataTableColumn<ManoObraRow>[] = [
  {
    header: "Mano de obra",
    cell: (linea) => (
      <>
        {linea.descripcion} — {linea.valor.toString()}
      </>
    ),
  },
];

const PAGOS_COLUMNS: DataTableColumn<PagoRow>[] = [
  {
    header: "Pago",
    cell: (pago) => (
      <>
        {new Date(pago.createdAt).toLocaleDateString()} — {METODO_PAGO_LABELS[pago.metodoPago]} —{" "}
        {pago.monto.toString()}
      </>
    ),
  },
];

export default async function FacturaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const factura = await getFactura(id);

  if (!factura) {
    notFound();
  }

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">
          Factura #{factura.numero} — {factura.cliente.nombre}
        </h1>
        <Badge variant={ESTADO_BADGE_VARIANT[factura.estado]} className={ESTADO_BADGE_CLASSNAME[factura.estado]}>
          {ESTADO_LABELS[factura.estado]}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Información de la factura</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Vehículo</p>
              <p className="font-mono text-sm">{factura.orden.vehiculo.placa}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Subtotal</p>
              <p className="font-mono text-sm">{formatoMoneda.format(Number(factura.subtotal))}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Descuento</p>
              <p className="font-mono text-sm">{formatoMoneda.format(Number(factura.descuento))}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">IVA (19%)</p>
              <p className="font-mono text-sm">{formatoMoneda.format(Number(factura.iva))}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="font-mono text-sm font-medium">{formatoMoneda.format(Number(factura.total))}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Saldo pendiente</p>
              <p className="font-mono text-sm font-medium text-[oklch(0.5_0.2_27)]">
                {formatoMoneda.format(Number(factura.saldoPendiente))}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ítems</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={ITEMS_COLUMNS}
            rows={factura.orden.items}
            getRowKey={(item) => item.id}
            emptyMessage="Esta factura no tiene ítems."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mano de obra</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={MANO_OBRA_COLUMNS}
            rows={factura.orden.manoDeObra}
            getRowKey={(linea) => linea.id}
            emptyMessage="Esta factura no tiene mano de obra."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pagos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <RegistrarPagoForm facturaId={factura.id} estado={factura.estado} />
          <DataTable
            columns={PAGOS_COLUMNS}
            rows={factura.pagos}
            getRowKey={(pago) => pago.id}
            emptyMessage="Esta factura no tiene pagos registrados."
          />
        </CardContent>
      </Card>
    </main>
  );
}
