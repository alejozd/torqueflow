import type { getTenantDb } from "@/lib/db/tenant-client";
// El id del singleton vive con la configuración que lo estrenó (vencimientos); es
// el mismo registro de `ConfiguracionTaller`, así que se reutiliza en vez de
// duplicar el literal.
import { CONFIGURACION_TALLER_ID } from "@/lib/vencimientos/configuracion";

export const DIAS_ESTANCADA_POR_DEFECTO = 3;

type LectorConfiguracion = Pick<ReturnType<typeof getTenantDb>, "configuracionTaller">;

/** Sin fila (taller que nunca guardó la configuración) se usa el valor por defecto. */
export async function leerDiasEstancada(tenantDb: LectorConfiguracion): Promise<number> {
  const fila = await tenantDb.configuracionTaller.findUnique({
    where: { id: CONFIGURACION_TALLER_ID },
    select: { diasOrdenEstancada: true },
  });
  return fila?.diasOrdenEstancada ?? DIAS_ESTANCADA_POR_DEFECTO;
}
