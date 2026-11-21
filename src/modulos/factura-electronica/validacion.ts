// src/modulos/factura-electronica/validacion.ts
import { calcularLinea, calcularTotales } from "./calculo";
import { calcularDvNit } from "./dv-nit";
import type { DocumentoElectronico, ErrorValidacion, Resolucion } from "./modelo";

export interface ContextoValidacion {
  /** Obligatoria para facturas; las notas crédito no la usan. */
  resolucion?: Resolucion;
  /** YYYY-MM-DD (hoy en Colombia). */
  hoy: string;
}

const tieneMaxDosDecimales = (n: number) => Math.abs(Math.round(n * 100) - n * 100) < 1e-9;

/** Revisa el documento antes de enviarlo. Lista vacía = listo para enviar. */
export function validarDocumento(doc: DocumentoElectronico, ctx: ContextoValidacion): ErrorValidacion[] {
  const errores: ErrorValidacion[] = [];
  const error = (campo: string, mensaje: string) => errores.push({ campo, mensaje });

  // Líneas
  if (doc.lineas.length === 0) error("lineas", "El documento no tiene ningún concepto.");
  doc.lineas.forEach((l, i) => {
    const c = `lineas[${i}]`;
    if (!l.descripcion.trim()) error(`${c}.descripcion`, `El concepto ${i + 1} no tiene descripción.`);
    else if (!(l.cantidad > 0)) error(`${c}.cantidad`, `La cantidad del concepto ${i + 1} debe ser mayor que cero.`);
    else if (!tieneMaxDosDecimales(l.cantidad))
      error(`${c}.cantidad`, `La cantidad del concepto ${i + 1} puede tener máximo dos decimales.`);
    else if (!Number.isInteger(l.precioUnitario) || l.precioUnitario < 0)
      error(`${c}.precioUnitario`, `El precio del concepto ${i + 1} no es válido.`);
    else if (!Number.isInteger(l.descuento) || l.descuento < 0 || l.descuento > calcularLinea(l).bruto)
      error(`${c}.descuento`, `El descuento del concepto ${i + 1} no puede ser mayor que su valor.`);
    else if (l.iva && (l.iva.tarifa < 0 || l.iva.tarifa > 100))
      error(`${c}.iva`, `La tarifa de IVA del concepto ${i + 1} no es válida.`);
  });

  // Adquirente
  const a = doc.adquirente;
  if (a.tipo === "IDENTIFICADO") {
    if (!a.numeroDocumento.trim()) error("adquirente.numeroDocumento", "Falta el número de documento del cliente.");
    else if (a.tipoDocumento === "31") {
      if (!/^\d{1,15}$/.test(a.numeroDocumento.replace(/[.\s-]/g, ""))) {
        error("adquirente.numeroDocumento", "El NIT del cliente solo puede tener números.");
      } else {
        const esperado = calcularDvNit(a.numeroDocumento);
        if (!a.dv) error("adquirente.dv", "Falta el dígito de verificación del NIT del cliente.");
        else if (a.dv !== esperado)
          error("adquirente.dv", `El dígito de verificación del NIT no corresponde (debería ser ${esperado}).`);
      }
    }
    if (!a.nombre.trim()) error("adquirente.nombre", "Falta el nombre o razón social del cliente.");
    if (!/^\d{5}$/.test(a.municipioDane)) error("adquirente.municipioDane", "Falta el municipio del cliente.");
    if (!a.direccion.trim()) error("adquirente.direccion", "Falta la dirección del cliente.");
  } else if (doc.pago.forma === "CREDITO") {
    error("pago.forma", "No se puede vender a crédito al consumidor final. Identifica al cliente o cambia a contado.");
  }

  // Específico por tipo
  if (doc.tipo === "FACTURA") {
    const r = ctx.resolucion;
    if (!r) {
      error("resolucion", "No hay resolución de numeración configurada.");
    } else {
      if (doc.prefijo !== r.prefijo)
        error("prefijo", `El prefijo ${doc.prefijo} no es el de la resolución (${r.prefijo}).`);
      if (doc.resolucionNumero !== r.numero)
        error("resolucionNumero", "El número de resolución no coincide con el configurado.");
      if (doc.numero < r.desde || doc.numero > r.hasta)
        error("numero", `El número ${doc.numero} está fuera del rango autorizado (${r.desde} a ${r.hasta}).`);
      if (ctx.hoy > r.vigenciaHasta) error("resolucion", `La resolución de numeración venció el ${r.vigenciaHasta}.`);
      else if (ctx.hoy < r.vigenciaDesde)
        error("resolucion", `La resolución de numeración rige desde el ${r.vigenciaDesde}.`);
    }
    if (doc.lineas.length > 0 && errores.length === 0 && calcularTotales(doc.lineas).totalAPagar <= 0)
      error("total", "El total de la factura debe ser mayor que cero.");
  } else {
    if (!doc.motivo.trim()) error("motivo", "Escribe el motivo de la nota crédito.");
    if (!doc.facturaReferencia.cufe.trim())
      error("facturaReferencia.cufe", "Falta el CUFE de la factura que se va a corregir.");
  }

  return errores;
}
