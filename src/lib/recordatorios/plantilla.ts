import type { MensajeEmail } from "@/lib/email/enviar-email";
import type { MotivoMantenimiento } from "./mantenimiento";

/**
 * Plain text plus deliberately basic HTML -- no templating engine in v1, per
 * the scope decision recorded in the progress ledger. Customer-supplied strings
 * (names, plates) are escaped before they touch the HTML body: this text is
 * mailed to a third party, so an unescaped name is a stored-XSS payload aimed
 * at whatever mail client renders it.
 */
export interface DatosRecordatorio {
  clienteNombre: string;
  placa: string;
  marca: string;
  modelo: string;
  motivo: MotivoMantenimiento;
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

function razon(motivo: MotivoMantenimiento): string {
  return motivo === "KILOMETRAJE"
    ? "ha recorrido cerca de 5.000 km desde su último servicio"
    : "han pasado 6 meses desde su último servicio";
}

export function construirMensajeRecordatorio(para: string, datos: DatosRecordatorio): MensajeEmail {
  const vehiculo = `${datos.marca} ${datos.modelo} (${datos.placa})`;
  const motivoTexto = razon(datos.motivo);

  const texto = [
    `Hola ${datos.clienteNombre},`,
    "",
    `Tu vehículo ${vehiculo} ${motivoTexto}, así que es un buen momento para su mantenimiento preventivo.`,
    "",
    `Escríbenos o llámanos para agendar una cita en ${datos.tallerNombre}.`,
    "",
    `— ${datos.tallerNombre}`,
  ].join("\n");

  const html = [
    `<p>Hola ${escaparHtml(datos.clienteNombre)},</p>`,
    `<p>Tu vehículo <strong>${escaparHtml(vehiculo)}</strong> ${escaparHtml(motivoTexto)}, ` +
      "así que es un buen momento para su mantenimiento preventivo.</p>",
    `<p>Escríbenos o llámanos para agendar una cita en ${escaparHtml(datos.tallerNombre)}.</p>`,
    `<p>— ${escaparHtml(datos.tallerNombre)}</p>`,
  ].join("");

  return {
    para,
    asunto: `Recordatorio de mantenimiento — ${datos.placa}`,
    texto,
    html,
  };
}
