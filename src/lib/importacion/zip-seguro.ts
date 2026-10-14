import { inflateRawSync } from "node:zlib";

/**
 * Defensa contra "bombas zip" en la importación (fase de consolidación, hallazgo
 * M4). Un `.xlsx` es un zip: el tope de 5 MB del archivo no dice nada de cuánto
 * ocupa **descomprimido**, y la librería de Excel lo descomprime entero en
 * memoria antes de que se aplique el tope de filas. Un archivo de pocos KB
 * puede expandirse a gigabytes y tumbar el proceso, que atiende a todos los
 * talleres.
 *
 * No basta con leer el tamaño que el zip **declara**: se puede mentir en él, y
 * el lector de Excel recorre las cabeceras locales sin mirar el índice. Así que
 * aquí se recorre el archivo como lo haría ese lector y se **descomprime de
 * verdad cada entrada con un tope** (`maxOutputLength` de zlib): en cuanto el
 * total supera el límite se corta, sin haber gastado más memoria que el límite.
 * También se exige que cada entrada esté en el directorio central y que no
 * quede nada escondido entre la última entrada y el directorio.
 *
 * Solo entiende lo que produce Excel: entradas sin comprimir (0) o con deflate
 * (8) y sin ZIP64 (un archivo de 5 MB nunca lo necesita). Cualquier otra cosa se
 * rechaza como inválida.
 */

export type ResultadoZip = { ok: true } | { ok: false; motivo: "demasiado-grande" | "invalido" };

const FIRMA_LOCAL = 0x04034b50;
const FIRMA_CENTRAL = 0x02014b50;
const FIRMA_FIN = 0x06054b50;
const FIRMA_DESCRIPTOR = 0x08074b50;
const SIN_ZIP64 = 0xffffffff;
const MAX_ENTRADAS = 5000;

interface EntradaCentral {
  metodo: number;
  comprimido: number;
}

class ZipInvalido extends Error {}

function leer32(buffer: Buffer, posicion: number): number {
  if (posicion + 4 > buffer.length) throw new ZipInvalido();
  return buffer.readUInt32LE(posicion);
}

function leer16(buffer: Buffer, posicion: number): number {
  if (posicion + 2 > buffer.length) throw new ZipInvalido();
  return buffer.readUInt16LE(posicion);
}

/** Directorio central: dónde empieza y qué entradas lista, por su desplazamiento. */
function leerDirectorio(zip: Buffer): { inicio: number; entradas: Map<number, EntradaCentral> } {
  // El registro de fin (22 bytes) está al final, seguido de un comentario de hasta 64 KB.
  let fin = -1;
  for (let posicion = zip.length - 22; posicion >= Math.max(0, zip.length - 22 - 0xffff); posicion -= 1) {
    if (zip.readUInt32LE(posicion) === FIRMA_FIN) {
      fin = posicion;
      break;
    }
  }
  if (fin < 0) throw new ZipInvalido();

  const cantidad = leer16(zip, fin + 10);
  const inicio = leer32(zip, fin + 16);
  if (cantidad > MAX_ENTRADAS || inicio === SIN_ZIP64 || inicio > fin) throw new ZipInvalido();

  const entradas = new Map<number, EntradaCentral>();
  let posicion = inicio;
  for (let indice = 0; indice < cantidad; indice += 1) {
    if (leer32(zip, posicion) !== FIRMA_CENTRAL) throw new ZipInvalido();
    const comprimido = leer32(zip, posicion + 20);
    const desplazamiento = leer32(zip, posicion + 42);
    if (comprimido === SIN_ZIP64 || desplazamiento === SIN_ZIP64) throw new ZipInvalido();
    entradas.set(desplazamiento, { metodo: leer16(zip, posicion + 10), comprimido });
    posicion += 46 + leer16(zip, posicion + 28) + leer16(zip, posicion + 30) + leer16(zip, posicion + 32);
  }
  return { inicio, entradas };
}

export function verificarZipAcotado(zip: Buffer, limiteBytes: number): ResultadoZip {
  try {
    if (zip.length < 22) throw new ZipInvalido();
    const directorio = leerDirectorio(zip);

    let total = 0;
    let vistas = 0;
    let posicion = 0;
    while (posicion < directorio.inicio) {
      if (leer32(zip, posicion) !== FIRMA_LOCAL) throw new ZipInvalido();
      const central = directorio.entradas.get(posicion);
      // Una entrada que el índice no lista es justo lo que esconde una bomba.
      if (!central) throw new ZipInvalido();

      const banderas = leer16(zip, posicion + 6);
      const metodo = leer16(zip, posicion + 8);
      const conDescriptor = (banderas & 0x08) !== 0;
      const comprimidoLocal = leer32(zip, posicion + 18);
      const comprimido = conDescriptor ? central.comprimido : comprimidoLocal;
      if (metodo !== central.metodo || (!conDescriptor && comprimidoLocal !== central.comprimido)) {
        throw new ZipInvalido();
      }

      const inicioDatos = posicion + 30 + leer16(zip, posicion + 26) + leer16(zip, posicion + 28);
      const finDatos = inicioDatos + comprimido;
      if (finDatos > directorio.inicio) throw new ZipInvalido();
      const datos = zip.subarray(inicioDatos, finDatos);

      if (metodo === 0) {
        total += datos.length;
      } else if (metodo === 8) {
        const restante = limiteBytes - total;
        if (restante < 0) return { ok: false, motivo: "demasiado-grande" };
        try {
          // +1: si cabe exactamente no se corta; si se pasa aunque sea un byte, lanza.
          total += inflateRawSync(datos, { maxOutputLength: restante + 1 }).length;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE") {
            return { ok: false, motivo: "demasiado-grande" };
          }
          throw new ZipInvalido();
        }
      } else {
        throw new ZipInvalido();
      }
      if (total > limiteBytes) return { ok: false, motivo: "demasiado-grande" };

      posicion = finDatos;
      if (conDescriptor) posicion += leer32(zip, posicion) === FIRMA_DESCRIPTOR ? 16 : 12;
      vistas += 1;
    }

    if (posicion !== directorio.inicio || vistas !== directorio.entradas.size) throw new ZipInvalido();
    return { ok: true };
  } catch (error) {
    if (error instanceof ZipInvalido || error instanceof RangeError) return { ok: false, motivo: "invalido" };
    throw error;
  }
}
