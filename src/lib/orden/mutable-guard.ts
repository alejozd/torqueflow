import type { EstadoOrden } from "@/generated/prisma-tenant";

const IMMUTABLE_ESTADOS: EstadoOrden[] = ["ENTREGADA", "ANULADA"];

export function assertOrdenMutable(orden: { estado: EstadoOrden }): void {
  if (IMMUTABLE_ESTADOS.includes(orden.estado)) {
    throw new Error(`No se puede modificar una orden en estado ${orden.estado}.`);
  }
}
