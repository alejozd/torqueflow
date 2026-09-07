import type { MensajeEmail } from "@/lib/email/enviar-email";
import { formatoFechaCorta } from "@/lib/fecha-bogota";

/**
 * Plain text plus deliberately basic HTML -- same convention as
 * src/lib/notificaciones/plantilla.ts and src/lib/recordatorios/plantilla.ts.
 * Customer-supplied strings (clienteNombre, item descripcion) are escaped
 * before they touch the HTML body: this text is mailed to a third party, so
 * an unescaped value is a stored-XSS payload aimed at whatever mail client
 * renders it.
 *
 * The HTML body is TABLE-based with inline styles on purpose -- this is an
 * EMAIL, and Gmail/Outlook strip <style> blocks and ignore modern CSS layout
 * (flexbox/grid), so every rule that must survive lives inline on the element
 * itself.
 */
export interface ItemMensajeCotizacion {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
}

export interface DatosMensajeCotizacion {
  clienteNombre: string;
  numero: number;
  placa: string;
  marca: string;
  modelo: string;
  items: ItemMensajeCotizacion[];
  subtotal: number;
  descuento: number;
  descuentoPct: number;
  iva: number;
  total: number;
  validaHasta: Date;
  tallerNombre: string;
  /** Optional forward-compatible slot for a taller logo -- there is no logo
   *  asset feature yet, so callers simply omit this today. */
  logoUrl?: string;
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

  const lineasItemsTexto = datos.items.map((item) => {
    const importe = item.cantidad * item.precioUnitario;
    return `- ${item.descripcion} x${item.cantidad}: ${formatoMoneda.format(importe)}`;
  });

  const lineasTotalesTexto = [
    `Subtotal: ${formatoMoneda.format(datos.subtotal)}`,
    ...(datos.descuento > 0 ? [`Descuento (${datos.descuentoPct}%): -${formatoMoneda.format(datos.descuento)}`] : []),
    `IVA: ${formatoMoneda.format(datos.iva)}`,
    `Total: ${totalTexto}`,
  ];

  const texto = [
    `Hola ${datos.clienteNombre},`,
    "",
    `Te compartimos la cotización #${datos.numero} para tu vehículo ${vehiculo}.`,
    "",
    ...lineasItemsTexto,
    "",
    ...lineasTotalesTexto,
    `Válida hasta ${validaHastaTexto}.`,
    "",
    "Cualquier duda, contáctanos.",
    "",
    `— ${datos.tallerNombre}`,
  ].join("\n");

  const encabezadoHtml = datos.logoUrl
    ? `<img src="${escaparHtml(datos.logoUrl)}" alt="${escaparHtml(datos.tallerNombre)}" style="max-height:48px" />`
    : "";

  const filasItemsHtml = datos.items
    .map((item) => {
      const importe = item.cantidad * item.precioUnitario;
      return (
        `<tr>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #e5e5e5;font-size:14px;">${escaparHtml(item.descripcion)}</td>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #e5e5e5;font-size:14px;text-align:right;">${item.cantidad}</td>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #e5e5e5;font-size:14px;text-align:right;">${escaparHtml(formatoMoneda.format(item.precioUnitario))}</td>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #e5e5e5;font-size:14px;text-align:right;">${escaparHtml(formatoMoneda.format(importe))}</td>` +
        `</tr>`
      );
    })
    .join("");

  const tablaItemsHtml =
    `<table style="width:100%;border-collapse:collapse;margin:12px 0;">` +
    `<thead><tr>` +
    `<th style="padding:6px 8px;border-bottom:2px solid #333;font-size:12px;text-align:left;">Concepto</th>` +
    `<th style="padding:6px 8px;border-bottom:2px solid #333;font-size:12px;text-align:right;">Cantidad</th>` +
    `<th style="padding:6px 8px;border-bottom:2px solid #333;font-size:12px;text-align:right;">Precio unit.</th>` +
    `<th style="padding:6px 8px;border-bottom:2px solid #333;font-size:12px;text-align:right;">Importe</th>` +
    `</tr></thead>` +
    `<tbody>${filasItemsHtml}</tbody>` +
    `</table>`;

  const filaTotal = (etiqueta: string, valor: string, destacado = false) =>
    `<tr>` +
    `<td style="padding:3px 8px;font-size:${destacado ? "16px" : "14px"};font-weight:${destacado ? "bold" : "normal"};">${etiqueta}</td>` +
    `<td style="padding:3px 8px;font-size:${destacado ? "16px" : "14px"};font-weight:${destacado ? "bold" : "normal"};text-align:right;">${valor}</td>` +
    `</tr>`;

  const tablaTotalesHtml =
    `<table style="width:100%;border-collapse:collapse;margin:8px 0;">` +
    `<tbody>` +
    filaTotal("Subtotal", escaparHtml(formatoMoneda.format(datos.subtotal))) +
    (datos.descuento > 0
      ? filaTotal(`Descuento (${datos.descuentoPct}%)`, `-${escaparHtml(formatoMoneda.format(datos.descuento))}`)
      : "") +
    filaTotal("IVA", escaparHtml(formatoMoneda.format(datos.iva))) +
    filaTotal("Total", escaparHtml(totalTexto), true) +
    `</tbody>` +
    `</table>`;

  const html = [
    encabezadoHtml,
    `<p>Hola ${escaparHtml(datos.clienteNombre)},</p>`,
    `<p>Te compartimos la cotización <strong>#${datos.numero}</strong> para tu vehículo ` +
      `<strong>${escaparHtml(vehiculo)}</strong>.</p>`,
    tablaItemsHtml,
    tablaTotalesHtml,
    `<p>Válida hasta ${escaparHtml(validaHastaTexto)}.</p>`,
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
