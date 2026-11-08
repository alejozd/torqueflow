import { IVA_PREDETERMINADO_RESPALDO } from "./tarifas";

/** Lo mínimo que se necesita del cliente de Prisma (o de una transacción). */
export interface LectorTarifas {
  tarifaIva: {
    findMany(args: {
      where: { activa: boolean };
      select: { porcentaje: true; predeterminada: true };
    }): Promise<{ porcentaje: unknown; predeterminada: boolean }[]>;
  };
}

export type ResultadoIva = { ok: true; ivaPct: number } | { ok: false; error: string };

/**
 * Decide el porcentaje que se guarda en un repuesto, servicio o línea:
 * - sin valor → la tarifa predeterminada (19 % si el taller no tuviera ninguna);
 * - igual al que ya tenía → se respeta aunque esa tarifa esté desactivada
 *   (editar otro campo no obliga a cambiar el IVA);
 * - cualquier otro → tiene que ser una tarifa activa.
 */
export async function resolverIvaPct(
  db: LectorTarifas,
  valor: number | undefined,
  actual?: number,
): Promise<ResultadoIva> {
  if (valor !== undefined && actual !== undefined && valor === actual) return { ok: true, ivaPct: valor };
  const activas = await db.tarifaIva.findMany({
    where: { activa: true },
    select: { porcentaje: true, predeterminada: true },
  });
  if (valor === undefined) {
    const predeterminada = activas.find((t) => t.predeterminada);
    return { ok: true, ivaPct: predeterminada ? Number(predeterminada.porcentaje) : IVA_PREDETERMINADO_RESPALDO };
  }
  if (activas.some((t) => Number(t.porcentaje) === valor)) return { ok: true, ivaPct: valor };
  return { ok: false, error: "Esa tarifa de IVA no está activa. Revisa Administración > Tarifas de IVA." };
}

/** "19", "19,5", "" o null del formulario → número o undefined (sin elegir). */
export function leerIvaPct(valor: FormDataEntryValue | null): number | undefined {
  if (valor === null || typeof valor !== "string" || valor.trim() === "") return undefined;
  const numero = Number(valor.replace(",", "."));
  return Number.isFinite(numero) ? numero : undefined;
}
