import Link from "next/link";
import { DollarSign, Package, Truck, Users } from "lucide-react";
import { listEntradas, type EntradaWithDetalle } from "@/app/actions/entrada-mercancia-actions";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { KPI_TONE, KpiCard } from "@/components/ui/kpi-card";
import { formatoFechaCorta, formatoFechaRelativa, inicioMesBogota } from "@/lib/fecha-bogota";
import { cn } from "@/lib/utils";

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

function buildColumns(ahora: Date): DataTableColumn<EntradaWithDetalle>[] {
  return [
  {
    header: "Entrada",
    cell: (entrada) => <span className="font-mono text-sm font-medium">#{entrada.id.slice(-8).toUpperCase()}</span>,
  },
  {
    header: "Fecha",
    cell: (entrada) => (
      <div className="flex flex-col gap-0.5">
        <span className="text-sm">{formatoFechaCorta.format(entrada.createdAt)}</span>
        <span className="text-xs text-muted-foreground">{formatoFechaRelativa(entrada.createdAt, ahora)}</span>
      </div>
    ),
  },
  {
    header: "Proveedor",
    cell: (entrada) => entrada.proveedor.nombre,
    searchValue: (entrada) => entrada.proveedor.nombre,
  },
  {
    header: "Bodega",
    cell: (entrada) => <span className="text-muted-foreground">{entrada.bodega.nombre}</span>,
    searchValue: (entrada) => entrada.bodega.nombre,
  },
  {
    header: "Ítems",
    className: "text-right",
    cell: (entrada) => <span className="font-mono">{entrada.items.length}</span>,
  },
  {
    header: "Unidades",
    className: "text-right",
    cell: (entrada) => <span className="font-mono">{sumarUnidades(entrada)}</span>,
  },
  {
    header: "Costo total",
    className: "text-right",
    cell: (entrada) => <span className="font-mono font-medium">{formatoMoneda.format(calcularCostoTotal(entrada))}</span>,
  },
  ];
}

export default async function EntradasMercanciaPage() {
  const entradas = await listEntradas();

  const ahora = new Date();
  const inicioMes = inicioMesBogota(ahora);
  const entradasMes = entradas.filter((entrada) => entrada.createdAt >= inicioMes).length;

  const unidadesTotales = entradas.reduce((suma, entrada) => suma + sumarUnidades(entrada), 0);
  const costoTotal = entradas.reduce((suma, entrada) => suma + calcularCostoTotal(entrada), 0);
  const proveedoresCount = new Set(entradas.map((entrada) => entrada.proveedor.id)).size;

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2.5">
        <h1 className="text-2xl font-semibold">Entradas de mercancía</h1>
        <Badge variant="outline" className="font-normal text-muted-foreground">
          {entradasMes} {entradasMes === 1 ? "entrada" : "entradas"} este mes
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Entradas registradas"
          value={entradas.length}
          icon={<Package className={cn("size-5", KPI_TONE.info.icon)} />}
          iconBgColor={KPI_TONE.info.iconBg}
          className={KPI_TONE.info.cardBg}
        />

        <KpiCard
          title="Unidades recibidas"
          value={unidadesTotales}
          icon={<Truck className={cn("size-5", KPI_TONE.info.icon)} />}
          iconBgColor={KPI_TONE.info.iconBg}
          className={KPI_TONE.info.cardBg}
        />

        <KpiCard
          title="Costo total"
          value={formatoMoneda.format(costoTotal)}
          valueColor="success"
          icon={<DollarSign className={cn("size-5", KPI_TONE.success.icon)} />}
          iconBgColor={KPI_TONE.success.iconBg}
          className={KPI_TONE.success.cardBg}
        />

        <KpiCard
          title="Proveedores"
          value={proveedoresCount}
          icon={<Users className={cn("size-5", KPI_TONE.neutral.icon)} />}
          iconBgColor={KPI_TONE.neutral.iconBg}
          className={KPI_TONE.neutral.cardBg}
        />
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
            columns={buildColumns(ahora)}
            rows={entradas}
            getRowKey={(entrada) => entrada.id}
            rowHref={(entrada) => `/entradas-mercancia/${entrada.id}`}
            emptyMessage="No hay entradas de mercancía registradas."
            searchable
            searchPlaceholder="Buscar por proveedor o bodega..."
            pageSize={20}
            headerClassName="bg-muted"
          />
        </CardContent>
      </Card>
    </main>
  );
}
