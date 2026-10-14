import { deflateRawSync } from "node:zlib";
import { HOJAS, type HojaContrato } from "./hojas";

/** Contrato por nombre, para los tests que necesitan una hoja concreta. */
export function porNombre(nombre: string): HojaContrato {
  const hoja = HOJAS.find((candidata) => candidata.nombre === nombre);
  if (!hoja) throw new Error(`No existe la hoja ${nombre} en el contrato`);
  return hoja;
}

export interface EntradaZip {
  nombre: string;
  datos: Buffer;
  /** 8 = deflate (por defecto), 0 = sin comprimir. */
  metodo?: 0 | 8;
  /** Tamaño descomprimido que se declara (por defecto, el real). */
  declarado?: number;
  /** Tamaños en un descriptor detrás de los datos, como hace LibreOffice. */
  conDescriptor?: boolean;
}

/** Arma un zip mínimo y válido (cabeceras locales + directorio central + fin). */
export function armarZip(entradas: EntradaZip[], { omitirDelDirectorio = 0 } = {}): Buffer {
  const locales: Buffer[] = [];
  const centrales: Buffer[] = [];
  let desplazamiento = 0;
  for (const entrada of entradas) {
    const metodo = entrada.metodo ?? 8;
    const comprimidos = metodo === 8 ? deflateRawSync(entrada.datos) : entrada.datos;
    const nombre = Buffer.from(entrada.nombre);
    const declarado = entrada.declarado ?? entrada.datos.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(entrada.conDescriptor ? 0x08 : 0, 6);
    local.writeUInt16LE(metodo, 8);
    local.writeUInt32LE(entrada.conDescriptor ? 0 : comprimidos.length, 18);
    local.writeUInt32LE(entrada.conDescriptor ? 0 : declarado, 22);
    local.writeUInt16LE(nombre.length, 26);
    locales.push(local, nombre, comprimidos);
    let descriptor = 0;
    if (entrada.conDescriptor) {
      const bloque = Buffer.alloc(16);
      bloque.writeUInt32LE(0x08074b50, 0);
      bloque.writeUInt32LE(comprimidos.length, 8);
      bloque.writeUInt32LE(declarado, 12);
      locales.push(bloque);
      descriptor = 16;
    }

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(metodo, 10);
    central.writeUInt32LE(comprimidos.length, 20);
    central.writeUInt32LE(declarado, 24);
    central.writeUInt16LE(nombre.length, 28);
    central.writeUInt32LE(desplazamiento, 42);
    centrales.push(Buffer.concat([central, nombre]));

    desplazamiento += 30 + nombre.length + comprimidos.length + descriptor;
  }
  const directorio = Buffer.concat(centrales.slice(0, centrales.length - omitirDelDirectorio));
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(entradas.length - omitirDelDirectorio, 8);
  fin.writeUInt16LE(entradas.length - omitirDelDirectorio, 10);
  fin.writeUInt32LE(directorio.length, 12);
  fin.writeUInt32LE(desplazamiento, 16);
  return Buffer.concat([...locales, directorio, fin]);
}

