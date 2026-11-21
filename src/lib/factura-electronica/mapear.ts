// src/lib/factura-electronica/mapear.ts
import {
  lineasDesdePreciosConIva,
  MEDIOS_PAGO,
  RESPONSABILIDADES_FISCALES,
  TIPOS_DOCUMENTO_IDENTIDAD,
  UNIDADES,
  type Adquirente,
  type ConversionIvaIncluido,
  type ErrorValidacion,
  type FacturaVenta,
  type LineaConIva,
  type ResponsabilidadFiscal,
  type TipoDocumentoIdentidad,
} from "@/modulos/factura-electronica";

/** Decimal de Prisma, texto o número: todo pasa por Number(). */
export type Numerico = number | { toString(): string };

const centavos = (v: Numerico) => Math.round(Number(v) * 100);

export interface ClienteParaMapear {
  nombre: string;
  telefono: string | null;
  email: string | null;
  documento: string | null;
  tipoDocumento: string | null;
  dv: string | null;
  tipoPersona: "NATURAL" | "JURIDICA" | null;
  responsabilidadFiscal: string | null;
  municipioCodigo: string | null;
  direccion: string | null;
}

/** La Factura de TorqueFlow con su cliente y las líneas de su orden (precios con IVA incluido). */
export interface FacturaParaMapear {
  total: Numerico;
  descuento: Numerico;
  cliente: ClienteParaMapear;
  orden: {
    items: { id: string; descripcion: string; cantidad: number; precioUnitario: Numerico; ivaPct: Numerico }[];
    manoDeObra: { id: string; descripcion: string; valor: Numerico; ivaPct: Numerico }[];
  };
}

export interface DatosNumeracion {
  prefijo: string;
  numero: number;
  resolucionNumero: string;
  /** YYYY-MM-DD, hora de Colombia. */
  fecha: string;
  /** HH:mm:ss, hora de Colombia. */
  hora: string;
}

export interface ResultadoMapeo {
  documento: FacturaVenta;
  conversion: ConversionIvaIncluido;
  /** Datos del cliente que faltan (además de lo que diga validarDocumento). */
  errores: ErrorValidacion[];
  /** Total electrónico − total guardado en la Factura, en centavos. Si no es 0 se ajusta la factura. */
  diferencia: number;
  /**
   * Lo más que el redondeo de los precios con IVA incluido puede mover el total, en centavos.
   * Una `diferencia` mayor no es redondeo: la factura no coincide con sus conceptos y no se envía.
   */
  tolerancia: number;
}

/** Por línea: medio centavo por cada unidad con su IVA (Σ ceil(q·(1+t)/2)) más uno de holgura. */
export function toleranciaRedondeo(lineas: Pick<LineaConIva, "cantidad" | "tarifa">[]): number {
  return lineas.reduce((suma, l) => suma + Math.ceil((l.cantidad * (1 + (l.tarifa ?? 0) / 100)) / 2) + 1, 0);
}

const tiene = (objeto: object, clave: string) => Object.prototype.hasOwnProperty.call(objeto, clave);
const esTipoDocumento = (v: string): v is TipoDocumentoIdentidad => tiene(TIPOS_DOCUMENTO_IDENTIDAD, v);
const esResponsabilidad = (v: string): v is ResponsabilidadFiscal => tiene(RESPONSABILIDADES_FISCALES, v);

/**
 * Cliente → adquirente. Con todos los datos, identificado. Si faltan: persona natural (o sin
 * tipo de persona) → consumidor final (spec §4.2); persona jurídica → identificado con lo que
 * haya y la lista de lo que falta, para que no se gaste número.
 */
