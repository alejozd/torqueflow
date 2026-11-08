"use server";

import { requirePermiso } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { buscarConceptos, type ResultadosBusquedaConceptos } from "@/lib/conceptos/buscar";

export type { ResultadoKitBusqueda, ResultadoRepuestoBusqueda } from "@/lib/conceptos/buscar";
export type ResultadosBusquedaCotizacion = ResultadosBusquedaConceptos;

/** El buscador de la tabla de la cotización (la búsqueda vive en `lib/conceptos/buscar.ts`). */
export async function buscarParaCotizacionAction(texto: string): Promise<ResultadosBusquedaCotizacion> {
  const session = await requirePermiso("cotizaciones.editarItems");
  return buscarConceptos(getTenantDb(session.user.tenantSchema), session.user.sedeActivaId, texto);
}
