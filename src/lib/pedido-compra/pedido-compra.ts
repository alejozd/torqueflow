import type { MensajeEmail } from "@/lib/email/enviar-email";
import type { EstadoPedidoCompra } from "@/generated/prisma-tenant";

/**
 * DB-free rules for pedidos de compra: how dashboard selections become one
 * pedido per proveedor + bodega, which estado allows which action, and the
 * text sent to the proveedor by email or through a wa.me link (TorqueFlow has
 * no WhatsApp API: the user's own WhatsApp opens with the text prefilled).
 */

export interface LineaSeleccionada {
  repuestoId: string;
  proveedorId: string | null;
  bodegaId: string;
  cantidad: number;
  precioCompra: number;
}

export interface GrupoPedido {
  proveedorId: string;
  bodegaId: string;
  lineas: LineaSeleccionada[];
}

/**
 * One pedido per (proveedor, bodega): an entrada de mercancía belongs to a
 * single bodega, and receiving a pedido creates exactly one entrada. Lines
 * without a proveedor cannot be ordered and are returned apart.
 */
export function agruparLineasPedido(lineas: LineaSeleccionada[]): { grupos: GrupoPedido[]; sinProveedor: LineaSeleccionada[] } {
  const grupos = new Map<string, GrupoPedido>();
  const sinProveedor: LineaSeleccionada[] = [];
  for (const linea of lineas) {
    if (!linea.proveedorId) {
      sinProveedor.push(linea);
      continue;
    }
    const clave = `${linea.proveedorId}|${linea.bodegaId}`;
    const grupo = grupos.get(clave);
    if (grupo) grupo.lineas.push(linea);
    else grupos.set(clave, { proveedorId: linea.proveedorId, bodegaId: linea.bodegaId, lineas: [linea] });
  }
  return { grupos: [...grupos.values()], sinProveedor };
}

const ACCIONES_POR_ESTADO: Record<EstadoPedidoCompra, { enviar: boolean; recibir: boolean; cancelar: boolean }> = {
  BORRADOR: { enviar: true, recibir: false, cancelar: true },
  // Resending an ENVIADO pedido (e.g. the proveedor lost the message) is allowed.
  ENVIADO: { enviar: true, recibir: true, cancelar: true },
  RECIBIDO: { enviar: false, recibir: false, cancelar: false },
  CANCELADO: { enviar: false, recibir: false, cancelar: false },
};

export function accionesPermitidas(estado: EstadoPedidoCompra) {
  return ACCIONES_POR_ESTADO[estado];
}

const MS_DIA = 24 * 60 * 60 * 1000;

export function calcularFechaEsperada(enviadoAt: Date, diasEntrega: number): Date {
  return new Date(enviadoAt.getTime() + diasEntrega * MS_DIA);
}

/**
 * wa.me wants the number in international format, digits only. A 10-digit
 * number is a Colombian mobile without country code (the app is Colombia-only,
 * same rule as the cotización WhatsApp send); anything else is assumed to
 * already carry one. Null when there is no usable number.
 */
export function urlWhatsapp(telefono: string | null, texto: string): string | null {
  const digitos = (telefono ?? "").replace(/\D/g, "");
  if (digitos.length < 7) return null;
  const numero = digitos.length === 10 ? `57${digitos}` : digitos;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

export interface DatosMensajePedido {
  numero: number;
  tallerNombre: string;
  proveedorNombre: string;
  bodegaNombre: string;
  items: { codigo: string; nombre: string; cantidad: number }[];
}

export function textoPedidoWhatsapp(datos: DatosMensajePedido): string {
  return [
    `Hola ${datos.proveedorNombre}, somos ${datos.tallerNombre}.`,
    `Queremos hacer el pedido *#${datos.numero}*:`,
    "",
    ...datos.items.map((item) => `- ${item.cantidad} x ${item.nombre} (${item.codigo})`),
    "",
    `Entrega en: ${datos.bodegaNombre}.`,
    "¿Nos confirmas disponibilidad, precio y fecha de entrega? Gracias.",
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
 * Plain text plus table-based HTML with inline styles, same convention as the
 * cotización email: mail clients strip <style> blocks, and every string that
 * comes from user data is escaped before it reaches the HTML body.
 */
export function construirMensajePedido(para: string, datos: DatosMensajePedido): MensajeEmail {
  const texto = [
    `Hola ${datos.proveedorNombre},`,
    "",
    `Les enviamos el pedido de compra #${datos.numero}:`,
    "",
    ...datos.items.map((item) => `- ${item.cantidad} x ${item.nombre} (${item.codigo})`),
    "",
    `Entrega en: ${datos.bodegaNombre}.`,
    "Por favor confírmennos disponibilidad, precio y fecha de entrega.",
    "",
    `— ${datos.tallerNombre}`,
  ].join("\n");

  const celda = "padding:6px 8px;border-bottom:1px solid #e5e5e5;font-size:14px;";
  const filas = datos.items
    .map(
      (item) =>
        `<tr>` +
        `<td style="${celda}font-family:monospace;">${escaparHtml(item.codigo)}</td>` +
        `<td style="${celda}">${escaparHtml(item.nombre)}</td>` +
        `<td style="${celda}text-align:right;">${item.cantidad}</td>` +
        `</tr>`,
    )
    .join("");
  const encabezado = "padding:6px 8px;border-bottom:2px solid #333;font-size:12px;";
  const html =
    `<div style="font-family:Arial,sans-serif;color:#222;max-width:600px;">` +
    `<p>Hola ${escaparHtml(datos.proveedorNombre)},</p>` +
    `<p>Les enviamos el pedido de compra <strong>#${datos.numero}</strong>:</p>` +
    `<table style="width:100%;border-collapse:collapse;margin:12px 0;">` +
    `<thead><tr>` +
    `<th style="${encabezado}text-align:left;">Código</th>` +
    `<th style="${encabezado}text-align:left;">Repuesto</th>` +
    `<th style="${encabezado}text-align:right;">Cantidad</th>` +
    `</tr></thead><tbody>${filas}</tbody></table>` +
    `<p>Entrega en: ${escaparHtml(datos.bodegaNombre)}.</p>` +
    `<p>Por favor confírmennos disponibilidad, precio y fecha de entrega.</p>` +
    `<p>— ${escaparHtml(datos.tallerNombre)}</p>` +
    `</div>`;

  return { para, asunto: `Pedido de compra #${datos.numero} — ${datos.tallerNombre}`, texto, html };
}
