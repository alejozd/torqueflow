import { listBodegas } from "@/app/actions/bodega-actions";
import { NuevoBodegaForm } from "./nuevo-bodega-form";
import { DataTable, type DataTableColumn } from "@/components/data-table";

type BodegaRow = Awaited<ReturnType<typeof listBodegas>>[number];

const COLUMNS: DataTableColumn<BodegaRow>[] = [{ header: "Nombre", cell: (bodega) => bodega.nombre }];

export default async function BodegasPage() {
  const bodegas = await listBodegas();

  return (
    <main>
      <h1>Bodegas</h1>
      <NuevoBodegaForm />
      <DataTable
        columns={COLUMNS}
        rows={bodegas}
        getRowKey={(bodega) => bodega.id}
        emptyMessage="No hay bodegas registradas."
      />
    </main>
  );
}
