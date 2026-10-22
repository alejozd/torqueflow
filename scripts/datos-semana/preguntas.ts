import { createInterface } from "node:readline/promises";
import type { Contexto } from "./contexto";
import { sumarDias } from "./fechas";
import type { Respuestas, Volumen } from "./tipos";

export interface Pregunton {
  preguntar(texto: string): Promise<string>;
  cerrar(): void;
}

export function crearPregunton(): Pregunton {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return { preguntar: (texto) => rl.question(texto), cerrar: () => rl.close() };
}

const FORMATO = /^\d{4}-\d{2}-\d{2}$/;

function esFechaReal(f: string): boolean {
  if (!FORMATO.test(f)) return false;
  const d = new Date(`${f}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f;
}

/** Mensaje de error, o null si el rango es válido. */
export function validarRango(desde: string, hasta: string, hoy: string): string | null {
  if (!esFechaReal(desde) || !esFechaReal(hasta)) return "Use el formato AAAA-MM-DD";
  if (hasta > hoy) return "No se permiten fechas futuras";
  if (desde > hasta) return "La fecha desde no puede ser posterior a hasta";
  return null;
}

function lunesDeLaSemana(hoy: string): string {
  const dia = new Date(`${hoy}T00:00:00Z`).getUTCDay(); // 0 = domingo
  return sumarDias(hoy, -((dia + 6) % 7));
}

/** Repite la pregunta mientras `convertir` devuelva un texto (el mensaje de error). */
async function preguntarHasta<T>(
  p: Pregunton, texto: string, convertir: (respuesta: string) => { valor: T } | string,
): Promise<T> {
  let prefijo = "";
  for (;;) {
    const resultado = convertir((await p.preguntar(prefijo + texto)).trim());
    if (typeof resultado !== "string") return resultado.valor;
    prefijo = `${resultado}\n`;
  }
}

const NO_VALIDA = "Opción no válida";
const VOLUMENES: Volumen[] = ["bajo", "medio", "alto"];
const SI = ["s", "si", "sí"];

export async function hacerPreguntas(
  p: Pregunton, ctx: Pick<Contexto, "sedes">, hoy: string,
): Promise<Respuestas> {
  const lunes = lunesDeLaSemana(hoy);
  let rango: { desde: string; hasta: string } | null = null;
  let error = "";
  while (!rango) {
    const desde = (await p.preguntar(`${error}Desde [${lunes}]: `)).trim() || lunes;
    const hasta = (await p.preguntar(`Hasta [${hoy}]: `)).trim() || hoy;
    const mensaje = validarRango(desde, hasta, hoy);
    if (mensaje) error = `${mensaje}\n`;
    else rango = { desde, hasta };
  }

  const todas = ctx.sedes.length + 1;
  const lista = ctx.sedes.map((s, i) => `  ${i + 1}) ${s.nombre}`).concat(`  ${todas}) Todas`);
  const sedeIds = await preguntarHasta(p, `Sede:\n${lista.join("\n")}\nElija [${todas}]: `, (r) => {
    const n = r === "" ? todas : Number(r);
    if (!Number.isInteger(n) || n < 1 || n > todas) return NO_VALIDA;
    return { valor: n === todas ? ctx.sedes.map((s) => s.id) : [ctx.sedes[n - 1].id] };
  });

  const clientesNuevos = await preguntarHasta(p, "Clientes nuevos (0 = usar existentes) [0]: ", (r) => {
    const n = r === "" ? 0 : Number(r);
    return Number.isInteger(n) && n >= 0 ? { valor: n } : NO_VALIDA;
  });

  const volumen = await preguntarHasta<Volumen>(p, "Volumen (bajo/medio/alto) [medio]: ", (r) => {
    const v = (r || "medio").toLowerCase();
    return (VOLUMENES as string[]).includes(v) ? { valor: v as Volumen } : NO_VALIDA;
  });

  const liquidar = await preguntarHasta(p, "Liquidar nómina? (s/n) [n]: ", (r) => {
    const v = (r || "n").toLowerCase();
    if (SI.includes(v)) return { valor: true };
    return v === "n" || v === "no" ? { valor: false } : NO_VALIDA;
  });

  return { ...rango, sedeIds, clientesNuevos, volumen, liquidar };
}

export async function confirmar(p: Pregunton, resumen: string): Promise<boolean> {
  const r = (await p.preguntar(`${resumen}\nContinuar? (s/n) [n]: `)).trim().toLowerCase();
  return SI.includes(r);
}
