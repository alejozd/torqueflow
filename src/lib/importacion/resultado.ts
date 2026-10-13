/**
 * Forma del reporte que ve el usuario al terminar una importación (D3).
 *
 * Una sola lista de novedades (`filas`) con un discriminador: lo que se rechazó
 * por un error y lo que se omitió porque ya existía. Así el taller ve todo junto,
 * con su número de fila y su motivo, y el resumen por hoja cuenta cada cosa.
 */

import { MAX_RECHAZOS_VISIBLES } from "./hojas";

export type TipoNovedad = "rechazada" | "ya_existia";

export interface FilaReporte {
  hoja: string;
  /** Número de fila del archivo, contando el encabezado (la primera fila de datos es la 2). */
  fila: number;
  columna: string | null;
  valor: string | null;
  motivo: string;
  tipo: TipoNovedad;
}

export type EstadoHoja = "ok" | "omitida" | "error";

export interface ResumenHoja {
  hoja: string;
  /** Filas de datos que traía la hoja (sin contar el encabezado). */
  leidas: number;
  creadas: number;
  /** Omitidas porque ya existían: no se tocaron (D2). */
  existentes: number;
  rechazadas: number;
  estado: EstadoHoja;
  motivo: string | null;
}

export interface ResultadoImportacion {
  /** Error global (archivo ilegible, sin bodega, demasiado grande): no se importó nada. */
  error: string | null;
  resumen: ResumenHoja[];
  filas: FilaReporte[];
  /** Novedades que no se devuelven por tamaño; solo se cuentan (D7). */
  filasOcultas: number;
}

export function resumenVacio(hoja: string): ResumenHoja {
  return { hoja, leidas: 0, creadas: 0, existentes: 0, rechazadas: 0, estado: "ok", motivo: null };
}

/** Recorta la lista de novedades al tope que se envía al navegador (D7). */
export function limitarFilas(filas: FilaReporte[]): { visibles: FilaReporte[]; ocultas: number } {
  if (filas.length <= MAX_RECHAZOS_VISIBLES) return { visibles: filas, ocultas: 0 };
  return { visibles: filas.slice(0, MAX_RECHAZOS_VISIBLES), ocultas: filas.length - MAX_RECHAZOS_VISIBLES };
}

/** Cuenta las novedades de una hoja para su resumen. */
export function contarNovedades(filas: FilaReporte[], hoja: string): { rechazadas: number; existentes: number } {
  const deLaHoja = filas.filter((fila) => fila.hoja === hoja);
  return {
    rechazadas: deLaHoja.filter((fila) => fila.tipo === "rechazada").length,
    existentes: deLaHoja.filter((fila) => fila.tipo === "ya_existia").length,
  };
}

export const resultadoVacio = (error: string | null = null): ResultadoImportacion => ({
  error,
  resumen: [],
  filas: [],
  filasOcultas: 0,
});
