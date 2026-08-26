import { listProveedores } from "@/app/actions/proveedor-actions";
import { NuevoProveedorForm } from "./nuevo-proveedor-form";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ProveedorRow = Awaited<ReturnType<typeof listProveedores>>[number];

const COLUMNS: DataTableColumn<ProveedorRow>[] = [
  {
    header: "Proveedor",
    cell: (proveedor) => (
      <>
        {proveedor.nombre} — {proveedor.telefono ?? "—"} — {proveedor.email ?? "—"}
      </>
    ),
  },
];

export default async function ProveedoresPage() {
  const proveedores = await listProveedores();

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Proveedores</h1>

      <Card>
        <CardHeader>
          <CardTitle>Nuevo proveedor</CardTitle>
        </CardHeader>
        <CardContent>
          <NuevoProveedorForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={COLUMNS}
            rows={proveedores}
            getRowKey={(proveedor) => proveedor.id}
            emptyMessage="No hay proveedores registrados."
          />
        </CardContent>
      </Card>
    </main>
  );
}
