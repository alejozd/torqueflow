import { listRepuestos } from "@/app/actions/repuesto-actions";
import { listBodegas } from "@/app/actions/bodega-actions";
import { listProveedores } from "@/app/actions/proveedor-actions";
import { NuevoRepuestoForm } from "./nuevo-repuesto-form";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Repuestos</h1>

      <Card>
        <CardHeader>
          <CardTitle>Nuevo repuesto</CardTitle>
        </CardHeader>
        <CardContent>
          <NuevoRepuestoForm bodegas={bodegas} proveedores={proveedores} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={COLUMNS}
            rows={repuestos}
            getRowKey={(repuesto) => repuesto.id}
            emptyMessage="No hay repuestos registrados."
          />
        </CardContent>
      </Card>
    </main>
  );
}
