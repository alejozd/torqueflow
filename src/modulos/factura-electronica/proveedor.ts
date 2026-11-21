// src/modulos/factura-electronica/proveedor.ts
import type { DocumentoElectronico, MensajeDian } from "./modelo";

export interface ReferenciaDocumento {
  tipo: "FACTURA" | "NOTA_CREDITO";
  prefijo: string;
  numero: number;
  cufe?: string;
}

export type ResultadoEnvio =
  | { estado: "ACEPTADO"; cufe: string; fechaValidacion: string; advertencias: MensajeDian[] }
  /** Rechazo de la DIAN o validación del proveedor: corregir y reenviar con el mismo número. */
  | { estado: "RECHAZADO"; motivos: MensajeDian[] }
  /** Caída, tiempo agotado o error 5xx: puede que la DIAN sí lo haya recibido. */
  | { estado: "ERROR_TEMPORAL"; mensaje: string }
  /** Token inválido o sin permiso: seguro no llegó a la DIAN. */
  | { estado: "ERROR_CONFIGURACION"; mensaje: string };

export type ResultadoConsulta = ResultadoEnvio | { estado: "NO_ENCONTRADO" };

export type ResultadoConexion = { ok: true } | { ok: false; mensaje: string };

export type FormatoArchivo = "PDF" | "XML";

export interface ProveedorFacturaElectronica {
  enviar(doc: DocumentoElectronico): Promise<ResultadoEnvio>;
  consultarEstado(ref: ReferenciaDocumento): Promise<ResultadoConsulta>;
  /** Lanza ErrorProveedor si el archivo no se puede descargar. */
  descargar(ref: ReferenciaDocumento, formato: FormatoArchivo): Promise<Uint8Array>;
  probarConexion(): Promise<ResultadoConexion>;
}

export class ErrorProveedor extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorProveedor";
  }
}
