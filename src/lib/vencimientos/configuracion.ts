import type { getTenantDb } from "@/lib/db/tenant-client";
import { DIAS_AVISO_POR_DEFECTO } from "./estado-vencimiento";

export const CONFIGURACION_TALLER_ID = "singleton";
export const DIAS_AVISO_MIN = 1;
export const DIAS_AVISO_MAX = 90;

type LectorConfiguracion = Pick<ReturnType<typeof getTenantDb>, "configuracionTaller">;

/** Sin fila (taller que nunca guardó la configuración) se usa el valor por defecto. */
export async function leerDiasAviso(tenantDb: LectorConfiguracion): Promise<number> {
  const fila = await tenantDb.configuracionTaller.findUnique({
    where: { id: CONFIGURACION_TALLER_ID },
    select: { diasAvisoVencimiento: true },
  });
  return fila?.diasAvisoVencimiento ?? DIAS_AVISO_POR_DEFECTO;
}
