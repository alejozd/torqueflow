import { notFound } from "next/navigation";
import { getEntrada } from "@/app/actions/entrada-mercancia-actions";
import { listRepuestoOptions } from "@/app/actions/repuesto-actions";
import { AgregarEntradaItemForm } from "./agregar-entrada-item-form";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Entrada de mercancía — {entrada.proveedor.nombre}</h1>

      <Card>
        <CardHeader>
          <CardTitle>Información de la entrada</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Bodega</p>
              <p>{entrada.bodega.nombre}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Fecha</p>
              <p>{new Date(entrada.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ítems recibidos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <AgregarEntradaItemForm entradaId={entrada.id} repuestos={repuestos} />
          <DataTable
            columns={ITEMS_COLUMNS}
            rows={entrada.items}
            getRowKey={(item) => item.id}
            emptyMessage="Esta entrada no tiene ítems registrados."
          />
        </CardContent>
      </Card>
    </main>
  );
}
