// Versión reducida (solo piezas puras). La rama de factura electrónica trae la versión completa.
import municipios from "./catalogos/municipios.json";
export * from "./modelo";
export { aTextoDecimal } from "./dinero";
export { calcularDvNit } from "./dv-nit";
export { calcularLinea, calcularTotales } from "./calculo";
export { lineasDesdePreciosConIva, type LineaConIva, type ConversionIvaIncluido } from "./iva-incluido";
export { validarDocumento, type ContextoValidacion } from "./validacion";
export { traducirMensajeDian, traducirMensajesDian, esDocumentoYaProcesado } from "./mensajes-dian";
/** Municipios de Colombia (código DANE, nombre, departamento), para buscadores. */
export const MUNICIPIOS: { codigo: string; nombre: string; departamento: string }[] = municipios;
