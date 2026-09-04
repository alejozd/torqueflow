import Link from "next/link";
import { notFound } from "next/navigation";
import { getEntrada, listEntradas } from "@/app/actions/entrada-mercancia-actions";
import { listRepuestoOptions } from "@/app/actions/repuesto-actions";
import { AgregarEntradaItemForm } from "./agregar-entrada-item-form";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatoFechaCorta, inicioMesBogota } from "@/lib/fecha-bogota";

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
        <span className="text-sm">{item.repuesto.nombre}</span>
        <span className="font-mono text-xs text-muted-foreground">{item.repuesto.codigo}</span>
      </div>
    ),
  },
  {
    header: "Cant.",
    className: "text-right",
    cell: (item) => <span className="font-mono text-sm">{item.cantidad}</span>,
  },
  {
    header: "Unitario",
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

function KpiColumn({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <div className="min-w-[150px] flex-1 border-r border-border p-3 last:border-r-0">
      <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 font-mono text-xl font-semibold tracking-tight">{value}</p>
      {caption ? <p className="mt-0.5 text-[10.5px] text-muted-foreground">{caption}</p> : null}
    </div>
  );
}

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

      <div className="flex flex-wrap overflow-hidden rounded-xl border border-border bg-card">
        <KpiColumn label="Referencias" value={String(entrada.items.length)} caption="repuestos distintos" />
        <KpiColumn label="Unidades" value={String(unidades)} caption="en total" />
        <KpiColumn
          label="Costo total"
          value={formatoMoneda.format(costoTotal)}
          caption={costoTotalMes > 0 ? `${pctDelMes}% de las compras del mes` : undefined}
        />
        <KpiColumn label="Costo medio unidad" value={formatoMoneda.format(costoPorUnidad)} caption="por unidad recibida" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Agregar repuesto</CardTitle>
        </CardHeader>
        <CardContent>
          <AgregarEntradaItemForm entradaId={entrada.id} repuestos={repuestos} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ítems recibidos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <DataTable
            columns={ITEMS_COLUMNS}
            rows={entrada.items}
            getRowKey={(item) => item.id}
            emptyMessage="Esta entrada no tiene ítems registrados."
          />
          {entrada.items.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
              <span>
                {entrada.items.length} {entrada.items.length === 1 ? "referencia" : "referencias"} · {unidades}{" "}
                {unidades === 1 ? "unidad" : "unidades"}
              </span>
              <span className="font-mono font-medium text-foreground">{formatoMoneda.format(costoTotal)}</span>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Cada ítem genera un movimiento de inventario en {entrada.bodega.nombre}.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
