// src/modulos/factura-electronica/proveedores/simulado.ts
import { calcularTotales } from "../calculo";
import { traducirMensajesDian } from "../mensajes-dian";
import type { Centavos, DocumentoElectronico } from "../modelo";
import type {
  FormatoArchivo,
  ProveedorFacturaElectronica,
  ReferenciaDocumento,
  ResultadoBusqueda,
  ResultadoConexion,
  ResultadoConsulta,
  ResultadoEnvio,
} from "../proveedor";

/**
 * ACEPTAR (por defecto), RECHAZAR (FAU14), CAIDA (no llega) y CAIDA_RECIBIDO
 * (la DIAN lo recibe pero la respuesta se pierde: queda registrado y se responde ERROR_TEMPORAL).
 */
export type ResultadoSimulado = "ACEPTAR" | "RECHAZAR" | "CAIDA" | "CAIDA_RECIBIDO";

export interface AceptadoSimulado {
  cufe: string;
  fechaValidacion: string;
  total: Centavos;
}

/** Lo que "la DIAN" ya recibió. Compartirla entre instancias simula un mismo servicio. */
export type MemoriaSimulado = Map<string, AceptadoSimulado>;

export interface OpcionesSimulado {
  resultado?: ResultadoSimulado;
  /** Por defecto, una memoria propia de la instancia. */
  memoria?: MemoriaSimulado;
}

const clave = (r: { tipo: string; prefijo: string; numero: number }) => `${r.tipo}:${r.prefijo}${r.numero}`;
const NO_RESPONDE = "Simulación: el servicio de la DIAN no respondió.";

async function cufeSimulado(texto: string): Promise<string> {
  const huella = await crypto.subtle.digest("SHA-384", new TextEncoder().encode(`simulado:${texto}`));
  return [...new Uint8Array(huella)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Proveedor falso para desarrollo y demostraciones: no habla con nadie. */
export function crearProveedorSimulado(opciones: OpcionesSimulado = {}): ProveedorFacturaElectronica {
  const resultado = opciones.resultado ?? "ACEPTAR";
  const aceptados: MemoriaSimulado = opciones.memoria ?? new Map();

  return {
    async enviar(doc: DocumentoElectronico): Promise<ResultadoEnvio> {
      if (resultado === "CAIDA") return { estado: "ERROR_TEMPORAL", mensaje: NO_RESPONDE };
      if (resultado === "RECHAZAR") {
        return {
          estado: "RECHAZADO",
          motivos: traducirMensajesDian(
            "Regla: FAU14, Rechazo: Valor a Pagar de Factura es distinto de la Suma de Valor Bruto más tributos - Valor del Descuento Total + Valor del Cargo Total",
          ),
        };
      }
      const k = clave(doc);
      if (aceptados.has(k)) {
        return { estado: "RECHAZADO", motivos: traducirMensajesDian("Regla: 90, Rechazo: Documento procesado anteriormente.") };
      }
      const aceptado: AceptadoSimulado = {
        cufe: await cufeSimulado(k),
        fechaValidacion: `${doc.fecha}T${doc.hora}-05:00`,
        total: calcularTotales(doc.lineas).totalAPagar,
      };
      aceptados.set(k, aceptado);
      if (resultado === "CAIDA_RECIBIDO") {
        return { estado: "ERROR_TEMPORAL", mensaje: "Simulación: la DIAN recibió el documento pero la respuesta no llegó." };
      }
      return { estado: "ACEPTADO", cufe: aceptado.cufe, fechaValidacion: aceptado.fechaValidacion, advertencias: [] };
    },

    async consultarEstado(ref: ReferenciaDocumento): Promise<ResultadoConsulta> {
      const a = aceptados.get(clave(ref));
      return a
        ? { estado: "ACEPTADO", cufe: a.cufe, fechaValidacion: a.fechaValidacion, advertencias: [] }
        : { estado: "NO_ENCONTRADO" };
    },

    async buscarEmitido(ref: ReferenciaDocumento): Promise<ResultadoBusqueda> {
      if (resultado === "CAIDA") return { estado: "ERROR_TEMPORAL", mensaje: NO_RESPONDE };
      const a = aceptados.get(clave(ref));
      return a ? { estado: "ENCONTRADO", cufe: a.cufe, total: a.total } : { estado: "NO_ENCONTRADO" };
    },

    async descargar(ref: ReferenciaDocumento, formato: FormatoArchivo) {
      const numero = `${ref.prefijo}${ref.numero}`;
      const texto =
        formato === "PDF"
          ? `%PDF-1.4\n% Documento simulado ${numero} - sin validez fiscal\n%%EOF\n`
          : `<?xml version="1.0" encoding="UTF-8"?>\n<DocumentoSimulado numero="${numero}" validezFiscal="no"/>\n`;
      return new TextEncoder().encode(texto);
    },

    async probarConexion(): Promise<ResultadoConexion> {
      return resultado === "CAIDA"
        ? { ok: false, mensaje: "Simulación: sin conexión con el proveedor." }
        : { ok: true, ambiente: null };
    },
  };
}
