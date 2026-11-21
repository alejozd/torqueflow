// src/modulos/factura-electronica/proveedores/simulado.ts
import { traducirMensajesDian } from "../mensajes-dian";
import type { DocumentoElectronico } from "../modelo";
import type { ProveedorFacturaElectronica, ReferenciaDocumento } from "../proveedor";

export type ResultadoSimulado = "ACEPTAR" | "RECHAZAR" | "CAIDA";

const clave = (r: { tipo: string; prefijo: string; numero: number }) => `${r.tipo}:${r.prefijo}${r.numero}`;

async function cufeSimulado(texto: string): Promise<string> {
  const huella = await crypto.subtle.digest("SHA-384", new TextEncoder().encode(`simulado:${texto}`));
  return [...new Uint8Array(huella)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Proveedor falso para desarrollo y demostraciones: no habla con nadie.
 * Recuerda lo aceptado solo mientras viva la instancia.
 */
export function crearProveedorSimulado(opciones: { resultado?: ResultadoSimulado } = {}): ProveedorFacturaElectronica {
  const resultado = opciones.resultado ?? "ACEPTAR";
  const aceptados = new Map<string, { cufe: string; fechaValidacion: string }>();

  return {
    async enviar(doc: DocumentoElectronico) {
      if (resultado === "CAIDA") {
        return { estado: "ERROR_TEMPORAL", mensaje: "Simulación: el servicio de la DIAN no respondió." };
      }
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
      const aceptado = { cufe: await cufeSimulado(k), fechaValidacion: `${doc.fecha}T${doc.hora}-05:00` };
      aceptados.set(k, aceptado);
      return { estado: "ACEPTADO", ...aceptado, advertencias: [] };
    },

    async consultarEstado(ref: ReferenciaDocumento) {
      const a = aceptados.get(clave(ref));
      return a ? { estado: "ACEPTADO", ...a, advertencias: [] } : { estado: "NO_ENCONTRADO" };
    },

    async descargar(ref: ReferenciaDocumento, formato) {
      const numero = `${ref.prefijo}${ref.numero}`;
      const texto =
        formato === "PDF"
          ? `%PDF-1.4\n% Documento simulado ${numero} - sin validez fiscal\n%%EOF\n`
          : `<?xml version="1.0" encoding="UTF-8"?>\n<DocumentoSimulado numero="${numero}" validezFiscal="no"/>\n`;
      return new TextEncoder().encode(texto);
    },

    async probarConexion() {
      return resultado === "CAIDA" ? { ok: false, mensaje: "Simulación: sin conexión con el proveedor." } : { ok: true };
    },
  };
}
