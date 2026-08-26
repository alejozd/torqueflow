import { listSedes } from "@/app/actions/sede-actions";
import { NuevaSedeForm } from "./nueva-sede-form";
import { EditarSedeForm } from "./editar-sede-form";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Sedes</h1>

      <Card>
        <CardHeader>
          <CardTitle>Nueva sede</CardTitle>
        </CardHeader>
        <CardContent>
          <NuevaSedeForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={COLUMNS}
            rows={sedes}
            getRowKey={(sede) => sede.id}
            emptyMessage="No hay sedes registradas."
          />
        </CardContent>
      </Card>
    </main>
  );
}
