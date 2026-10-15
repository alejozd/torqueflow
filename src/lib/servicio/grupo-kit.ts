import { randomUUID } from "node:crypto";

export interface GrupoKit {
  grupoKitId: string | null;
  grupoKitNombre: string | null;
  servicioId: string;
}

/**
 * Campos que marcan las líneas que salen de aplicar un servicio. Solo un kit
 * (servicio con repuestos) forma grupo: cada aplicación recibe un id nuevo, así
 * que el mismo kit aplicado dos veces da dos grupos, y el nombre se copia para
 * que renombrar o borrar el servicio no altere lo ya cotizado. Un servicio sin
 * repuestos es una sola línea de mano de obra: guarda el servicio, sin grupo.
 */
export function grupoKitParaServicio(servicio: { id: string; nombre: string; repuestos: unknown[] }): GrupoKit {
  if (servicio.repuestos.length === 0) {
    return { grupoKitId: null, grupoKitNombre: null, servicioId: servicio.id };
  }
  return { grupoKitId: randomUUID(), grupoKitNombre: servicio.nombre, servicioId: servicio.id };
}
