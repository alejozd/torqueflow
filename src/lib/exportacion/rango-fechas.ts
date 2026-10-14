import { z } from "zod";
import { formatoDiaBogota, inicioMesBogota } from "@/lib/fecha-bogota";

/**
 * Rango de fechas de los reportes exportables (consolidación, D9). Solo ventas y
 * arqueos lo llevan: cartera y cuentas por pagar son fotos del momento. Las
 * fechas son días calendario de Bogotá (UTC-5 fijo, sin horario de verano) y
 * el rango incluye el día `hasta` completo.
 */

export const REPORTES_CON_RANGO = ["ventas", "arqueos"] as const;

export const MAX_DIAS_RANGO = 366;

const DIA_MS = 24 * 60 * 60 * 1000;

export interface RangoExportacion {
  /** AAAA-MM-DD, tal como lo pidió el usuario (para el nombre del archivo). */
  desde: string;
  hasta: string;
  /** Límites para la consulta: `gte` inclusivo, `lt` exclusivo. */
  gte: Date;
  lt: Date;
}

export function tieneRango(reporte: string): boolean {
  return (REPORTES_CON_RANGO as readonly string[]).includes(reporte);
}

/** El mes en curso en Bogotá: del día 1 hasta hoy. */
export function rangoPorDefecto(ahora: Date): { desde: string; hasta: string } {
  return { desde: formatoDiaBogota.format(inicioMesBogota(ahora)), hasta: formatoDiaBogota.format(ahora) };
}

function inicioDelDia(dia: string): Date {
  return new Date(`${dia}T00:00:00-05:00`);
}

// `z.iso.date()` ya rechaza días que no existen (2026-02-30).
const diaSchema = z.iso.date({ error: "Las fechas van en formato AAAA-MM-DD" });

const rangoSchema = z
  .object({ desde: diaSchema.optional(), hasta: diaSchema.optional() })
  .refine((valor) => (valor.desde === undefined) === (valor.hasta === undefined), {
    error: "Indica ambas fechas (desde y hasta) o ninguna",
  })
  .refine((valor) => !valor.desde || !valor.hasta || valor.desde <= valor.hasta, {
    error: "La fecha 'desde' no puede ser posterior a 'hasta'",
  })
  .refine(
    (valor) =>
      !valor.desde ||
      !valor.hasta ||
      (inicioDelDia(valor.hasta).getTime() - inicioDelDia(valor.desde).getTime()) / DIA_MS + 1 <= MAX_DIAS_RANGO,
    { error: `El rango no puede pasar de ${MAX_DIAS_RANGO} días` },
  );

/**
 * Valida `desde`/`hasta` (los dos o ninguno) y devuelve los límites de la
 * consulta. Sin fechas, el mes en curso.
 */
export function resolverRangoExportacion(
  params: { desde?: string | null; hasta?: string | null },
  ahora: Date,
): { rango: RangoExportacion } | { error: string } {
  const parseado = rangoSchema.safeParse({ desde: params.desde ?? undefined, hasta: params.hasta ?? undefined });
  if (!parseado.success) return { error: parseado.error.issues[0]?.message ?? "Rango de fechas inválido" };

  const { desde, hasta } =
    parseado.data.desde && parseado.data.hasta
      ? { desde: parseado.data.desde, hasta: parseado.data.hasta }
      : rangoPorDefecto(ahora);
  return {
    rango: { desde, hasta, gte: inicioDelDia(desde), lt: new Date(inicioDelDia(hasta).getTime() + DIA_MS) },
  };
}
