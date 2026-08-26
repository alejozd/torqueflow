import { listBodegas } from "@/app/actions/bodega-actions";
import { NuevoBodegaForm } from "./nuevo-bodega-form";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type BodegaRow = Awaited<ReturnType<typeof listBodegas>>[number];

const COLUMNS: DataTableColumn<BodegaRow>[] = [{ header: "Nombre", cell: (bodega) => bodega.nombre }];

export default async function BodegasPage() {
  const bodegas = await listBodegas();

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Bodegas</h1>

      <Card>
        <CardHeader>
          <CardTitle>Nueva bodega</CardTitle>
        </CardHeader>
        <CardContent>
          <NuevoBodegaForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={COLUMNS}
            rows={bodegas}
            getRowKey={(bodega) => bodega.id}
            emptyMessage="No hay bodegas registradas."
          />
        </CardContent>
      </Card>
    </main>
  );
}
