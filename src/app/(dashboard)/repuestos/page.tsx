import { listRepuestos } from "@/app/actions/repuesto-actions";
import { listBodegas } from "@/app/actions/bodega-actions";
import { listProveedores } from "@/app/actions/proveedor-actions";
import { NuevoRepuestoForm } from "./nuevo-repuesto-form";
import { DataTable, type DataTableColumn } from "@/components/data-table";

type RepuestoRow = Awaited<ReturnType<typeof listRepuestos>>[number];

const COLUMNS: DataTableColumn<RepuestoRow>[] = [
  {
    header: "Repuesto",
    cell: (repuesto) => (
      <>
        {repuesto.codigo} — {repuesto.nombre} — stock: {repuesto.stockActual} — {repuesto.bodega.nombre}
        {repuesto.stockActual <= repuesto.stockMinimo ? " ⚠ stock bajo" : ""}
      </>
    ),
  },
];

export default async function RepuestosPage() {
  const [repuestos, bodegas, proveedores] = await Promise.all([
    listRepuestos(),
    listBodegas(),
    listProveedores(),
  ]);

  return (
    <main>
      <h1>Repuestos</h1>
      <NuevoRepuestoForm bodegas={bodegas} proveedores={proveedores} />
      <DataTable
        columns={COLUMNS}
        rows={repuestos}
        getRowKey={(repuesto) => repuesto.id}
        emptyMessage="No hay repuestos registrados."
      />
    </main>
  );
}
