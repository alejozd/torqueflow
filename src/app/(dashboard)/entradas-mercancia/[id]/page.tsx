import Link from "next/link";
import { notFound } from "next/navigation";
import { Coins, DollarSign, Package, Truck } from "lucide-react";
import { getEntrada, listEntradas } from "@/app/actions/entrada-mercancia-actions";
import { listRepuestoOptions } from "@/app/actions/repuesto-actions";
import { AgregarEntradaItemForm } from "./agregar-entrada-item-form";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KPI_TONE, KpiCard } from "@/components/ui/kpi-card";
import { formatoFechaCorta, inicioMesBogota } from "@/lib/fecha-bogota";
import { cn } from "@/lib/utils";

type Entrada = NonNullable<Awaited<ReturnType<typeof getEntrada>>>;
type ItemRow = Entrada["items"][number];

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function sumarUnidades(entrada: Entrada): number {
  return entrada.items.reduce((suma, item) => suma + item.cantidad, 0);
}

function calcularCostoTotal(entrada: Entrada): number {
  return entrada.items.reduce((suma, item) => suma + item.cantidad * Number(item.precioCompraUnitario), 0);
}

const ITEMS_COLUMNS: DataTableColumn<ItemRow>[] = [
  {
    header: "Repuesto",
    cell: (item) => (
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold">{item.repuesto.nombre}</span>
        <span className="font-mono text-xs text-muted-foreground">{item.repuesto.codigo}</span>
      </div>
    ),
  },
  {
    header: "Cantidad",
    className: "text-center",
    cell: (item) => <span className="font-mono text-sm">{item.cantidad}</span>,
  },
  {
    header: "Costo unitario",
    className: "text-right",
    cell: (item) => (
      <span className="font-mono text-sm text-muted-foreground">
        {formatoMoneda.format(Number(item.precioCompraUnitario))}
      </span>
    ),
  },
  {
    header: "Subtotal",
    className: "text-right",
    cell: (item) => (
      <span className="font-mono text-sm font-medium">
        {formatoMoneda.format(item.cantidad * Number(item.precioCompraUnitario))}
      </span>
    ),
  },
];

export default async function EntradaMercanciaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entrada = await getEntrada(id);

  if (!entrada) {
    notFound();
  }

  // Fetched alongside the entrada (not just its own items) so the "Costo
  // total" KPI can show what share of this month's compras this one entrada
  // represents -- a real, cheap-to-derive number instead of a static caption.
  const [repuestos, todasLasEntradas] = await Promise.all([
    listRepuestoOptions(entrada.bodegaId),
    listEntradas(),
  ]);

  const costoTotal = calcularCostoTotal(entrada);
  const unidades = sumarUnidades(entrada);
  const costoPorUnidad = unidades > 0 ? costoTotal / unidades : 0;

  const inicioMes = inicioMesBogota(entrada.createdAt);
  const finMes = inicioMesBogota(entrada.createdAt, 1);
  const costoTotalMes = todasLasEntradas
    .filter((e) => e.createdAt >= inicioMes && e.createdAt < finMes)
    .reduce((suma, e) => suma + calcularCostoTotal(e), 0);
  const pctDelMes = costoTotalMes > 0 ? Math.round((costoTotal / costoTotalMes) * 100) : 0;

  return (
    <main className="flex flex-col gap-4">
      <Link
        href="/entradas-mercancia"
        className="flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        ← Entradas de mercancía
      </Link>

      <div>
        <h1 className="text-xl font-semibold tracking-tight">Entrada — #{entrada.id.slice(-8).toUpperCase()}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatoFechaCorta.format(entrada.createdAt)} · {entrada.proveedor.nombre} · {entrada.bodega.nombre} ·
          registró {entrada.creadoPor.nombre}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Referencias"
          value={entrada.items.length}
          subtitle="repuestos distintos"
          icon={<Package className={cn("size-5", KPI_TONE.info.icon)} />}
          iconBgColor={KPI_TONE.info.iconBg}
          className={KPI_TONE.info.cardBg}
        />

        <KpiCard
          title="Unidades"
          value={unidades}
          subtitle="en total"
          icon={<Truck className={cn("size-5", KPI_TONE.info.icon)} />}
          iconBgColor={KPI_TONE.info.iconBg}
          className={KPI_TONE.info.cardBg}
        />

        <KpiCard
          title="Costo total"
          value={formatoMoneda.format(costoTotal)}
          valueColor="success"
          subtitle={costoTotalMes > 0 ? `${pctDelMes}% de las compras del mes` : undefined}
          icon={<DollarSign className={cn("size-5", KPI_TONE.success.icon)} />}
          iconBgColor={KPI_TONE.success.iconBg}
          className={KPI_TONE.success.cardBg}
        />

        <KpiCard
          title="Costo medio unidad"
          value={formatoMoneda.format(costoPorUnidad)}
          subtitle="por unidad recibida"
          icon={<Coins className={cn("size-5", KPI_TONE.neutral.icon)} />}
          iconBgColor={KPI_TONE.neutral.iconBg}
          className={KPI_TONE.neutral.cardBg}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Agregar repuesto a la entrada</CardTitle>
          <CardAction>
            <span className="text-xs text-muted-foreground">Cada ítem suma al stock de {entrada.bodega.nombre}</span>
          </CardAction>
        </CardHeader>
        <CardContent>
          <AgregarEntradaItemForm entradaId={entrada.id} repuestos={repuestos} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Ítems recibidos <span className="font-normal text-muted-foreground">· {entrada.items.length}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <DataTable
            columns={ITEMS_COLUMNS}
            rows={entrada.items}
            getRowKey={(item) => item.id}
            emptyMessage="Esta entrada no tiene ítems registrados."
          />
          {entrada.items.length > 0 ? (
            <div className="flex flex-col items-end gap-1.5 border-t border-border pt-3 text-sm">
              <div className="flex w-full max-w-[240px] items-baseline justify-between gap-3 text-muted-foreground">
                <span>Subtotal neto</span>
                <span className="font-mono">{formatoMoneda.format(costoTotal)}</span>
              </div>
              <div className="h-px w-full max-w-[240px] bg-border" />
              <div className="flex w-full max-w-[240px] items-baseline justify-between gap-3">
                <span className="font-semibold">TOTAL</span>
                <span className="font-mono text-base font-semibold">{formatoMoneda.format(costoTotal)}</span>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
