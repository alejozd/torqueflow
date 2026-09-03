import Link from "next/link";
import { listRepuestos, type RepuestoWithDetalle } from "@/app/actions/repuesto-actions";
import { listBodegas } from "@/app/actions/bodega-actions";
import { listProveedores } from "@/app/actions/proveedor-actions";
import { EditarRepuestoDialog } from "./editar-repuesto-dialog";
import type { RepuestoEditable } from "./editar-repuesto-form";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Bodega, Proveedor } from "@/generated/prisma-tenant";

const FILTROS_VALIDOS = ["stock-bajo", "sin-existencias"] as const;
type Filtro = (typeof FILTROS_VALIDOS)[number];

const FILTRO_LABELS: Record<Filtro, string> = {
  "stock-bajo": "Stock bajo",
  "sin-existencias": "Sin existencias",
};

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const formatoPorcentaje = new Intl.NumberFormat("es-CO", { style: "percent", maximumFractionDigits: 0 });

function esStockBajo(repuesto: RepuestoWithDetalle): boolean {
  return repuesto.stockActual <= repuesto.stockMinimo;
}

function calcularMargen(repuesto: RepuestoWithDetalle): number | null {
  const precioVenta = Number(repuesto.precioVenta);
  if (precioVenta === 0) return null;
  return (precioVenta - Number(repuesto.precioCompra)) / precioVenta;
}

function toEditable(repuesto: RepuestoWithDetalle): RepuestoEditable {
  return {
    id: repuesto.id,
    codigo: repuesto.codigo,
    nombre: repuesto.nombre,
    descripcion: repuesto.descripcion,
    precioCompra: Number(repuesto.precioCompra),
    precioVenta: Number(repuesto.precioVenta),
    stockMinimo: repuesto.stockMinimo,
    bodegaId: repuesto.bodegaId,
    proveedorId: repuesto.proveedorId,
  };
}

function buildColumns(bodegas: Bodega[], proveedores: Proveedor[]): DataTableColumn<RepuestoWithDetalle>[] {
  return [
    {
      header: "Código",
      cell: (repuesto) => <span className="font-mono text-sm">{repuesto.codigo}</span>,
    },
    {
      header: "Repuesto",
      cell: (repuesto) => <span className="font-medium">{repuesto.nombre}</span>,
    },
    {
      header: "Bodega",
      cell: (repuesto) => <span className="text-muted-foreground">{repuesto.bodega.nombre}</span>,
    },
    {
      header: "Stock",
      className: "text-right",
      cell: (repuesto) => <span className="font-mono">{repuesto.stockActual}</span>,
    },
    {
      header: "Mínimo",
      className: "text-right",
      cell: (repuesto) => (
        <span className={cn("font-mono", esStockBajo(repuesto) && "font-medium text-[oklch(0.5_0.2_27)]")}>
          {repuesto.stockMinimo}
        </span>
      ),
    },
    {
      header: "P. compra",
      className: "text-right",
      cell: (repuesto) => <span className="font-mono">{formatoMoneda.format(Number(repuesto.precioCompra))}</span>,
    },
    {
      header: "P. venta",
      className: "text-right",
      cell: (repuesto) => <span className="font-mono">{formatoMoneda.format(Number(repuesto.precioVenta))}</span>,
    },
    {
      header: "Margen",
      className: "text-right",
      cell: (repuesto) => {
        const margen = calcularMargen(repuesto);
        return margen !== null ? (
          <span className="font-mono text-sm">{formatoPorcentaje.format(margen)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    {
      header: "Acciones",
      cell: (repuesto) => (
        <EditarRepuestoDialog repuesto={toEditable(repuesto)} bodegas={bodegas} proveedores={proveedores} />
      ),
    },
  ];
}

export default async function RepuestosPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const { filtro } = await searchParams;
  const filtroActivo = FILTROS_VALIDOS.includes(filtro as Filtro) ? (filtro as Filtro) : undefined;

  // Fetched once, unfiltered: the KPI cards summarize every repuesto of la
  // sede regardless of which filtro the list below is currently applying.
  const [repuestos, bodegas, proveedores] = await Promise.all([listRepuestos(), listBodegas(), listProveedores()]);
  const filtrados =
    filtroActivo === "stock-bajo"
      ? repuestos.filter(esStockBajo)
      : filtroActivo === "sin-existencias"
        ? repuestos.filter((repuesto) => repuesto.stockActual === 0)
        : repuestos;

  const valorInventario = repuestos.reduce(
    (suma, repuesto) => suma + repuesto.stockActual * Number(repuesto.precioCompra),
    0,
  );
  const stockBajo = repuestos.filter(esStockBajo);
  const sinExistencias = repuestos.filter((repuesto) => repuesto.stockActual === 0).length;
  const columns = buildColumns(bodegas, proveedores);

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Repuestos</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Referencias</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-mono text-2xl font-semibold">{repuestos.length}</span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Valor inventario</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-mono text-2xl font-semibold">{formatoMoneda.format(valorInventario)}</span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Stock bajo</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <span className="font-mono text-2xl font-semibold text-[oklch(0.55_0.15_60)]">{stockBajo.length}</span>
            {sinExistencias > 0 ? (
              <span className="text-xs text-muted-foreground">{sinExistencias} sin existencias</span>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>Listado</CardTitle>
          <Link href="/repuestos/nuevo" className={buttonVariants({})}>
            Nuevo repuesto
          </Link>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <nav aria-label="Filtrar por stock" className="flex flex-wrap gap-2">
            <Link
              href="/repuestos"
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                filtroActivo === undefined
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-transparent hover:bg-accent hover:text-accent-foreground"
              )}
            >
              Todas
            </Link>
            {FILTROS_VALIDOS.map((value) => (
              <Link
                key={value}
                href={`/repuestos?filtro=${value}`}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors",
                  filtroActivo === value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-transparent hover:bg-accent hover:text-accent-foreground"
                )}
              >
                {FILTRO_LABELS[value]}
              </Link>
            ))}
          </nav>

          <DataTable
            columns={columns}
            rows={filtrados}
            getRowKey={(repuesto) => repuesto.id}
            emptyMessage="No hay repuestos en este filtro."
          />
        </CardContent>
      </Card>
    </main>
  );
}
