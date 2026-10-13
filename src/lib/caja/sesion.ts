import type { getTenantDb } from "@/lib/db/tenant-client";

type LectorCaja = Pick<ReturnType<typeof getTenantDb>, "cajaSesion">;

export interface SesionCajaAbierta {
  id: string;
  abiertaAt: Date;
}

/**
 * La caja abierta de una sede (a lo sumo hay una: lo garantiza un índice parcial
 * `WHERE cerrada_at IS NULL` en la tabla).
 *
 * Todo movimiento de dinero exige que exista: el arqueo calcula su ventana por
 * **sede + `createdAt`**, así que un cobro sin sesión abierta quedaría registrado
 * pero **fuera de todo arqueo** (Fase 24, D2: se cierra el hueco heredado).
 */
export async function sesionDeCajaAbierta(tenantDb: LectorCaja, sedeId: string): Promise<SesionCajaAbierta | null> {
  const sesion = await tenantDb.cajaSesion.findFirst({
    where: { sedeId, cerradaAt: null },
    select: { id: true, abiertaAt: true },
  });
  return sesion ?? null;
}
