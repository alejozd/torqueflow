import Link from "next/link";
import { AlertCircle, DollarSign, Package, Warehouse } from "lucide-react";
import { requireSession } from "@/lib/auth/guards";
import { listBodegasConInventario, type BodegaConInventario } from "@/app/actions/bodega-actions";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { KPI_TONE, KpiCard } from "@/components/ui/kpi-card";
import { cn } from "@/lib/utils";
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
    searchValue: (bodega) => bodega.nombre,
  },
  {
    header: "Sede",
    cell: (bodega) => <span className="text-muted-foreground">{bodega.sedeNombre}</span>,
    searchValue: (bodega) => bodega.sedeNombre,
  },
  {
    header: "Referencias",
    className: "text-right",
    cell: (bodega) => <span className="font-mono">{bodega.repuestos.length}</span>,
  },
  {
    header: "Unidades",
    className: "text-right",
    cell: (bodega) => <span className="font-mono">{sumarUnidades(bodega)}</span>,
  },
  {
    header: "Valor inventario",
    className: "text-right",
    cell: (bodega) => <span className="font-mono font-medium">{formatoMoneda.format(calcularValorInventario(bodega))}</span>,
  },
  {
    header: "Stock bajo",
    className: "text-right",
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

  const referenciasTotales = bodegas.reduce((suma, bodega) => suma + bodega.repuestos.length, 0);
  const valorInventarioTotal = bodegas.reduce((suma, bodega) => suma + calcularValorInventario(bodega), 0);
  const bodegasConStockBajo = bodegas.filter((bodega) => contarStockBajo(bodega) > 0).length;

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold">Bodegas</h1>
            <Badge variant="outline" className="font-normal text-muted-foreground">
              {bodegasConStockBajo} con stock bajo
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {bodegas.length} bodegas registradas en Sede {session.user.sedeActivaNombre}
          </p>
        </div>
        <Link href="/bodegas/nuevo" className={buttonVariants({})}>
          Nueva bodega
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Bodegas"
          value={bodegas.length}
          icon={<Warehouse className={cn("size-5", KPI_TONE.info.icon)} />}
          iconBgColor={KPI_TONE.info.iconBg}
          className={KPI_TONE.info.cardBg}
        />

        <KpiCard
          title="Referencias totales"
          value={referenciasTotales}
          icon={<Package className={cn("size-5", KPI_TONE.info.icon)} />}
          iconBgColor={KPI_TONE.info.iconBg}
          className={KPI_TONE.info.cardBg}
        />

        <KpiCard
          title="Valor inventario"
          value={formatoMoneda.format(valorInventarioTotal)}
          valueColor="success"
          icon={<DollarSign className={cn("size-5", KPI_TONE.success.icon)} />}
          iconBgColor={KPI_TONE.success.iconBg}
          className={KPI_TONE.success.cardBg}
        />

        <KpiCard
          title="Con stock bajo"
          value={bodegasConStockBajo}
          valueColor="warning"
          icon={<AlertCircle className={cn("size-5", KPI_TONE.warning.icon)} />}
          iconBgColor={KPI_TONE.warning.iconBg}
          className={KPI_TONE.warning.cardBg}
        />
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
            searchable
            searchPlaceholder="Buscar por bodega o sede..."
            pageSize={10}
            headerClassName="bg-muted"
          />
        </CardContent>
      </Card>
    </main>
  );
}
