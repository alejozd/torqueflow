import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getEntrada } from "@/app/actions/entrada-mercancia-actions";
import { listRepuestoOptions } from "@/app/actions/repuesto-actions";
import { AgregarEntradaItemForm } from "./agregar-entrada-item-form";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatoFechaCorta } from "@/lib/fecha-bogota";

type Entrada = NonNullable<Awaited<ReturnType<typeof getEntrada>>>;
type ItemRow = Entrada["items"][number];

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

// Same convention as ordenes/[id]/page.tsx's InfoField -- kept local here too
// rather than extracted to a shared module neither page asked for.
function InfoField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-[10px] tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="mt-0.5 text-sm">{value}</div>
    </div>
  );
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

function sumarUnidades(entrada: Entrada): number {
  return entrada.items.reduce((suma, item) => suma + item.cantidad, 0);
}

function calcularCostoTotal(entrada: Entrada): number {
  return entrada.items.reduce((suma, item) => suma + item.cantidad * Number(item.precioCompraUnitario), 0);
}

export default async function EntradaMercanciaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entrada = await getEntrada(id);

  if (!entrada) {
    notFound();
  }

  const repuestos = await listRepuestoOptions(entrada.bodegaId);
  const costoTotal = calcularCostoTotal(entrada);
  const unidades = sumarUnidades(entrada);

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
          {entrada.proveedor.nombre} · {entrada.bodega.nombre}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Información de la entrada</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <InfoField label="Proveedor" value={entrada.proveedor.nombre} />
            <InfoField label="Bodega" value={entrada.bodega.nombre} />
            <InfoField label="Fecha" value={formatoFechaCorta.format(entrada.createdAt)} />
            <InfoField label="Registrada por" value={entrada.creadoPor.nombre} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Ítems recibidos{" "}
            <span className="font-normal text-muted-foreground">
              · {entrada.items.length} {entrada.items.length === 1 ? "ítem" : "ítems"} · {unidades}{" "}
              {unidades === 1 ? "unidad" : "unidades"}
            </span>
          </CardTitle>
          <CardAction>
            <span className="font-mono text-sm text-muted-foreground">{formatoMoneda.format(costoTotal)}</span>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <AgregarEntradaItemForm entradaId={entrada.id} repuestos={repuestos} />
          <DataTable
            columns={ITEMS_COLUMNS}
            rows={entrada.items}
            getRowKey={(item) => item.id}
            emptyMessage="Esta entrada no tiene ítems registrados."
          />
        </CardContent>
      </Card>
    </main>
  );
}
