/**
 * Claves de duplicado (D6). Cada entidad tiene su forma de identificar un
 * registro existente y todas se prefijan para poder mezclarlas en un mismo
 * conjunto sin colisiones (un documento que se llame igual que una placa no
 * debe hacer que un vehículo "ya exista").
 */

import { normalizarClave, normalizarCodigo, normalizarPlaca } from "./normalizar";
import type { FilaReporte } from "./resultado";

function conPrefijo(prefijo: string, valor: unknown): string | null {
  const clave = typeof valor === "string" ? valor : "";
  const normalizada = prefijo === "placa:" ? normalizarPlaca(clave) : prefijo === "cod:" ? normalizarCodigo(clave) : normalizarClave(clave);
  return normalizada ? `${prefijo}${normalizada}` : null;
}

export const claveDocumento = (valor: unknown) => conPrefijo("doc:", valor);
export const claveNombreCliente = (valor: unknown) => conPrefijo("nom:", valor);
export const clavePlaca = (valor: unknown) => conPrefijo("placa:", valor);
export const claveCodigo = (valor: unknown) => conPrefijo("cod:", valor);
export const claveNombreServicio = (valor: unknown) => conPrefijo("serv:", valor);

/** Conjunto de claves ya existentes en la base, sin huecos. */
export function setDeClaves(claves: (string | null | undefined)[]): Set<string> {
  return new Set(claves.filter((clave): clave is string => typeof clave === "string" && clave.length > 0));
}

export interface FilaConClaves {
  numeroFila: number;
  /** Claves por las que se busca si la fila ya existe, en orden de prioridad. */
  claves: string[];
}

/**
 * Separa lo que se puede crear de lo que ya existe. Se considera existente si
 * alguna de sus claves está en la base **o** si ya apareció en este mismo
 * archivo (el taller suele repetir la misma fila sin darse cuenta).
 */
export function separarDuplicados<T extends FilaConClaves>(
  filas: T[],
  existentes: Set<string>,
  hoja: string,
  describir: (fila: T, clave: string) => string,
): { nuevas: T[]; omitidas: FilaReporte[] } {
  const vistas = new Set<string>();
  const nuevas: T[] = [];
  const omitidas: FilaReporte[] = [];

  for (const fila of filas) {
    const repetida = fila.claves.find((clave) => vistas.has(clave));
    const enBase = fila.claves.find((clave) => existentes.has(clave));
    const clave = repetida ?? enBase;

    if (clave !== undefined) {
      omitidas.push({
        hoja,
        fila: fila.numeroFila,
        columna: null,
        valor: describir(fila, clave),
        tipo: "ya_existia",
        motivo: repetida !== undefined ? "Está repetida en este mismo archivo" : "Ya existe en el sistema",
      });
      continue;
    }

    for (const suya of fila.claves) vistas.add(suya);
    nuevas.push(fila);
  }

  return { nuevas, omitidas };
}
