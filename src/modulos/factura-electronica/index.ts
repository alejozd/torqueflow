import municipios from "./catalogos/municipios.json";
export * from "./modelo";
export { aTextoDecimal } from "./dinero";
export { calcularDvNit } from "./dv-nit";
export { calcularLinea, calcularTotales } from "./calculo";
export { validarDocumento, type ContextoValidacion } from "./validacion";
export { traducirMensajeDian, traducirMensajesDian, esDocumentoYaProcesado } from "./mensajes-dian";
export {
  ErrorProveedor,
  type ProveedorFacturaElectronica,
  type ReferenciaDocumento,
  type ResultadoEnvio,
  type ResultadoConsulta,
  type ResultadoConexion,
  type FormatoArchivo,
} from "./proveedor";
export { crearProveedorSimulado, type ResultadoSimulado } from "./proveedores/simulado";
export { crearProveedor, type Ambiente, type ConfigProveedor } from "./fabrica";
export { crearProveedorNextpyme, type OpcionesNextpyme } from "./proveedores/nextpyme/proveedor";
/** Municipios de Colombia (código DANE, nombre, departamento), para buscadores. */
export const MUNICIPIOS: { codigo: string; nombre: string; departamento: string }[] = municipios;
