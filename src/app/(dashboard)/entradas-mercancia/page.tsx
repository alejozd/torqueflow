import Link from "next/link";
import { listEntradas } from "@/app/actions/entrada-mercancia-actions";
import { listProveedores } from "@/app/actions/proveedor-actions";
import { listBodegas } from "@/app/actions/bodega-actions";
import { NuevaEntradaMercanciaForm } from "./nueva-entrada-mercancia-form";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type EntradaRow = Awaited<ReturnType<typeof listEntradas>>[number];

const COLUMNS: DataTableColumn<EntradaRow>[] = [
  {
    header: "Entrada",
    cell: (entrada) => (
      <Link href={`/entradas-mercancia/${entrada.id}`}>
        {new Date(entrada.createdAt).toLocaleDateString()} — {entrada.proveedor.nombre} —{" "}
        {entrada.bodega.nombre} — {entrada.items.length} ítem(s)
      </Link>
    ),
  },
];

export default async function EntradasMercanciaPage() {
  const [entradas, proveedores, bodegas] = await Promise.all([
    listEntradas(),
    listProveedores(),
    listBodegas(),
  ]);

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Entradas de mercancía</h1>

      <Card>
        <CardHeader>
          <CardTitle>Nueva entrada</CardTitle>
        </CardHeader>
        <CardContent>
          <NuevaEntradaMercanciaForm proveedores={proveedores} bodegas={bodegas} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={COLUMNS}
            rows={entradas}
            getRowKey={(entrada) => entrada.id}
            emptyMessage="No hay entradas de mercancía registradas."
          />
        </CardContent>
      </Card>
    </main>
  );
}
