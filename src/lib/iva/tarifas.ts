import { z } from "zod";

/** Tarifa tal como la usan las pantallas (porcentaje como número, no Decimal). */
export interface TarifaIvaVista {
  id: string;
  porcentaje: number;
  nombre: string;
  activa: boolean;
  predeterminada: boolean;
}

/** Porcentaje que se usa cuando un taller aún no tiene predeterminada (no debería pasar). */
export const IVA_PREDETERMINADO_RESPALDO = 19;

const formatoPorcentaje = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

/** 19 → "19 %", 0 → "0 %", 2.5 → "2,5 %". */
export function textoPorcentaje(porcentaje: number): string {
  return `${formatoPorcentaje.format(porcentaje)} %`;
}

/** Lo que se lee en un selector o un desglose: "19 % · General", "0 % · Exento". */
export function etiquetaTarifa(tarifa: Pick<TarifaIvaVista, "porcentaje" | "nombre">): string {
  return `${textoPorcentaje(tarifa.porcentaje)} · ${tarifa.nombre}`;
}

/** Acepta "19", "19,5" o "19.5"; hasta 2 decimales, de 0 a 100. */
const porcentajeSchema = z
  .string()
  .trim()
  .min(1, "Escribe el porcentaje")
  .transform((valor) => valor.replace(",", "."))
  .refine((valor) => /^\d{1,3}(\.\d{1,2})?$/.test(valor), "Porcentaje inválido (máximo 2 decimales)")
  .transform(Number)
  .refine((valor) => valor >= 0 && valor <= 100, "El porcentaje va de 0 a 100");

const nombreSchema = z.string().trim().min(1, "Escribe un nombre").max(40, "Nombre demasiado largo");

export const crearTarifaIvaSchema = z.object({ porcentaje: porcentajeSchema, nombre: nombreSchema });
export const renombrarTarifaIvaSchema = z.object({ nombre: nombreSchema });

/**
 * La predeterminada es la que reciben las líneas nuevas: tiene que existir y
 * estar activa, así que no se puede desactivar mientras lo sea.
 */
export function motivoNoDesactivar(tarifa: Pick<TarifaIvaVista, "predeterminada">): string | null {
  return tarifa.predeterminada
    ? "Es la tarifa predeterminada: marca otra como predeterminada antes de desactivarla."
    : null;
}

export function motivoNoPredeterminar(tarifa: Pick<TarifaIvaVista, "activa">): string | null {
  return tarifa.activa ? null : "Activa la tarifa antes de marcarla como predeterminada.";
}
