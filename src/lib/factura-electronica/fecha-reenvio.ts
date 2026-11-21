import type { DocumentoElectronico } from "@/modulos/factura-electronica";

const MS_DIA = 86_400_000;
const dia = (s: string) => Date.parse(`${s}T00:00:00Z`);
const sumarDias = (s: string, n: number) => new Date(dia(s) + n * MS_DIA).toISOString().slice(0, 10);

/**
 * Spec §12.2: el reenvío conserva número, líneas y totales; si el día cambió (hora de Colombia),
 * lleva la fecha y hora de hoy y el vencimiento corrido el mismo plazo. El mismo día no cambia nada.
 */
export function conFechaDeReenvio<T extends DocumentoElectronico>(doc: T, hoy: { fecha: string; hora: string }): T {
  if (doc.fecha === hoy.fecha) return doc;
  const plazo = Math.round((dia(doc.pago.vencimiento) - dia(doc.fecha)) / MS_DIA);
  const vencimiento = doc.pago.forma === "CONTADO" ? hoy.fecha : sumarDias(hoy.fecha, Math.max(0, plazo));
  return { ...doc, fecha: hoy.fecha, hora: hoy.hora, pago: { ...doc.pago, vencimiento } };
}