export function adquirenteDesdeCliente(c: ClienteParaMapear): { adquirente: Adquirente; errores: ErrorValidacion[] } {
  const tipoDocumento = c.tipoDocumento && esTipoDocumento(c.tipoDocumento) ? c.tipoDocumento : null;
  const responsabilidad = c.responsabilidadFiscal && esResponsabilidad(c.responsabilidadFiscal) ? c.responsabilidadFiscal : null;
  const documento = c.documento?.trim() ?? "";
  const municipio = c.municipioCodigo?.trim() ?? "";
  const direccion = c.direccion?.trim() ?? "";
  const completo = Boolean(tipoDocumento && documento && c.tipoPersona && responsabilidad && municipio && direccion);
  if (!completo && c.tipoPersona !== "JURIDICA") return { adquirente: { tipo: "CONSUMIDOR_FINAL" }, errores: [] };

  const errores: ErrorValidacion[] = [];
  if (!tipoDocumento) errores.push({ campo: "cliente.tipoDocumento", mensaje: "Falta el tipo de documento del cliente." });
  if (!responsabilidad) {
    errores.push({ campo: "cliente.responsabilidadFiscal", mensaje: "Falta la responsabilidad fiscal del cliente." });
  }
  const dv = c.dv?.trim();
  const telefono = c.telefono?.trim();
  const email = c.email?.trim();
  return {
    adquirente: {
      tipo: "IDENTIFICADO",
      tipoDocumento: tipoDocumento ?? "31",
      numeroDocumento: documento,
      ...(dv ? { dv } : {}),
      nombre: c.nombre,
      tipoPersona: c.tipoPersona ?? "NATURAL",
      regimen: responsabilidad === "R-99-PN" ? "49" : "48",
      responsabilidad: responsabilidad ?? "R-99-PN",
      municipioDane: municipio,
      direccion,
      ...(telefono ? { telefono } : {}),
      ...(email ? { email } : {}),
    },
    errores,
  };
}

/**
 * Factura de TorqueFlow → factura electrónica del núcleo. Repuestos con su cantidad y unidad
 * "94"; mano de obra con cantidad 1 y unidad "ZZ" (spec §11.5). Pago de contado en efectivo.
 * Lanza Error si el descuento es negativo o mayor que el valor de los conceptos.
 */
export function mapearFactura(f: FacturaParaMapear, n: DatosNumeracion): ResultadoMapeo {
  const lineas: LineaConIva[] = [
    ...f.orden.items.map((i) => ({
      codigo: i.id,
      descripcion: i.descripcion,
      cantidad: i.cantidad,
      unidad: UNIDADES.UNIDAD,
      precioFinalUnitario: centavos(i.precioUnitario),
      tarifa: Number(i.ivaPct),
    })),
    ...f.orden.manoDeObra.map((m) => ({
      codigo: m.id,
      descripcion: m.descripcion,
      cantidad: 1,
      unidad: UNIDADES.SERVICIO,
      precioFinalUnitario: centavos(m.valor),
      tarifa: Number(m.ivaPct),
    })),
  ];
  const conversion = lineasDesdePreciosConIva(lineas, centavos(f.descuento));
  const { adquirente, errores } = adquirenteDesdeCliente(f.cliente);
  const documento: FacturaVenta = {
    tipo: "FACTURA",
    prefijo: n.prefijo,
    numero: n.numero,
    resolucionNumero: n.resolucionNumero,
    fecha: n.fecha,
    hora: n.hora,
    adquirente,
    lineas: conversion.lineas,
    pago: { forma: "CONTADO", medio: MEDIOS_PAGO.EFECTIVO, vencimiento: n.fecha },
    enviarCorreo: adquirente.tipo === "IDENTIFICADO" && Boolean(adquirente.email),
  };
  return {
    documento,
    conversion,
    errores,
    diferencia: conversion.totalElectronico - centavos(f.total),
    tolerancia: toleranciaRedondeo(lineas),
  };
}

/** Resumen para la ficha del cliente (se calcula en el servidor: este módulo no va al navegador). */
export function estadoDatosFeCliente(c: ClienteParaMapear): { completo: boolean; texto: string } {
  const { adquirente, errores } = adquirenteDesdeCliente(c);
  if (adquirente.tipo === "CONSUMIDOR_FINAL") return { completo: false, texto: "Incompletos: se facturará como consumidor final." };
  if (errores.length > 0 || !adquirente.municipioDane || !adquirente.direccion || !adquirente.numeroDocumento) {
    return { completo: false, texto: "Incompletos: no se podrá enviar la factura hasta completarlos." };
  }
  return { completo: true, texto: "Completos" };
}
