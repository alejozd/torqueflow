import type { EstadoOrden } from "@/generated/prisma-tenant";

const FACTURABLE_ESTADOS: EstadoOrden[] = ["TERMINADA", "ENTREGADA"];

export function assertOrdenFacturable(orden: { estado: EstadoOrden }): void {
  if (!FACTURABLE_ESTADOS.includes(orden.estado)) {
    throw new Error(
      `No se puede facturar una orden en estado ${orden.estado}. Debe estar Terminada o Entregada.`,
    );
  }
}
