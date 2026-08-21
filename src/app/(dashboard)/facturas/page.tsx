import Link from "next/link";
import { listFacturas } from "@/app/actions/factura-actions";
import type { EstadoFactura } from "@/generated/prisma-tenant";

const ESTADOS_VALIDOS: EstadoFactura[] = ["PENDIENTE", "PAGADA"];

const ESTADO_LABELS: Record<EstadoFactura, string> = {
  PENDIENTE: "Pendiente",
  PAGADA: "Pagada",
};

export default async function FacturasPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { estado } = await searchParams;
  const estadoFiltro = ESTADOS_VALIDOS.includes(estado as EstadoFactura) ? (estado as EstadoFactura) : undefined;
  const facturas = await listFacturas(estadoFiltro);

  return (
    <main>
      <h1>Facturas</h1>

      <nav aria-label="Filtrar por estado">
        <Link href="/facturas">Todas</Link>
        {ESTADOS_VALIDOS.map((value) => (
          <Link key={value} href={`/facturas?estado=${value}`}>
            {ESTADO_LABELS[value]}
          </Link>
        ))}
      </nav>

      <ul>
        {facturas.map((factura) => (
          <li key={factura.id}>
            <Link href={`/facturas/${factura.id}`}>
              Factura #{factura.numero} — {factura.cliente.nombre} — {factura.orden.vehiculo.placa} —{" "}
              {ESTADO_LABELS[factura.estado]} — Total: {factura.total.toString()} — Saldo:{" "}
              {factura.saldoPendiente.toString()}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
