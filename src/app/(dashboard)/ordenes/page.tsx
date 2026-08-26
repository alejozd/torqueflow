import Link from "next/link";
import { listOrdenes } from "@/app/actions/orden-actions";
import type { EstadoOrden } from "@/generated/prisma-tenant";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { cn } from "@/lib/utils";

const ESTADOS_VALIDOS: EstadoOrden[] = ["BORRADOR", "EN_PROCESO", "TERMINADA", "ENTREGADA", "ANULADA"];

const ESTADO_LABELS: Record<EstadoOrden, string> = {
  BORRADOR: "Borrador",
  EN_PROCESO: "En proceso",
  TERMINADA: "Terminada",
  ENTREGADA: "Entregada",
  ANULADA: "Anulada",
};

type OrdenRow = Awaited<ReturnType<typeof listOrdenes>>[number];

const COLUMNS: DataTableColumn<OrdenRow>[] = [
  {
    header: "Orden",
    cell: (orden) => (
      <Link href={`/ordenes/${orden.id}`}>
        {orden.vehiculo.placa} — {orden.cliente.nombre} — {ESTADO_LABELS[orden.estado]}
      </Link>
    ),
  },
];

export default async function OrdenesPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { estado } = await searchParams;
  const estadoFiltro = ESTADOS_VALIDOS.includes(estado as EstadoOrden) ? (estado as EstadoOrden) : undefined;
  const ordenes = await listOrdenes(estadoFiltro);

  return (
    <main>
      <h1>Órdenes de trabajo</h1>

      <nav aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
        <Link
          href="/ordenes"
          className={cn(
            "rounded-full border px-3 py-1 text-sm transition-colors",
            estadoFiltro === undefined
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input bg-transparent hover:bg-accent hover:text-accent-foreground"
          )}
        >
          Todas
        </Link>
        {ESTADOS_VALIDOS.map((value) => (
          <Link
            key={value}
            href={`/ordenes?estado=${value}`}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              estadoFiltro === value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-transparent hover:bg-accent hover:text-accent-foreground"
            )}
          >
            {ESTADO_LABELS[value]}
          </Link>
        ))}
      </nav>

      <DataTable
        columns={COLUMNS}
        rows={ordenes}
        getRowKey={(orden) => orden.id}
        emptyMessage="No hay órdenes de trabajo en este estado."
      />
    </main>
  );
}
