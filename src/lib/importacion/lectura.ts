/**
 * De la matriz de celdas que devuelve el lector a filas numeradas y con sus
 * columnas resueltas. Aquí no se valida nada de negocio: eso es `validacion.ts`.
 */

import { MAX_FILAS_POR_HOJA, resolverColumnas, type HojaContrato } from "./hojas";
import { esVacio } from "./normalizar";
import type { FilaReporte } from "./resultado";

export interface FilaCruda {
  /** Número de fila del archivo, contando el encabezado. */
  numeroFila: number;
  valores: unknown[];
}

export type LecturaHoja =
  | { ok: true; encabezados: unknown[]; indices: Map<string, number>; filas: FilaCruda[]; rechazos: FilaReporte[] }
  | { ok: false; motivo: string };

/** Valor de una columna del contrato; `undefined` cuando la celda está hueca. */
export function valorDeColumna(
  indices: Map<string, number>,
  fila: FilaCruda,
  clave: string,
): unknown {
  const indice = indices.get(clave);
  if (indice === undefined) return undefined;
  const celda = fila.valores[indice];
  return esVacio(celda) ? undefined : celda;
}

/**
 * Busca la fila de encabezado: la primera que trae todas las columnas
 * obligatorias del contrato. Un archivo real suele llevar un título arriba
 * ("Clientes 2026"), así que no vale con tomar la primera fila con contenido.
 * Si ninguna la trae, se usa la primera con contenido para poder decir qué falta.
 */
function posicionDelEncabezado(contrato: HojaContrato, filas: unknown[][]): number {
  const primeraConContenido = filas.findIndex((fila) => fila.some((celda) => !esVacio(celda)));
  if (primeraConContenido < 0) return -1;

  const LIMITE_BUSQUEDA = 10;
  for (let indice = primeraConContenido; indice < Math.min(filas.length, primeraConContenido + LIMITE_BUSQUEDA); indice += 1) {
    const fila = filas[indice] ?? [];
    if (resolverColumnas(contrato, fila).faltantes.length === 0) return indice;
  }
  return primeraConContenido;
}

/**
 * Lee una hoja: busca el encabezado, resuelve las columnas del contrato, numera
 * las filas con contenido y aplica el tope de filas. Si falta una columna
 * obligatoria, la hoja entera se descarta con un motivo claro (no tiene sentido
 * importar a medias).
 */
export function leerHoja(contrato: HojaContrato, filas: unknown[][]): LecturaHoja {
  const posicionEncabezado = posicionDelEncabezado(contrato, filas);
  if (posicionEncabezado < 0) return { ok: false, motivo: "La hoja no tiene datos" };

  const encabezados = filas[posicionEncabezado] ?? [];
  const { indices, faltantes } = resolverColumnas(contrato, encabezados);
  if (faltantes.length > 0) {
    const nombres = faltantes.map(
      (clave) => contrato.columnas.find((columna) => columna.clave === clave)?.encabezado ?? clave,
    );
    return { ok: false, motivo: `Faltan columnas obligatorias: ${nombres.join(", ")}` };
  }

  const conContenido = filas
    .slice(posicionEncabezado + 1)
    .map((valores, indice) => ({ numeroFila: posicionEncabezado + indice + 2, valores }))
    .filter((fila) => fila.valores.some((celda) => !esVacio(celda)));

  const filasDentro = conContenido.slice(0, MAX_FILAS_POR_HOJA);
  const rechazos: FilaReporte[] = conContenido.slice(MAX_FILAS_POR_HOJA).map((fila) => ({
    hoja: contrato.nombre,
    fila: fila.numeroFila,
    columna: null,
    valor: null,
    tipo: "rechazada",
    motivo: `La hoja trae más de ${MAX_FILAS_POR_HOJA} filas: esta no se importó`,
  }));

  return { ok: true, encabezados, indices, filas: filasDentro, rechazos };
}
