import { diaSemana, diasDelMes, formatoDiaLargo, sumarDias } from "@/lib/agenda-cita";

// Ayudantes de los campos de fecha. Todo con cadenas "aaaa-mm-dd" en hora de
// Bogotá: nunca Date local, así el día elegido no se corre con la zona horaria.

export type TipoFecha = "pasado" | "vencimiento" | "mantenimiento" | "garantia" | "cotizacion" | "seguimiento";
export type Tono = "ok" | "aviso" | "vencido" | "neutro";
export interface Atajo { etiqueta: string; cantidad: number; unidad: "dias" | "meses" }
export interface Ayuda { texto: string; tono: Tono }
export interface Periodo { etiqueta: string; rango: (hoy: string) => [string, string] }

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const pad = (n: number) => String(n).padStart(2, "0");
const partes = (iso: string) => iso.split("-").map(Number) as [number, number, number];
const capitalizar = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

export function sumarMesesDia(iso: string, meses: number): string {
  const [anio, mes, dia] = partes(iso);
  const destino = new Date(Date.UTC(anio, mes - 1 + meses, 1));
  const mesIso = `${destino.getUTCFullYear()}-${pad(destino.getUTCMonth() + 1)}`;
  return `${mesIso}-${pad(Math.min(dia, diasDelMes(mesIso)))}`;
}

export function diasEntre(desde: string, hasta: string): number {
  const [a1, m1, d1] = partes(desde);
  const [a2, m2, d2] = partes(hasta);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

export function duracionTexto(dias: number): string {
  const n = Math.abs(dias);
  if (n === 1) return "1 día";
  // Hasta un mes, días exactos: «Vence en 18 días» se entiende mejor que «3 semanas».
  if (n <= 30) return `${n} días`;
  if (n < 365) {
    const meses = Math.round(n / 30.44);
    return meses === 1 ? "1 mes" : `${meses} meses`;
  }
  const anios = Math.floor(n / 365);
  const meses = Math.round((n - anios * 365) / 30.44);
  const textoAnios = anios === 1 ? "1 año" : `${anios} años`;
  return meses > 0 && meses < 12 ? `${textoAnios} y ${meses === 1 ? "1 mes" : `${meses} meses`}` : textoAnios;
}

export function relativoTexto(iso: string, hoy: string): string {
  const n = diasEntre(hoy, iso);
  if (n === 0) return "hoy";
  if (n === -1) return "ayer";
  if (n === 1) return "mañana";
  return n > 0 ? `en ${duracionTexto(n)}` : `hace ${duracionTexto(n)}`;
}

export function formatoDiaLargoConAnio(iso: string, hoy: string): string {
  return iso.slice(0, 4) === hoy.slice(0, 4) ? formatoDiaLargo(iso) : `${formatoDiaLargo(iso)} de ${iso.slice(0, 4)}`;
}

export function formatoNumerico(iso: string): string {
  const [anio, mes, dia] = partes(iso);
  return `${pad(dia)}/${pad(mes)}/${anio}`;
}

export function leerFechaEscrita(texto: string): string | null {
  const m = texto.trim().match(/^(\d{1,2})[/.\- ](\d{1,2})[/.\- ](\d{2}|\d{4})$/);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const anio = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > diasDelMes(`${anio}-${pad(mes)}`)) return null;
  return `${anio}-${pad(mes)}-${pad(dia)}`;
}

const dias = (etiqueta: string, cantidad: number): Atajo => ({ etiqueta, cantidad, unidad: "dias" });
const meses = (etiqueta: string, cantidad: number): Atajo => ({ etiqueta, cantidad, unidad: "meses" });

export const ATAJOS: Record<TipoFecha, Atajo[]> = {
  pasado: [dias("Hoy", 0), dias("Ayer", -1)],
  vencimiento: [meses("En 6 meses", 6), meses("En 1 año", 12)],
  mantenimiento: [meses("En 3 meses", 3), meses("En 6 meses", 6)],
  garantia: [meses("En 3 meses", 3), meses("En 6 meses", 6), meses("En 1 año", 12)],
  cotizacion: [dias("En 8 días", 8), dias("En 15 días", 15), dias("En 30 días", 30)],
  seguimiento: [dias("Mañana", 1), dias("En 3 días", 3), dias("En 1 semana", 7)],
};

