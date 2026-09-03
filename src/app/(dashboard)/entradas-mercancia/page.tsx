import Link from "next/link";
import { listEntradas, type EntradaWithDetalle } from "@/app/actions/entrada-mercancia-actions";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

const formatoFecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" });

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function sumarUnidades(entrada: EntradaWithDetalle): number {
  return entrada.items.reduce((suma, item) => suma + item.cantidad, 0);
}

function calcularCostoTotal(entrada: EntradaWithDetalle): number {
  return entrada.items.reduce((suma, item) => suma + item.cantidad * Number(item.precioCompraUnitario), 0);
}

const COLUMNS: DataTableColumn<EntradaWithDetalle>[] = [
  {
    header: "Entrada",
    cell: (entrada) => <span className="font-mono text-sm font-medium">#{entrada.id.slice(-8).toUpperCase()}</span>,
  },
  {
    header: "Fecha",
    cell: (entrada) => <span className="text-sm text-muted-foreground">{formatoFecha.format(entrada.createdAt)}</span>,
  },
  {
    header: "Proveedor",
    cell: (entrada) => entrada.proveedor.nombre,
  },
  {
    header: "Bodega",
    cell: (entrada) => <span className="text-muted-foreground">{entrada.bodega.nombre}</span>,
  },
  {
    header: "Ítems",
    cell: (entrada) => <span className="font-mono">{entrada.items.length}</span>,
  },
  {
    header: "Unidades",
    cell: (entrada) => <span className="font-mono">{sumarUnidades(entrada)}</span>,
  },
  {
    header: "Costo total",
    cell: (entrada) => <span className="font-mono font-medium">{formatoMoneda.format(calcularCostoTotal(entrada))}</span>,
  },
];

export default async function EntradasMercanciaPage() {
  const entradas = await listEntradas();

  const unidadesTotales = entradas.reduce((suma, entrada) => suma + sumarUnidades(entrada), 0);
  const costoTotal = entradas.reduce((suma, entrada) => suma + calcularCostoTotal(entrada), 0);

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Entradas de mercancía</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Entradas registradas</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-mono text-2xl font-semibold">{entradas.length}</span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Unidades recibidas</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-mono text-2xl font-semibold">{unidadesTotales}</span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Costo total</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-mono text-2xl font-semibold">{formatoMoneda.format(costoTotal)}</span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>Listado</CardTitle>
          <Link href="/entradas-mercancia/nuevo" className={buttonVariants({})}>
            Nueva entrada
          </Link>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={COLUMNS}
            rows={entradas}
            getRowKey={(entrada) => entrada.id}
            rowHref={(entrada) => `/entradas-mercancia/${entrada.id}`}
            emptyMessage="No hay entradas de mercancía registradas."
          />
        </CardContent>
      </Card>
    </main>
  );
}
