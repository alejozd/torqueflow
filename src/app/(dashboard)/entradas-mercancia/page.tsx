import Link from "next/link";
import { listEntradas } from "@/app/actions/entrada-mercancia-actions";
import { listProveedores } from "@/app/actions/proveedor-actions";
import { listBodegas } from "@/app/actions/bodega-actions";
import { NuevaEntradaMercanciaForm } from "./nueva-entrada-mercancia-form";
import { DataTable, type DataTableColumn } from "@/components/data-table";

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
    <main>
      <h1>Entradas de mercancía</h1>
      <NuevaEntradaMercanciaForm proveedores={proveedores} bodegas={bodegas} />
      <DataTable
        columns={COLUMNS}
        rows={entradas}
        getRowKey={(entrada) => entrada.id}
        emptyMessage="No hay entradas de mercancía registradas."
      />
    </main>
  );
}
