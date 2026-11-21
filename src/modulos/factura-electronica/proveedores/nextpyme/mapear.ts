// src/modulos/factura-electronica/proveedores/nextpyme/mapear.ts
import { calcularTotales } from "../../calculo";
import { aTextoDecimal as dinero } from "../../dinero";
import { NUMERO_CONSUMIDOR_FINAL, type Adquirente, type DocumentoElectronico, type Linea, type TotalesLinea } from "../../modelo";
import { idNextpyme } from "./catalogos";

const IVA = () => idNextpyme("tributos", "01");
/** 999 = estándar de adopción del contribuyente (código propio del producto). */
const TIPO_IDENTIFICACION_ITEM = 4;
const SIN_MATRICULA = "0000000-00";

const cantidad = (n: number) => n.toFixed(2);
const porcentaje = (n: number) => n.toFixed(2);

function dias(desde: string, hasta: string): number {
  const ms = Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

function mapearCliente(a: Adquirente) {
  if (a.tipo === "CONSUMIDOR_FINAL") {
    return { identification_number: Number(NUMERO_CONSUMIDOR_FINAL), name: "CONSUMIDOR FINAL", merchant_registration: SIN_MATRICULA };
  }
  return {
    identification_number: a.numeroDocumento.replace(/[.\s-]/g, ""),
    ...(a.dv !== undefined ? { dv: a.dv } : {}),
    name: a.nombre,
    ...(a.telefono ? { phone: a.telefono } : {}),
    address: a.direccion,
    ...(a.email ? { email: a.email } : {}),
    merchant_registration: SIN_MATRICULA,
    type_document_identification_id: idNextpyme("tiposDocumentoIdentidad", a.tipoDocumento),
    type_organization_id: idNextpyme("tiposOrganizacion", a.tipoPersona === "JURIDICA" ? "1" : "2"),
    type_liability_id: idNextpyme("responsabilidades", a.responsabilidad),
    municipality_id: idNextpyme("municipios", a.municipioDane),
    type_regime_id: idNextpyme("regimenes", a.regimen),
  };
}

function mapearLinea(l: Linea, t: TotalesLinea) {
  return {
    unit_measure_id: idNextpyme("unidades", l.unidad),
    invoiced_quantity: cantidad(l.cantidad),
    line_extension_amount: dinero(t.neto),
    free_of_charge_indicator: false,
    ...(l.descuento > 0
      ? {
          allowance_charges: [
            { charge_indicator: false, allowance_charge_reason: "DESCUENTO", amount: dinero(l.descuento), base_amount: dinero(t.bruto) },
          ],
        }
      : {}),
    ...(l.iva
      ? { tax_totals: [{ tax_id: IVA(), tax_amount: dinero(t.iva), percent: porcentaje(l.iva.tarifa), taxable_amount: dinero(t.neto) }] }
      : {}),
    description: l.descripcion,
    code: l.codigo,
    type_item_identification_id: TIPO_IDENTIFICACION_ITEM,
    price_amount: dinero(l.precioUnitario),
    base_quantity: "1.00",
  };
}

/** DocumentoElectronico (códigos DIAN, centavos) → cuerpo JSON de Nextpyme. */
export function mapearDocumentoNextpyme(doc: DocumentoElectronico): Record<string, unknown> {
  const totales = calcularTotales(doc.lineas);
  const lineas = doc.lineas.map((l, i) => mapearLinea(l, totales.lineas[i]));
  const conCorreo = doc.enviarCorreo && doc.adquirente.tipo === "IDENTIFICADO" && Boolean(doc.adquirente.email);

  const base = {
    type_document_id: doc.tipo === "FACTURA" ? 1 : 4,
    date: doc.fecha,
    time: doc.hora,
    prefix: doc.prefijo,
    number: doc.numero,
    sendmail: conCorreo,
    customer: mapearCliente(doc.adquirente),
    payment_form: {
      payment_form_id: idNextpyme("formasPago", doc.pago.forma === "CONTADO" ? "1" : "2"),
      payment_method_id: idNextpyme("mediosPago", doc.pago.medio),
      payment_due_date: doc.pago.vencimiento,
      duration_measure: String(dias(doc.fecha, doc.pago.vencimiento)),
    },
    legal_monetary_totals: {
      line_extension_amount: dinero(totales.bruto),
      tax_exclusive_amount: dinero(totales.baseGravable),
      tax_inclusive_amount: dinero(totales.totalConImpuestos),
      allowance_total_amount: "0.00",
      charge_total_amount: "0.00",
      payable_amount: dinero(totales.totalAPagar),
    },
    ...(totales.impuestos.length > 0
      ? {
          tax_totals: totales.impuestos.map((i) => ({
            tax_id: IVA(),
            tax_amount: dinero(i.valor),
            percent: porcentaje(i.tarifa),
            taxable_amount: dinero(i.base),
          })),
        }
      : {}),
    ...(doc.notas ? { notes: doc.notas } : {}),
  };

  if (doc.tipo === "FACTURA") {
    return { ...base, resolution_number: doc.resolucionNumero, invoice_lines: lineas };
  }
  return {
    ...base,
    credit_note_lines: lineas,
    discrepancyresponsecode: idNextpyme("conceptosNotaCredito", doc.concepto),
    discrepancyresponsedescription: doc.motivo,
    billing_reference: {
      number: doc.facturaReferencia.numeroCompleto,
      uuid: doc.facturaReferencia.cufe,
      issue_date: doc.facturaReferencia.fecha,
    },
  };
}
