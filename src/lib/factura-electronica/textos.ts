// src/lib/factura-electronica/textos.ts
import type { EstadoDocumentoElectronico } from "@/generated/prisma-tenant";

export type EstadoDian = EstadoDocumentoElectronico | "SIN_ENVIAR";
export type TonoDian = "exito" | "alerta" | "error" | "neutro";

export const TEXTO_ESTADO_DIAN: Record<EstadoDian, { etiqueta: string; descripcion: string; tono: TonoDian }> = {
  SIN_ENVIAR: { etiqueta: "Sin enviar a la DIAN", descripcion: "Esta factura aún no se ha enviado a la DIAN.", tono: "alerta" },
  PENDIENTE: { etiqueta: "Lista para enviar", descripcion: "Ya tiene número, pero todavía no se envió a la DIAN.", tono: "alerta" },
  ENVIANDO: { etiqueta: "Enviando", descripcion: "Se está enviando a la DIAN. Espera unos segundos y recarga.", tono: "neutro" },
  POR_CONFIRMAR: {
    etiqueta: "Por confirmar",
    descripcion: "Se envió, pero no sabemos si la DIAN la recibió. Al reenviar, primero le preguntamos a la DIAN.",
    tono: "alerta",
  },
  ACEPTADO: { etiqueta: "Aceptada por la DIAN", descripcion: "La DIAN la aceptó. Ya es una factura electrónica válida.", tono: "exito" },
  RECHAZADO: {
    etiqueta: "Rechazada por la DIAN",
    descripcion: "La DIAN la rechazó. Corrige lo que indica abajo y vuelve a enviarla con el mismo número.",
    tono: "error",
  },
  ANULADO: { etiqueta: "Anulada", descripcion: "Se anuló con una nota crédito.", tono: "neutro" },
};

export function estadoDian(doc: { estado: EstadoDocumentoElectronico } | null | undefined): EstadoDian {
  return doc ? doc.estado : "SIN_ENVIAR";
}

const NECESITAN_ATENCION: ReadonlySet<EstadoDian> = new Set(["SIN_ENVIAR", "PENDIENTE", "POR_CONFIRMAR", "RECHAZADO"]);

/** Filtro "Sin enviar o rechazadas" y aviso de Inicio. */
export function necesitaAtencionDian(estado: EstadoDian): boolean {
  return NECESITAN_ATENCION.has(estado);
}

/** Las facturas creadas antes de activar la facturación electrónica no se cuentan ni se marcan (spec §11.11). */
export function cuentaParaDian(facturaCreadaAt: Date, activadaDesde: Date | null): boolean {
  return activadaDesde !== null && facturaCreadaAt.getTime() >= activadaDesde.getTime();
}

/** Estados de documento que el filtro y el conteo consideran pendientes (la falta de documento se trata aparte). */
export const ESTADOS_DOCUMENTO_PENDIENTES: EstadoDocumentoElectronico[] = ["PENDIENTE", "POR_CONFIRMAR", "RECHAZADO"];
