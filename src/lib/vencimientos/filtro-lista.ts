import type { FilaVencimiento } from "@/app/actions/vencimiento-actions";
import type { TipoDocumento } from "./estado-vencimiento";

export type FiltroRapido = "TODOS" | "VENCIDO" | "PROXIMO" | "POR_VENCER" | "SIN_AVISAR";
export type FiltroDocumento = "TODOS" | TipoDocumento;
export type FilaFiltrable = Pick<FilaVencimiento, "tipo" | "estado" | "ultimoAviso">;

export const FILTROS_RAPIDOS: readonly FiltroRapido[] = ["TODOS", "VENCIDO", "PROXIMO", "POR_VENCER", "SIN_AVISAR"];

export const ETIQUETA_FILTRO_RAPIDO: Record<FiltroRapido, string> = {
  TODOS: "Todos",
  VENCIDO: "Vencidos",
  PROXIMO: "Vencen pronto",
  POR_VENCER: "Por vencer",
  SIN_AVISAR: "Sin avisar",
};

function cumple(fila: FilaFiltrable, rapido: FiltroRapido): boolean {
  if (rapido === "TODOS") return true;
  if (rapido === "SIN_AVISAR") return fila.ultimoAviso === null;
  return fila.estado === rapido;
}

export function filtrarVencimientos<T extends FilaFiltrable>(
  filas: readonly T[],
  documento: FiltroDocumento,
  rapido: FiltroRapido,
): T[] {
  return filas.filter((fila) => (documento === "TODOS" || fila.tipo === documento) && cumple(fila, rapido));
}

export function contarPorFiltro(filas: readonly FilaFiltrable[], documento: FiltroDocumento): Record<FiltroRapido, number> {
  const delDocumento = filtrarVencimientos(filas, documento, "TODOS");
  return Object.fromEntries(
    FILTROS_RAPIDOS.map((rapido) => [rapido, delDocumento.filter((fila) => cumple(fila, rapido)).length]),
  ) as Record<FiltroRapido, number>;
}
