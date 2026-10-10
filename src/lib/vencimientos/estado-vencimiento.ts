import { formatoDiaBogota } from "@/lib/fecha-bogota";

/**
 * Reglas de vencimiento de documentos del vehículo (SOAT / revisión
 * técnico-mecánica). Puro y sin Prisma: lo usan el barrido de email, la vista
 * /vencimientos, el detalle del vehículo y la nueva orden.
 *
 * Las fechas son columnas @db.Date, que Prisma entrega como medianoche UTC. Se
 * comparan como FECHA CALENDARIO contra "hoy en Bogotá": convertirlas a hora
 * de Bogotá las correría un día hacia atrás.
 */
export type TipoDocumento = "SOAT" | "TECNOMECANICA";
export type EstadoVencimiento = "SIN_DATO" | "VIGENTE" | "POR_VENCER" | "PROXIMO" | "VENCIDO";

export const DIAS_PROXIMO = 7;
export const DIAS_AVISO_POR_DEFECTO = 30;
/** El barrido de email no persigue indefinidamente a documentos vencidos hace mucho. */
export const VENTANA_VENCIDOS_EMAIL_DIAS = 30;

const MS_DIA = 24 * 60 * 60 * 1000;

export const NOMBRE_DOCUMENTO: Record<TipoDocumento, string> = {
  SOAT: "SOAT",
  TECNOMECANICA: "revisión técnico-mecánica",
};

/** Para frases: artículo y género del documento ("el SOAT" / "la revisión técnico-mecánica"). */
export const DOCUMENTO_CON_ARTICULO: Record<TipoDocumento, { conArticulo: string; vencido: string }> = {
  SOAT: { conArticulo: "el SOAT", vencido: "vencido" },
  TECNOMECANICA: { conArticulo: "la revisión técnico-mecánica", vencido: "vencida" },
};

/** Para mostrar una columna @db.Date sin correrla de día. */
export const formatoFechaVencimiento = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "UTC" });

export function fechaIsoAUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function hoyBogotaUtc(ahora: Date): Date {
  return fechaIsoAUtc(formatoDiaBogota.format(ahora));
}

export function diasHastaVencimiento(fecha: Date, ahora: Date): number {
  const vence = fechaIsoAUtc(fecha.toISOString().slice(0, 10));
  return Math.round((vence.getTime() - hoyBogotaUtc(ahora).getTime()) / MS_DIA);
}

export function estadoVencimiento(fecha: Date | null, ahora: Date, diasAviso: number): EstadoVencimiento {
  if (!fecha) return "SIN_DATO";
  const dias = diasHastaVencimiento(fecha, ahora);
  if (dias < 0) return "VENCIDO";
  if (dias <= Math.min(DIAS_PROXIMO, diasAviso)) return "PROXIMO";
  if (dias <= diasAviso) return "POR_VENCER";
  return "VIGENTE";
}

export function requiereAviso(estado: EstadoVencimiento): boolean {
  return estado === "PROXIMO" || estado === "POR_VENCER" || estado === "VENCIDO";
}

/** Último día (inclusive) que entra en la ventana de aviso, como medianoche UTC. */
export function fechaLimiteAviso(ahora: Date, diasAviso: number): Date {
  return new Date(hoyBogotaUtc(ahora).getTime() + diasAviso * MS_DIA);
}

/** Primer día (inclusive) de vencidos que el barrido de email todavía avisa. */
export function fechaInicioVencidosEmail(ahora: Date): Date {
  return new Date(hoyBogotaUtc(ahora).getTime() - VENTANA_VENCIDOS_EMAIL_DIAS * MS_DIA);
}
