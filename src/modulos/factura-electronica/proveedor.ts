// src/modulos/factura-electronica/proveedor.ts
import type { Centavos, DocumentoElectronico, MensajeDian } from "./modelo";

export interface ReferenciaDocumento {
  tipo: "FACTURA" | "NOTA_CREDITO";
  prefijo: string;
  numero: number;
  cufe?: string;
}

export type ResultadoEnvio =
  | {
      estado: "ACEPTADO";
      cufe: string;
      /** ISO con zona ("2026-07-23T16:25:28-05:00"); null si el proveedor no la informa. */
      fechaValidacion: string | null;
      advertencias: MensajeDian[];
    }
  /** Rechazo de la DIAN o validación del proveedor: corregir y reenviar con el mismo número. */
  | { estado: "RECHAZADO"; motivos: MensajeDian[] }
  /** Caída, tiempo agotado o error 5xx: puede que la DIAN sí lo haya recibido. */
  | { estado: "ERROR_TEMPORAL"; mensaje: string }
  /** Token inválido o sin permiso: seguro no llegó a la DIAN. */
  | { estado: "ERROR_CONFIGURACION"; mensaje: string };

export type ResultadoConsulta = ResultadoEnvio | { estado: "NO_ENCONTRADO" };

/** Ambiente en que el proveedor tiene registrada la empresa. */
export type AmbienteProveedor = "PRUEBAS" | "PRODUCCION";

/** ambiente null: el proveedor no lo informa (el simulado, o una respuesta sin el dato). */
export type ResultadoConexion = { ok: true; ambiente: AmbienteProveedor | null } | { ok: false; mensaje: string };

/** Búsqueda en el histórico de documentos emitidos ante la DIAN (para recuperar el CUFE). */
export type ResultadoBusqueda =
  | { estado: "ENCONTRADO"; cufe: string; total: Centavos }
  | { estado: "NO_ENCONTRADO" }
  | { estado: "ERROR_TEMPORAL"; mensaje: string }
  | { estado: "ERROR_CONFIGURACION"; mensaje: string };

export type FormatoArchivo = "PDF" | "XML";

export interface ProveedorFacturaElectronica {
  enviar(doc: DocumentoElectronico): Promise<ResultadoEnvio>;
  consultarEstado(ref: ReferenciaDocumento): Promise<ResultadoConsulta>;
  /** Busca prefijo + número entre los emitidos alrededor de `fecha` (YYYY-MM-DD, la del documento). */
  buscarEmitido(ref: ReferenciaDocumento, fecha: string): Promise<ResultadoBusqueda>;
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
