import type { MensajeEmail } from "@/lib/email/enviar-email";
import type { EstadoOrden } from "@/generated/prisma-tenant";

/**
 * The three estado transitions worth emailing a customer about. BORRADOR is
 * never a transition target (ESTADO_ORDEN_TRANSITIONS has no edge into it)
 * and ENTREGADA is deliberately excluded: whoever marks an orden ENTREGADA
 * is doing so with the customer standing at the counter, so a notification
 * at that moment is redundant, not helpful.
 */
const ESTADOS_NOTIFICABLES = ["EN_PROCESO", "TERMINADA", "ANULADA"] as const;

export type EstadoNotificable = (typeof ESTADOS_NOTIFICABLES)[number];

export function esEstadoNotificable(estado: EstadoOrden): estado is EstadoNotificable {
  return (ESTADOS_NOTIFICABLES as readonly string[]).includes(estado);
}

export interface DatosMensajeEstadoOrden {
  clienteNombre: string;
  placa: string;
  marca: string;
  modelo: string;
  estado: EstadoNotificable;
  tallerNombre: string;
}

function escaparHtml(valor: string): string {
  return valor
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function asunto(estado: EstadoNotificable, placa: string): string {
  const titulos: Record<EstadoNotificable, string> = {
    EN_PROCESO: "Tu vehículo está en reparación",
    TERMINADA: "Tu vehículo está listo para recoger",
    ANULADA: "Tu orden de trabajo fue anulada",
  };
  return `${titulos[estado]} — ${placa}`;
}

function descripcion(estado: EstadoNotificable): string {
  const descripciones: Record<EstadoNotificable, string> = {
    EN_PROCESO: "entró a reparación y nuestro equipo ya está trabajando en él",
    TERMINADA: "terminó su servicio y está listo para que lo recojas",
    ANULADA: "tuvo su orden de trabajo anulada",
  };
  return descripciones[estado];
}

export function construirMensajeEstadoOrden(para: string, datos: DatosMensajeEstadoOrden): MensajeEmail {
  const vehiculo = `${datos.marca} ${datos.modelo} (${datos.placa})`;
  const descripcionTexto = descripcion(datos.estado);

  const texto = [
    `Hola ${datos.clienteNombre},`,
    "",
    `Tu vehículo ${vehiculo} ${descripcionTexto}.`,
    "",
    `— ${datos.tallerNombre}`,
  ].join("\n");

  const html = [
    `<p>Hola ${escaparHtml(datos.clienteNombre)},</p>`,
    `<p>Tu vehículo <strong>${escaparHtml(vehiculo)}</strong> ${escaparHtml(descripcionTexto)}.</p>`,
    `<p>— ${escaparHtml(datos.tallerNombre)}</p>`,
  ].join("");

  return {
    para,
    asunto: asunto(datos.estado, datos.placa),
    texto,
    html,
  };
}
