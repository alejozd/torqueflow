import type { FrecuenciaLiquidacion } from "@/generated/prisma-tenant";
import type { getTenantDb } from "@/lib/db/tenant-client";
import { CONFIGURACION_TALLER_ID } from "@/lib/vencimientos/configuracion";

/**
 * Frecuencia de liquidación del taller (D5). Vive en la fila singleton de
 * `ConfiguracionTaller` -- la misma que los días de aviso de vencimiento, de ahí
 * que reutilice su id en vez de declarar otro.
 */
export const FRECUENCIA_POR_DEFECTO: FrecuenciaLiquidacion = "MENSUAL";

type LectorConfiguracion = Pick<ReturnType<typeof getTenantDb>, "configuracionTaller">;

/** Sin fila (taller que nunca guardó la configuración) se usa el valor por defecto. */
export async function leerFrecuenciaLiquidacion(tenantDb: LectorConfiguracion): Promise<FrecuenciaLiquidacion> {
  const fila = await tenantDb.configuracionTaller.findUnique({
    where: { id: CONFIGURACION_TALLER_ID },
    select: { frecuenciaLiquidacion: true },
  });
  return fila?.frecuenciaLiquidacion ?? FRECUENCIA_POR_DEFECTO;
}