export function fechaDeAtajo(atajo: Atajo, hoy: string): string {
  return atajo.unidad === "dias" ? sumarDias(hoy, atajo.cantidad) : sumarMesesDia(hoy, atajo.cantidad);
}

export function ayudaFecha(tipo: TipoFecha, valor: string | null, hoy: string): Ayuda | null {
  const conFechaLimite = tipo === "vencimiento" || tipo === "garantia" || tipo === "mantenimiento";
  if (!valor) return conFechaLimite ? { texto: "Sin fecha", tono: "neutro" } : null;
  const n = diasEntre(hoy, valor);
  switch (tipo) {
    case "vencimiento":
    case "garantia":
      if (n < 0) return { texto: `Venció hace ${duracionTexto(n)}`, tono: "vencido" };
      if (n === 0) return { texto: "Vence hoy", tono: "vencido" };
      return { texto: `Vence en ${duracionTexto(n)}`, tono: n <= 30 ? "aviso" : "ok" };
    case "mantenimiento":
      if (n < 0) return { texto: `Se pasó hace ${duracionTexto(n)}`, tono: "vencido" };
      if (n === 0) return { texto: "Es hoy", tono: "aviso" };
      return { texto: `Faltan ${duracionTexto(n)}`, tono: n <= 30 ? "aviso" : "ok" };
    case "pasado":
      return { texto: capitalizar(relativoTexto(valor, hoy)), tono: "neutro" };
    case "cotizacion":
      return n <= 0
        ? { texto: "Vence hoy", tono: "aviso" }
        : { texto: `El cliente tiene ${duracionTexto(n)} para aceptarla`, tono: "neutro" };
    case "seguimiento":
      return { texto: `Volver a llamar ${relativoTexto(valor, hoy)}`, tono: "neutro" };
  }
}

/** Lunes de la semana de `iso` (diaSemana: 0 = domingo). */
const lunesDe = (iso: string) => sumarDias(iso, -((diaSemana(iso) + 6) % 7));
const ultimoDelMes = (mesIso: string) => `${mesIso}-${pad(diasDelMes(mesIso))}`;

export const PERIODOS: Periodo[] = [
  { etiqueta: "Hoy", rango: (hoy) => [hoy, hoy] },
  { etiqueta: "Ayer", rango: (hoy) => [sumarDias(hoy, -1), sumarDias(hoy, -1)] },
  { etiqueta: "Esta semana", rango: (hoy) => [lunesDe(hoy), hoy] },
  { etiqueta: "Semana pasada", rango: (hoy) => [sumarDias(lunesDe(hoy), -7), sumarDias(lunesDe(hoy), -1)] },
  { etiqueta: "Este mes", rango: (hoy) => [`${hoy.slice(0, 7)}-01`, hoy] },
  {
    etiqueta: "Mes pasado",
    rango: (hoy) => {
      const inicio = sumarMesesDia(`${hoy.slice(0, 7)}-01`, -1);
      return [inicio, ultimoDelMes(inicio.slice(0, 7))];
    },
  },
  { etiqueta: "Últimos 30 días", rango: (hoy) => [sumarDias(hoy, -29), hoy] },
  { etiqueta: "Este año", rango: (hoy) => [`${hoy.slice(0, 4)}-01-01`, hoy] },
];

export function periodoDe(desde: string, hasta: string, hoy: string): number {
  return PERIODOS.findIndex((p) => {
    const [a, b] = p.rango(hoy);
    return a === desde && b === hasta;
  });
}

export function textoRango(desde: string, hasta: string, hoy: string): string {
  if (desde === hasta) return capitalizar(formatoDiaLargoConAnio(desde, hoy));
  const [a1, m1, d1] = partes(desde);
  const [a2, m2, d2] = partes(hasta);
  const anio = String(a2) !== hoy.slice(0, 4) ? ` de ${a2}` : "";
  if (a1 === a2 && m1 === m2) return `${d1} – ${d2} de ${MESES[m2 - 1]}${anio}`;
  if (a1 === a2) return `${d1} de ${MESES[m1 - 1]} – ${d2} de ${MESES[m2 - 1]}${anio}`;
  return `${d1} ${MESES[m1 - 1].slice(0, 3)} ${a1} – ${d2} ${MESES[m2 - 1].slice(0, 3)} ${a2}`;
}
