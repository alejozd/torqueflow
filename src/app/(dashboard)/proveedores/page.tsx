import { listProveedores } from "@/app/actions/proveedor-actions";
import { NuevoProveedorForm } from "./nuevo-proveedor-form";
import { DataTable, type DataTableColumn } from "@/components/data-table";

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
    <main>
      <h1>Proveedores</h1>
      <NuevoProveedorForm />
      <DataTable
        columns={COLUMNS}
        rows={proveedores}
        getRowKey={(proveedor) => proveedor.id}
        emptyMessage="No hay proveedores registrados."
      />
    </main>
  );
}
