import Link from "next/link";
import { requireSession } from "@/lib/auth/guards";
import { listBodegasConInventario, type BodegaConInventario } from "@/app/actions/bodega-actions";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { EditarBodegaDialog } from "./editar-bodega-dialog";

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

type BodegaRow = BodegaConInventario & { sedeNombre: string };

function contarStockBajo(bodega: BodegaConInventario): number {
  return bodega.repuestos.filter((repuesto) => repuesto.stockActual <= repuesto.stockMinimo).length;
}

function sumarUnidades(bodega: BodegaConInventario): number {
  return bodega.repuestos.reduce((suma, repuesto) => suma + repuesto.stockActual, 0);
}

function calcularValorInventario(bodega: BodegaConInventario): number {
  return bodega.repuestos.reduce(
    (suma, repuesto) => suma + repuesto.stockActual * Number(repuesto.precioCompra),
    0,
  );
}

const COLUMNS: DataTableColumn<BodegaRow>[] = [
  {
    header: "Bodega",
    cell: (bodega) => <span className="font-medium">{bodega.nombre}</span>,
  },
  {
    header: "Sede",
    cell: (bodega) => <span className="text-muted-foreground">{bodega.sedeNombre}</span>,
  },
  {
    header: "Referencias",
    cell: (bodega) => <span className="font-mono">{bodega.repuestos.length}</span>,
  },
  {
    header: "Unidades",
    cell: (bodega) => <span className="font-mono">{sumarUnidades(bodega)}</span>,
  },
  {
    header: "Valor inventario",
    cell: (bodega) => <span className="font-mono font-medium">{formatoMoneda.format(calcularValorInventario(bodega))}</span>,
  },
  {
    header: "Stock bajo",
    cell: (bodega) => {
      const bajo = contarStockBajo(bodega);
      return bajo > 0 ? (
        <span className="font-mono font-medium text-[oklch(0.55_0.15_60)]">{bajo}</span>
      ) : (
        <span className="font-mono text-muted-foreground">0</span>
      );
    },
  },
  {
    header: "Acciones",
    cell: (bodega) => <EditarBodegaDialog bodega={{ id: bodega.id, nombre: bodega.nombre }} />,
  },
];

export default async function BodegasPage() {
  const [session, bodegas] = await Promise.all([requireSession(), listBodegasConInventario()]);

  const filas: BodegaRow[] = bodegas.map((bodega) => ({ ...bodega, sedeNombre: session.user.sedeActivaNombre }));

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Bodegas</h1>
          <p className="text-sm text-muted-foreground">
            {bodegas.length} bodegas registradas en Sede {session.user.sedeActivaNombre}
          </p>
        </div>
        <Link href="/bodegas/nuevo" className={buttonVariants({})}>
          Nueva bodega
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={COLUMNS}
            rows={filas}
            getRowKey={(bodega) => bodega.id}
            emptyMessage="No hay bodegas registradas."
          />
        </CardContent>
      </Card>
    </main>
  );
}
