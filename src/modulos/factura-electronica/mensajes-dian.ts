// src/modulos/factura-electronica/mensajes-dian.ts
import type { MensajeDian } from "./modelo";

const CATALOGO: Record<string, { explicacion: string; comoCorregir: string | null }> = {
  FAU02: {
    explicacion: "El valor antes de impuestos no coincide con la suma de los conceptos.",
    comoCorregir: "Revisa cantidades, precios y descuentos de cada concepto y vuelve a enviar.",
  },
  FAU04: {
    explicacion: "La base del IVA no coincide con la suma de las bases de los conceptos.",
    comoCorregir: "Revisa la tarifa de IVA de cada concepto y vuelve a enviar.",
  },
  FAU14: {
    explicacion: "El total a pagar no coincide con el valor antes de impuestos más los impuestos.",
    comoCorregir: "Revisa descuentos e impuestos de la factura y vuelve a enviar.",
  },
  "90": {
    explicacion: "La DIAN ya había recibido un documento con este mismo número.",
    comoCorregir: null,
  },
  RUT01: {
    explicacion: "La DIAN todavía no valida el estado del RUT. Es solo un aviso.",
    comoCorregir: null,
  },
  CBF04: {
    explicacion: "La DIAN avisa que la descripción del motivo no está en su lista. Es solo un aviso.",
    comoCorregir: null,
  },
};

const PATRON = /^\s*Regla:\s*([^,]+),\s*(Rechazo|Notificaci[oó]n):\s*([\s\S]*)$/i;

export function traducirMensajeDian(texto: string): MensajeDian {
  const limpio = texto.trim();
  const m = PATRON.exec(limpio);
  if (!m) {
    return { codigo: null, tipo: "RECHAZO", textoDian: limpio, explicacion: limpio, comoCorregir: null };
  }
  const codigo = m[1].trim();
  const tipo = /^rechazo$/i.test(m[2]) ? "RECHAZO" : "NOTIFICACION";
  const textoDian = m[3].trim();
  const conocido = CATALOGO[codigo];
  return {
    codigo,
    tipo,
    textoDian,
    explicacion: conocido?.explicacion ?? textoDian,
    comoCorregir: conocido?.comoCorregir ?? null,
  };
}

export function traducirMensajesDian(textos: string | string[] | null | undefined): MensajeDian[] {
  if (!textos) return [];
  const lista = Array.isArray(textos) ? textos : [textos];
  return lista.filter((t) => t.trim()).map(traducirMensajeDian);
}

/** Regla 90: la DIAN ya tiene un documento con ese número (reenvío tras una caída). */
export function esDocumentoYaProcesado(motivos: MensajeDian[]): boolean {
  return motivos.some((m) => m.codigo === "90");
}
