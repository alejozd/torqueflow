import type { MensajeEmail } from "@/lib/email/enviar-email";
import { formatoFechaCorta } from "@/lib/fecha-bogota";

/**
 * Plain text plus deliberately basic HTML -- same convention as
 * src/lib/notificaciones/plantilla.ts and src/lib/recordatorios/plantilla.ts.
 * Customer-supplied strings (clienteNombre) are escaped before they touch the
 * HTML body: this text is mailed to a third party, so an unescaped name is a
 * stored-XSS payload aimed at whatever mail client renders it.
 */
export interface DatosMensajeCotizacion {
  clienteNombre: string;
  numero: number;
  placa: string;
  marca: string;
  modelo: string;
  total: number;
  validaHasta: Date;
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

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function construirMensajeCotizacion(para: string, datos: DatosMensajeCotizacion): MensajeEmail {
  const vehiculo = `${datos.marca} ${datos.modelo} (${datos.placa})`;
  const totalTexto = formatoMoneda.format(datos.total);
  const validaHastaTexto = formatoFechaCorta.format(datos.validaHasta);

  const texto = [
    `Hola ${datos.clienteNombre},`,
    "",
    `Te compartimos la cotización #${datos.numero} para tu vehículo ${vehiculo}.`,
    `Total: ${totalTexto}. Válida hasta ${validaHastaTexto}.`,
    "",
    "Cualquier duda, contáctanos.",
    "",
    `— ${datos.tallerNombre}`,
  ].join("\n");

  const html = [
    `<p>Hola ${escaparHtml(datos.clienteNombre)},</p>`,
    `<p>Te compartimos la cotización <strong>#${datos.numero}</strong> para tu vehículo ` +
      `<strong>${escaparHtml(vehiculo)}</strong>.</p>`,
    `<p>Total: <strong>${escaparHtml(totalTexto)}</strong>. Válida hasta ${escaparHtml(validaHastaTexto)}.</p>`,
    "<p>Cualquier duda, contáctanos.</p>",
    `<p>— ${escaparHtml(datos.tallerNombre)}</p>`,
  ].join("");

  return {
    para,
    asunto: `Cotización #${datos.numero} — ${datos.placa}`,
    texto,
    html,
  };
}
