// src/modulos/factura-electronica/proveedores/nextpyme/proveedor.ts
import { traducirMensajeDian } from "../../mensajes-dian";
import type { DocumentoElectronico } from "../../modelo";
import { ErrorProveedor, type FormatoArchivo, type ProveedorFacturaElectronica, type ReferenciaDocumento } from "../../proveedor";
import { interpretarAmbiente, interpretarEmitidos, interpretarRespuestaEnvio, interpretarRespuestaEstado } from "./interpretar";
import { mapearDocumentoNextpyme } from "./mapear";

export interface OpcionesNextpyme {
  token: string;
  /** NIT del emisor sin DV (se usa en las rutas de descarga). */
  nitEmisor: string;
  baseUrl?: string;
  /** Tiempo máximo por llamada. Por defecto 20 s. */
  timeoutMs?: number;
  /** Para pruebas. Por defecto, el fetch global. */
  fetch?: typeof fetch;
}

const BASE = "https://api.nextpyme.plus/api/ubl2.1";
const PREFIJO_ARCHIVO = { FACTURA: "FES-", NOTA_CREDITO: "NCS-" } as const;
/** Por confirmar en el sandbox: la ficha del endpoint dice 1 = emitidos; el SDK dice 2. */
const TIPO_FILTRO_EMITIDOS = 1;

/** "2026-10-01" + (-1) → "2026-09-30" (fechas de calendario, sin zona). */
function sumarDias(fecha: string, dias: number): string {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Adaptador de Nextpyme Plus. El ambiente (pruebas o producción) se configura del lado de
 * Nextpyme para cada empresa; la URL es la misma.
 */
export function crearProveedorNextpyme(op: OpcionesNextpyme): ProveedorFacturaElectronica {
  const base = op.baseUrl ?? BASE;
  const hacerFetch = op.fetch ?? fetch;
  const timeoutMs = op.timeoutMs ?? 20_000;
  const encabezados = {
    Authorization: `Bearer ${op.token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  async function llamarJson(metodo: "GET" | "POST", ruta: string, cuerpo?: unknown): Promise<{ status: number; json: unknown }> {
    try {
      const res = await hacerFetch(`${base}${ruta}`, {
        method: metodo,
        headers: encabezados,
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const texto = await res.text();
      let json: unknown = null;
      try {
        json = texto ? JSON.parse(texto) : null;
      } catch {
        json = null;
      }
      return { status: res.status, json };
    } catch {
      return { status: 0, json: null };
    }
  }

  return {
    async enviar(doc: DocumentoElectronico) {
      let cuerpo: Record<string, unknown>;
      try {
        cuerpo = mapearDocumentoNextpyme(doc);
      } catch (e) {
        return { estado: "RECHAZADO", motivos: [traducirMensajeDian(e instanceof Error ? e.message : String(e))] };
      }
      const ruta = doc.tipo === "FACTURA" ? "/invoice" : "/credit-note";
      const { status, json } = await llamarJson("POST", ruta, cuerpo);
      return interpretarRespuestaEnvio(status, json);
    },

    async consultarEstado(ref: ReferenciaDocumento) {
      if (!ref.cufe) return { estado: "NO_ENCONTRADO" };
      const { status, json } = await llamarJson("POST", `/status/document/${encodeURIComponent(ref.cufe)}`, {});
      return interpretarRespuestaEstado(status, json, ref.cufe);
    },

    async buscarEmitido(ref: ReferenciaDocumento, fecha: string) {
      const consulta = new URLSearchParams({
        type_filter: String(TIPO_FILTRO_EMITIDOS),
        start_date: sumarDias(fecha, -1),
        end_date: sumarDias(fecha, 1),
      });
      const { status, json } = await llamarJson("GET", `/dian/documents/get-uuids?${consulta.toString()}`);
      return interpretarEmitidos(status, json, ref);
    },

    async descargar(ref: ReferenciaDocumento, formato: FormatoArchivo) {
      const archivo = `${PREFIJO_ARCHIVO[ref.tipo]}${ref.prefijo}${ref.numero}.${formato === "PDF" ? "pdf" : "xml"}`;
      let res: Response;
      try {
        res = await hacerFetch(`${base}/download/${encodeURIComponent(op.nitEmisor)}/${archivo}`, {
          method: "GET",
          headers: { Authorization: encabezados.Authorization },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new ErrorProveedor(`No se pudo descargar ${archivo}: el proveedor no respondió.`);
      }
      if (!res.ok) throw new ErrorProveedor(`No se pudo descargar ${archivo} (código ${res.status}).`);
      return new Uint8Array(await res.arrayBuffer());
    },

    async probarConexion() {
      const { status, json } = await llamarJson("GET", "/config/company");
      if (status >= 200 && status < 300) return { ok: true, ambiente: interpretarAmbiente(json) };
      if (status === 401 || status === 403) {
        return { ok: false, mensaje: "La conexión con el proveedor no es válida. Revisa el token en Configuración del taller." };
      }
      return { ok: false, mensaje: `El proveedor no respondió correctamente (código ${status || "sin respuesta"}).` };
    },
  };
}
