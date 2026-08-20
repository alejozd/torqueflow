import Link from "next/link";
import { listOrdenes } from "@/app/actions/orden-actions";
import type { EstadoOrden } from "@/generated/prisma-tenant";

const ESTADOS_VALIDOS: EstadoOrden[] = ["BORRADOR", "EN_PROCESO", "TERMINADA", "ENTREGADA", "ANULADA"];

const ESTADO_LABELS: Record<EstadoOrden, string> = {
  BORRADOR: "Borrador",
  EN_PROCESO: "En proceso",
  TERMINADA: "Terminada",
  ENTREGADA: "Entregada",
  ANULADA: "Anulada",
};

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

      <nav aria-label="Filtrar por estado">
        <Link href="/ordenes">Todas</Link>
        {ESTADOS_VALIDOS.map((value) => (
          <Link key={value} href={`/ordenes?estado=${value}`}>
            {ESTADO_LABELS[value]}
          </Link>
        ))}
      </nav>

      <ul>
        {ordenes.map((orden) => (
          <li key={orden.id}>
            <Link href={`/ordenes/${orden.id}`}>
              {orden.vehiculo.placa} — {orden.cliente.nombre} — {ESTADO_LABELS[orden.estado]}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
