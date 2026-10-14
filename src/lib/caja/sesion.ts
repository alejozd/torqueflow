import { leerOpcionesTaller } from "@/lib/configuracion/opciones-taller";
import type { getTenantDb } from "@/lib/db/tenant-client";

type LectorCaja = Pick<ReturnType<typeof getTenantDb>, "cajaSesion">;
type LectorCajaYOpciones = Pick<ReturnType<typeof getTenantDb>, "cajaSesion" | "configuracionTaller">;

export interface SesionCajaAbierta {
  id: string;
  abiertaAt: Date;
}

/**
 * La caja abierta de una sede (a lo sumo hay una: lo garantiza un índice parcial
 * `WHERE cerrada_at IS NULL` en la tabla).
 */
export async function sesionDeCajaAbierta(tenantDb: LectorCaja, sedeId: string): Promise<SesionCajaAbierta | null> {
  const sesion = await tenantDb.cajaSesion.findFirst({
    where: { sedeId, cerradaAt: null },
    select: { id: true, abiertaAt: true },
  });
  return sesion ?? null;
}

/**
 * **Única regla** de cuándo un movimiento de dinero exige caja abierta (fase de
 * consolidación, D3/D4): solo si el taller usa el control de caja **y** el dinero
 * es en efectivo. Tarjeta, transferencia u otro no tocan el cajón y nunca la
 * exigen; sin control de caja, nada la exige.
 *
 * Por qué importa: el arqueo calcula su ventana por **sede + `createdAt`**, así
 * que un efectivo registrado con la caja cerrada no aparecería en ningún arqueo.
 *
 * `efectivo` es el método de pago, o un booleano para los caminos que ya lo
 * saben (un gasto "pagado en efectivo"). Devuelve `mensaje` si falta la caja, o
 * `null` si el movimiento puede seguir.
 *
 * Límite aceptado: el chequeo es una lectura, no un bloqueo. Si la caja se cierra
 * en el mismo instante en que se registra el movimiento, este puede quedar fuera
 * del arqueo; cerrarlo exigiría bloquear la fila de la sesión en cada cobro.
 */
export async function exigirCajaParaEfectivo(
  tenantDb: LectorCajaYOpciones,
  sedeId: string,
  efectivo: string | boolean,
  mensaje: string,
): Promise<string | null> {
  const esEfectivo = typeof efectivo === "boolean" ? efectivo : efectivo === "EFECTIVO";
  if (!esEfectivo) return null;

  const { usarControlCaja } = await leerOpcionesTaller(tenantDb);
  if (!usarControlCaja) return null;

  return (await sesionDeCajaAbierta(tenantDb, sedeId)) ? null : mensaje;
}
