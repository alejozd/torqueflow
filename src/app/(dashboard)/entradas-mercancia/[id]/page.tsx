import { notFound } from "next/navigation";
import { getEntrada } from "@/app/actions/entrada-mercancia-actions";
import { listRepuestoOptions } from "@/app/actions/repuesto-actions";
import { AgregarEntradaItemForm } from "./agregar-entrada-item-form";
import { DataTable, type DataTableColumn } from "@/components/data-table";

type Entrada = NonNullable<Awaited<ReturnType<typeof getEntrada>>>;
type ItemRow = Entrada["items"][number];

const ITEMS_COLUMNS: DataTableColumn<ItemRow>[] = [
  {
    header: "Ítem",
    cell: (item) => (
      <>
        {item.repuesto.codigo} — {item.repuesto.nombre} — {item.cantidad} x {item.precioCompraUnitario.toString()}
      </>
    ),
  },
];

export default async function EntradaMercanciaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entrada = await getEntrada(id);

  if (!entrada) {
    notFound();
  }

  const repuestos = await listRepuestoOptions(entrada.bodegaId);

  return (
    <main>
      <h1>Entrada de mercancía — {entrada.proveedor.nombre}</h1>
      <p>Bodega: {entrada.bodega.nombre}</p>
      <p>Fecha: {new Date(entrada.createdAt).toLocaleDateString()}</p>

      <h2>Ítems recibidos</h2>
      <AgregarEntradaItemForm entradaId={entrada.id} repuestos={repuestos} />
      <DataTable
        columns={ITEMS_COLUMNS}
        rows={entrada.items}
        getRowKey={(item) => item.id}
        emptyMessage="Esta entrada no tiene ítems registrados."
      />
    </main>
  );
}
