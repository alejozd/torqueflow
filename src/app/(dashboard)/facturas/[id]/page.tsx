import { notFound } from "next/navigation";
import { getFactura } from "@/app/actions/factura-actions";
import { RegistrarPagoForm } from "./registrar-pago-form";
import type { MetodoPago } from "@/generated/prisma-tenant";
import { DataTable, type DataTableColumn } from "@/components/data-table";

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
    <main>
      <h1>
        Factura #{factura.numero} — {factura.cliente.nombre}
      </h1>
      <p>Vehículo: {factura.orden.vehiculo.placa}</p>
      <p>Estado: {factura.estado === "PAGADA" ? "Pagada" : "Pendiente"}</p>

      <h2>Ítems</h2>
      <DataTable
        columns={ITEMS_COLUMNS}
        rows={factura.orden.items}
        getRowKey={(item) => item.id}
        emptyMessage="Esta factura no tiene ítems."
      />

      <h2>Mano de obra</h2>
      <DataTable
        columns={MANO_OBRA_COLUMNS}
        rows={factura.orden.manoDeObra}
        getRowKey={(linea) => linea.id}
        emptyMessage="Esta factura no tiene mano de obra."
      />

      <p>Subtotal: {factura.subtotal.toString()}</p>
      <p>Descuento: {factura.descuento.toString()}</p>
      <p>IVA (19%): {factura.iva.toString()}</p>
      <p>Total: {factura.total.toString()}</p>
      <p>Saldo pendiente: {factura.saldoPendiente.toString()}</p>

      <h2>Pagos</h2>
      <RegistrarPagoForm facturaId={factura.id} estado={factura.estado} />
      <DataTable
        columns={PAGOS_COLUMNS}
        rows={factura.pagos}
        getRowKey={(pago) => pago.id}
        emptyMessage="Esta factura no tiene pagos registrados."
      />
    </main>
  );
}
