/**
 * Único punto del proyecto que habla con las librerías de Excel: todo lo demás
 * trabaja con matrices de celdas. Aislarlas aquí permite cambiar de librería (o
 * de versión) sin tocar la lógica de importación, y deja los tests del resto del
 * módulo sin dependencias de I/O.
 */

import readXlsxFile from "read-excel-file/node";
import writeXlsxFile from "write-excel-file/node";

export interface HojaLeida {
  nombre: string;
  filas: unknown[][];
}

export interface HojaEscrita {
  nombre: string;
  filas: (string | number | boolean | null)[][];
  /** Ancho de cada columna, en el orden de la fila. */
  anchos?: number[];
}

type EntradaLector = Parameters<typeof readXlsxFile>[0];

/** El lector devuelve celdas ricas (`{ value, type }`); aquí solo importa el valor. */
function valorDeCelda(celda: unknown): unknown {
  if (celda !== null && typeof celda === "object" && "value" in celda) {
    return (celda as { value?: unknown }).value ?? null;
  }
  return celda ?? null;
}

/**
 * Lee todas las hojas del archivo. Acepta lo que llega de un `FormData` (un
 * `File`, que es un `Blob`) o un `Buffer`, que es lo que usan los tests.
 *
 * La entrada `/node` de la librería, pese a declarar `Blob` en sus tipos, pasa
 * el dato a `fs` y falla con un `File`: por eso un Blob se convierte aquí en
 * memoria, que además es lo que queremos (el archivo no toca el disco).
 */
export async function leerLibro(archivo: Blob | Buffer): Promise<HojaLeida[]> {
  const datos = Buffer.isBuffer(archivo) ? archivo : Buffer.from(await archivo.arrayBuffer());
  const hojas = await readXlsxFile(datos as unknown as EntradaLector);
  return hojas.map((hoja) => ({
    nombre: hoja.sheet,
    filas: (hoja.data as unknown[][]).map((fila) => fila.map(valorDeCelda)),
  }));
}

/** Escribe un libro y lo devuelve como bytes, listo para descargar o guardar. */
export async function escribirLibro(hojas: HojaEscrita[]): Promise<Buffer> {
  const archivo = await writeXlsxFile(
    hojas.map((hoja) => ({
      sheet: hoja.nombre,
      data: hoja.filas as never,
      ...(hoja.anchos ? { columns: hoja.anchos.map((width) => ({ width })) } : {}),
    })),
  );
  return archivo.toBuffer();
}
