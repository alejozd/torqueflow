import Link from "next/link";
import { listFacturas } from "@/app/actions/factura-actions";
import type { EstadoFactura } from "@/generated/prisma-tenant";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const ESTADOS_VALIDOS: EstadoFactura[] = ["PENDIENTE", "PAGADA"];

const ESTADO_LABELS: Record<EstadoFactura, string> = {
  PENDIENTE: "Pendiente",
  PAGADA: "Pagada",
};

type FacturaRow = Awaited<ReturnType<typeof listFacturas>>[number];

const COLUMNS: DataTableColumn<FacturaRow>[] = [
  {
    header: "Factura",
    cell: (factura) => (
      <Link href={`/facturas/${factura.id}`}>
        Factura #{factura.numero} — {factura.cliente.nombre} — {factura.orden.vehiculo.placa} —{" "}
        {ESTADO_LABELS[factura.estado]} — Total: {factura.total.toString()} — Saldo:{" "}
        {factura.saldoPendiente.toString()}
      </Link>
    ),
  },
];

export default async function FacturasPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { estado } = await searchParams;
  const estadoFiltro = ESTADOS_VALIDOS.includes(estado as EstadoFactura) ? (estado as EstadoFactura) : undefined;
  const facturas = await listFacturas(estadoFiltro);

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Facturas</h1>

      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <nav aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
            <Link
              href="/facturas"
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
                href={`/facturas?estado=${value}`}
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
            rows={facturas}
            getRowKey={(factura) => factura.id}
            emptyMessage="No hay facturas en este estado."
          />
        </CardContent>
      </Card>
    </main>
  );
}
