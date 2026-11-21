// src/lib/factura-electronica/avisos-resolucion.ts
const NUMEROS_AVISO = 100;
const DIAS_AVISO = 30;
const MS_DIA = 86_400_000;

/** Días entre dos "YYYY-MM-DD" (b − a). */
function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / MS_DIA);
}

/** Avisos en lenguaje sencillo sobre el rango y la vigencia de la resolución. `hoy` = día de Colombia "YYYY-MM-DD". */
export function avisosResolucion(
  c: { rangoHasta: number | null; vigenciaHasta: string | null; siguienteConsecutivo: number },
  hoy: string,
): string[] {
  const avisos: string[] = [];
  if (c.rangoHasta !== null) {
    const quedan = c.rangoHasta - c.siguienteConsecutivo + 1;
    if (quedan <= 0) {
      avisos.push("Se acabaron los números de la resolución: no se pueden enviar facturas hasta registrar una nueva.");
    } else if (quedan <= NUMEROS_AVISO) {
      avisos.push(`Quedan ${quedan} números de la resolución. Pide una nueva a la DIAN.`);
    }
  }
  if (c.vigenciaHasta !== null) {
    const dias = diasEntre(hoy, c.vigenciaHasta);
    if (dias < 0) {
      avisos.push(`La resolución venció el ${c.vigenciaHasta}: no se pueden enviar facturas hasta registrar una nueva.`);
    } else if (dias <= DIAS_AVISO) {
      avisos.push(`La resolución vence en ${dias} días (${c.vigenciaHasta}).`);
    }
  }
  return avisos;
}
