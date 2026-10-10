import type { MensajeEmail } from "@/lib/email/enviar-email";
import { escaparHtml } from "@/lib/recordatorios/plantilla";
import {
  diasHastaVencimiento,
  formatoFechaVencimiento,
  NOMBRE_DOCUMENTO,
  type TipoDocumento,
} from "./estado-vencimiento";

export interface DatosAvisoVencimiento {
  clienteNombre: string;
  placa: string;
  tipo: TipoDocumento;
  fechaVencimiento: Date;
  tallerNombre: string;
  ahora: Date;
}

function frase(datos: DatosAvisoVencimiento): string {
  const documento = NOMBRE_DOCUMENTO[datos.tipo];
  const fecha = formatoFechaVencimiento.format(datos.fechaVencimiento);
  const verbo = diasHastaVencimiento(datos.fechaVencimiento, datos.ahora) < 0 ? "venció" : "vence";
  return `el ${documento} de tu vehículo ${datos.placa} ${verbo} el ${fecha}`;
}

/** Texto plano: cuerpo del email y mensaje de WhatsApp. */
export function textoAvisoVencimiento(datos: DatosAvisoVencimiento): string {
  return [
    `Hola ${datos.clienteNombre},`,
    "",
    `Te recordamos que ${frase(datos)}.`,
    "Circular con este documento vencido puede generar multas e inmovilización del vehículo.",
    "",
    `— ${datos.tallerNombre}`,
  ].join("\n");
}

export function construirMensajeAvisoVencimiento(para: string, datos: DatosAvisoVencimiento): MensajeEmail {
  const html = [
    `<p>Hola ${escaparHtml(datos.clienteNombre)},</p>`,
    `<p>Te recordamos que ${escaparHtml(frase(datos))}.</p>`,
    "<p>Circular con este documento vencido puede generar multas e inmovilización del vehículo.</p>",
    `<p>— ${escaparHtml(datos.tallerNombre)}</p>`,
  ].join("");

  return {
    para,
    asunto: `Vencimiento de ${NOMBRE_DOCUMENTO[datos.tipo]} — ${datos.placa}`,
    texto: textoAvisoVencimiento(datos),
    html,
  };
}
