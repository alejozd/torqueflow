import { notFound } from "next/navigation";
import { getFactura } from "@/app/actions/factura-actions";
import { RegistrarPagoForm } from "./registrar-pago-form";
import type { MetodoPago } from "@/generated/prisma-tenant";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const METODO_PAGO_LABELS: Record<MetodoPago, string> = {
  EFECTIVO: "Efectivo",
  TARJETA: "Tarjeta",
  TRANSFERENCIA: "Transferencia",
  OTRO: "Otro",
};

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
        {linea.descripcion} — {linea.horas.toString()}h x {linea.precioHora.toString()}
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
      <h1 className="text-2xl font-semibold">
        Factura #{factura.numero} — {factura.cliente.nombre}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Información de la factura</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Vehículo</p>
              <p>{factura.orden.vehiculo.placa}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Estado</p>
              <p>{factura.estado === "PAGADA" ? "Pagada" : "Pendiente"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Subtotal</p>
              <p>{factura.subtotal.toString()}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Descuento</p>
              <p>{factura.descuento.toString()}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">IVA (19%)</p>
              <p>{factura.iva.toString()}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total</p>
              <p>{factura.total.toString()}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Saldo pendiente</p>
              <p>{factura.saldoPendiente.toString()}</p>
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
