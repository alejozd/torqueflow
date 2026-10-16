import type { MetodoPago } from "@/generated/prisma-tenant";
import type { MensajeEmail } from "@/lib/email/enviar-email";
import { roundMoney } from "@/lib/money/round";

/**
 * Comprobante de una venta de mostrador (rediseño, tarea 7): lo que se imprime,
 * lo que se manda por WhatsApp (wa.me) y por correo (SMTP). Sin Prisma: la
 * acción arma `ComprobanteVenta` y aquí solo se le da forma de texto.
 * No es factura electrónica y lo dice en cada salida.
 */

export const AVISO_NO_FACTURA = "Documento no válido como factura electrónica";

export const ETIQUETA_METODO_PAGO: Record<MetodoPago, string> = {
  EFECTIVO: "Efectivo",
  TARJETA: "Tarjeta",
  TRANSFERENCIA: "Transferencia",
  OTRO: "Otro",
  ANTICIPO: "Anticipo",
};

export interface PagoComprobante {
  metodoPago: MetodoPago;
  monto: number;
}

export interface ComprobanteVenta {
  id: string;
  tallerNombre: string;
  sedeNombre: string;
  numero: number;
  fecha: Date;
  /** null = Consumidor final. */
  cliente: { nombre: string; documento: string | null; telefono: string | null; email: string | null } | null;
  lineas: { id: string; descripcion: string; cantidad: number; precioUnitario: number }[];
  subtotal: number;
  descuento: number;
  iva: number;
  total: number;
  /** Un renglón por método, ya sumado. */
  pagos: PagoComprobante[];
  saldoPendiente: number;
}

/** Un renglón por método en el orden en que aparecen (dos pagos en efectivo se suman). */
export function agruparPagos(pagos: PagoComprobante[]): PagoComprobante[] {
  const porMetodo = new Map<MetodoPago, number>();
  for (const pago of pagos) porMetodo.set(pago.metodoPago, roundMoney((porMetodo.get(pago.metodoPago) ?? 0) + pago.monto));
  return [...porMetodo].map(([metodoPago, monto]) => ({ metodoPago, monto }));
}

/** "Efectivo", "Efectivo + Tarjeta" o "A crédito" si no se pagó nada. */
export function describirMetodos(pagos: PagoComprobante[]): string {
  const metodos = agruparPagos(pagos).map((pago) => ETIQUETA_METODO_PAGO[pago.metodoPago]);
  return metodos.length === 0 ? "A crédito" : metodos.join(" + ");
}

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const pesos = (valor: number) => formatoMoneda.format(valor);

/** Fecha y hora de Bogotá, la del taller, sin importar dónde corra el servidor. */
export const formatoFechaHoraBogota = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  dateStyle: "medium",
  timeStyle: "short",
});

function lineasTotales(datos: ComprobanteVenta): string[] {
  return [
    `Subtotal: ${pesos(datos.subtotal)}`,
    ...(datos.descuento > 0 ? [`Descuento: -${pesos(datos.descuento)}`] : []),
    `IVA: ${pesos(datos.iva)}`,
    `Total: ${pesos(datos.total)}`,
    ...agruparPagos(datos.pagos).map((pago) => `${ETIQUETA_METODO_PAGO[pago.metodoPago]}: ${pesos(pago.monto)}`),
    ...(datos.saldoPendiente > 0 ? [`Saldo pendiente: ${pesos(datos.saldoPendiente)}`] : []),
  ];
}

/** Texto plano para wa.me: WhatsApp solo entiende *negrita* y saltos de línea. */
export function textoComprobanteWhatsapp(datos: ComprobanteVenta): string {
  const saludo = datos.cliente ? `Hola ${datos.cliente.nombre}, ` : "Hola, ";
  return [
    `${saludo}gracias por tu compra en ${datos.tallerNombre}.`,
    `Comprobante de la venta #${datos.numero} · ${formatoFechaHoraBogota.format(datos.fecha)}`,
    "",
    ...datos.lineas.map((linea) => `• ${linea.descripcion} x${linea.cantidad}: ${pesos(linea.cantidad * linea.precioUnitario)}`),
    "",
    ...lineasTotales(datos).map((linea) => (linea.startsWith("Total:") ? `*${linea}*` : linea)),
    "",
    `_${AVISO_NO_FACTURA}_`,
  ].join("\n");
}

function escaparHtml(valor: string): string {
  return valor
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Correo del comprobante: texto plano más HTML básico con tablas y estilos en
 * línea (como la plantilla de la cotización). Lo que escribió alguien (nombre,
 * descripciones) se escapa: el correo lo abre un tercero.
 */
export function construirMensajeComprobante(para: string, datos: ComprobanteVenta): MensajeEmail {
  const nombre = datos.cliente?.nombre ?? "";
  const fecha = formatoFechaHoraBogota.format(datos.fecha);

  const texto = [
    `Hola ${nombre},`,
    "",
    `Te compartimos el comprobante de tu compra #${datos.numero} del ${fecha} en ${datos.sedeNombre}.`,
    "",
    ...datos.lineas.map((linea) => `- ${linea.descripcion} x${linea.cantidad}: ${pesos(linea.cantidad * linea.precioUnitario)}`),
    "",
    ...lineasTotales(datos),
    "",
    AVISO_NO_FACTURA,
    "",
    `— ${datos.tallerNombre}`,
  ].join("\n");

  const celda = (valor: string, derecha = false) =>
    `<td style="padding:6px 8px;border-bottom:1px solid #e5e5e5;font-size:14px;${derecha ? "text-align:right;" : ""}">${valor}</td>`;
  const filasLineas = datos.lineas
    .map(
      (linea) =>
        `<tr>${celda(escaparHtml(linea.descripcion))}${celda(String(linea.cantidad), true)}${celda(
          escaparHtml(pesos(linea.cantidad * linea.precioUnitario)),
          true,
        )}</tr>`,
    )
    .join("");
  const filasTotales = lineasTotales(datos)
    .map((linea) => {
      const [etiqueta, valor] = linea.split(": ");
      const fuerte = etiqueta === "Total" ? "font-weight:bold;" : "";
      return `<tr><td style="padding:3px 8px;font-size:14px;${fuerte}">${escaparHtml(etiqueta)}</td><td style="padding:3px 8px;font-size:14px;text-align:right;${fuerte}">${escaparHtml(valor)}</td></tr>`;
    })
    .join("");

  const html = [
    `<p>Hola ${escaparHtml(nombre)},</p>`,
    `<p>Te compartimos el comprobante de tu compra <strong>#${datos.numero}</strong> del ${escaparHtml(fecha)} en ${escaparHtml(datos.sedeNombre)}.</p>`,
    `<table style="width:100%;border-collapse:collapse;margin:12px 0;"><tbody>${filasLineas}</tbody></table>`,
    `<table style="width:100%;border-collapse:collapse;margin:8px 0;"><tbody>${filasTotales}</tbody></table>`,
    `<p style="font-size:12px;color:#666;">${AVISO_NO_FACTURA}</p>`,
    `<p>— ${escaparHtml(datos.tallerNombre)}</p>`,
  ].join("\n");

  return { para, asunto: `Comprobante de tu compra #${datos.numero} — ${datos.tallerNombre}`, texto, html };
}
