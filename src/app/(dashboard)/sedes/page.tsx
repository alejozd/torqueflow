import { listSedes } from "@/app/actions/sede-actions";
import { NuevaSedeForm } from "./nueva-sede-form";
import { EditarSedeForm } from "./editar-sede-form";
import { DataTable, type DataTableColumn } from "@/components/data-table";

type SedeRow = Awaited<ReturnType<typeof listSedes>>[number];

const COLUMNS: DataTableColumn<SedeRow>[] = [
  {
    header: "Nombre",
    cell: (sede) => (
      <>
        <h2>{sede.nombre}</h2>
        {sede.direccion ? <p>{sede.direccion}</p> : null}
      </>
    ),
  },
  {
    header: "Acciones",
    cell: (sede) => <EditarSedeForm sede={sede} />,
  },
];

export default async function SedesPage() {
  const sedes = await listSedes();

  return (
    <main>
      <h1>Sedes</h1>
      <NuevaSedeForm />
      <DataTable
        columns={COLUMNS}
        rows={sedes}
        getRowKey={(sede) => sede.id}
        emptyMessage="No hay sedes registradas."
      />
    </main>
  );
}
