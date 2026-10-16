# Campos de fecha nuevos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar los 17 campos de fecha nativos (`type="date" | "month" | "datetime-local"`) por componentes propios con el mismo calendario del selector de citas, atajos por caso y una línea de ayuda en lenguaje sencillo.

**Architecture:** Se extrae el `CalendarioMes` de `selector-fecha-hora.tsx` a un componente reutilizable. Encima se construyen `CampoFecha`, `CampoFechaHora`, `RangoFechas` y `CampoMes`, todos sobre `@base-ui/react/popover`. Todo trabaja con cadenas ISO en hora de Bogotá (nunca `Date` local) y emite un `<input type="hidden" name>` con el mismo formato de hoy (`aaaa-mm-dd`, `aaaa-mm`, `aaaa-mm-ddTHH:mm`), así que no cambian esquemas zod, server actions ni searchParams.

**Tech Stack:** Next 16 (leer `node_modules/next/dist/docs/` ante dudas), React 19, Tailwind v4, shadcn base-nova sobre Base UI, lucide-react, react-hook-form 7, vitest + Testing Library (jsdom).

**Spec / referencia visual:** el ejemplo aprobado por el usuario: https://claude.ai/artifact/SeavJ6Dr7ptZWT1wQkvY2Q. Copia local: `C:\Users\alejo\AppData\Local\Temp\claude\C--Proyectos-torqueflow\da94933b-9486-4bb6-9675-e9e017cd85c6\scratchpad\campos-fecha.html`. Es la fuente de verdad para textos, atajos y aspecto.

## Global Constraints

- Rama: `fechas-rediseno` desde `main`. Commit + push al terminar cada tarea. Formato: `fechas-task N: descripción breve` + línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- NO agregar dependencias (nada de react-day-picker, date-fns ni dayjs).
- NO usar `new Date(iso)`, `toISOString()` sobre fechas locales ni `Date` en los componentes para manejar el día elegido: solo cadenas ISO y los ayudantes de `src/lib/agenda-cita.ts` / `src/lib/fechas-campo.ts`. El "hoy" sale de `formatoDiaBogota.format(new Date())` (`src/lib/fecha-bogota.ts`) o de una prop.
- Textos en español de Colombia, lenguaje sencillo y sin tecnicismos: «Vence en 7 meses», «Venció hace 4 días», «Faltan 18 días», «Hoy», «Ayer», «Elegir fecha», «Escríbela», «Ir a hoy», «Borrar».
- Colores: selección en `bg-primary text-primary-foreground` (naranja), ayuda ok `text-emerald-700 dark:text-emerald-400`, aviso `text-amber-700 dark:text-amber-400`, vencido `text-destructive`.
- Accesibilidad: el disparador es un `<button>` con `aria-haspopup="dialog"`, ligado a su `<Label>` con `aria-labelledby`; el calendario conserva la navegación con flechas que ya tiene `CalendarioMes`; los atajos son `<button aria-pressed>`.
- No tocar los archivos borrados/no rastreados de `docs/Evidencias/` que ya están en el árbol de trabajo: usar `git add` con rutas explícitas.
- Si el formulario arma el envío con `new FormData(form)` (desde el DOM), el componente DEBE recibir `name` para emitir su campo oculto; si no, la fecha no llega al servidor. Revisarlo en cada migración y cubrirlo con una prueba de `FormData` cuando el formulario ya tenga tests.
- Verificación al final de cada tarea: `npx tsc --noEmit`, `npm test -- <archivos de la tarea>`, `npx eslint <archivos tocados>`. Sin reintentos automáticos (RULES.md).

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `src/lib/fechas-campo.ts` (nuevo) | Ayudantes puros: sumar meses a un día, duración y relativo en palabras, leer fecha escrita, atajos, ayudas por tipo, periodos de rango. |
| `src/components/ui/calendario-mes.tsx` (nuevo) | Cuadrícula del mes extraída del selector de citas; soporta selección simple, rango, mín/máx y conteo opcional por día. |
| `src/components/selector-fecha-hora.tsx` | Pasa a usar `CalendarioMes` del archivo nuevo (sin cambio visible). |
| `src/components/campo-fecha.tsx` (nuevo) | Fecha suelta con atajos, ayuda y escritura manual. |
| `src/components/campo-fecha-hora.tsx` (nuevo) | Día + hora (seguimiento de cotización). |
| `src/components/rango-fechas.tsx` (nuevo) | Periodo desde/hasta con atajos (Reportes, Exportar). |
| `src/components/campo-mes.tsx` (nuevo) | Mes con flechas y rejilla de meses (Caja, Gastos, plantillas). |
| Formularios (tareas 4, 5, 6, 7, 8) | Cambian `<Input type=…>` por el componente correspondiente. |

## Orden y modelo sugerido por tarea

| # | Tarea | Modelo |
|---|---|---|
| 1 | Ayudantes puros `fechas-campo.ts` | sonnet |
| 2 | Extraer `CalendarioMes` | sonnet |
| 3 | `CampoFecha` | opus |
| 4 | Migrar vencimientos y cotización (RHF) | sonnet |
| 5 | Migrar fechas de pago y garantía | sonnet |
| 6 | `CampoFechaHora` + seguimiento | opus |
| 7 | `RangoFechas` + Reportes y Exportar | opus |
| 8 | `CampoMes` + Caja, Gastos, plantillas | sonnet |
| 9 | Revisión final, prueba en navegador y merge | opus |

---

### Task 1: Ayudantes puros `fechas-campo.ts`

**Files:**
- Create: `src/lib/fechas-campo.ts`
- Test: `src/lib/fechas-campo.test.ts`

**Interfaces:**
- Consumes: `sumarDias`, `diaSemana`, `diasDelMes`, `formatoDiaLargo` de `src/lib/agenda-cita.ts` (`diaSemana` devuelve 0 = domingo).
- Produces (exportado):
  ```ts
  export type TipoFecha = "pasado" | "vencimiento" | "mantenimiento" | "garantia" | "cotizacion" | "seguimiento";
  export type Tono = "ok" | "aviso" | "vencido" | "neutro";
  export interface Atajo { etiqueta: string; cantidad: number; unidad: "dias" | "meses" }
  export interface Ayuda { texto: string; tono: Tono }
  export interface Periodo { etiqueta: string; rango: (hoy: string) => [string, string] }
  export function sumarMesesDia(iso: string, meses: number): string;      // "2026-01-31" + 1 -> "2026-02-28"
  export function diasEntre(desde: string, hasta: string): number;        // con signo
  export function duracionTexto(dias: number): string;                    // usa valor absoluto
  export function relativoTexto(iso: string, hoy: string): string;        // "hoy" | "ayer" | "mañana" | "en 3 días" | "hace 2 semanas"
  export function formatoDiaLargoConAnio(iso: string, hoy: string): string; // agrega " de 2027" si el año difiere de hoy
  export function formatoNumerico(iso: string): string;                   // "16/10/2026"
  export function leerFechaEscrita(texto: string): string | null;        // "16/10/2026", "16-10-26", "1.2.2027"
  export const ATAJOS: Record<TipoFecha, Atajo[]>;
  export function fechaDeAtajo(atajo: Atajo, hoy: string): string;
  export function ayudaFecha(tipo: TipoFecha, valor: string | null, hoy: string): Ayuda | null;
  export const PERIODOS: Periodo[];                                        // Hoy, Ayer, Esta semana, Semana pasada, Este mes, Mes pasado, Últimos 30 días, Este año
  export function periodoDe(desde: string, hasta: string, hoy: string): number; // índice en PERIODOS o -1
  export function textoRango(desde: string, hasta: string, hoy: string): string;
  ```

- [ ] **Step 1: Write the failing tests** (`src/lib/fechas-campo.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import {
  ATAJOS, PERIODOS, ayudaFecha, diasEntre, duracionTexto, fechaDeAtajo, formatoDiaLargoConAnio,
  formatoNumerico, leerFechaEscrita, periodoDe, relativoTexto, sumarMesesDia, textoRango,
} from "./fechas-campo";

// Viernes 16 de octubre de 2026.
const HOY = "2026-10-16";

describe("sumarMesesDia", () => {
  it("suma meses conservando el día", () => expect(sumarMesesDia("2026-10-16", 12)).toBe("2027-10-16"));
  it("recorta al último día del mes", () => expect(sumarMesesDia("2026-01-31", 1)).toBe("2026-02-28"));
  it("resta meses cruzando el año", () => expect(sumarMesesDia("2026-01-15", -2)).toBe("2025-11-15"));
});

describe("duracionTexto y relativoTexto", () => {
  it.each([
    [1, "1 día"], [5, "5 días"], [14, "14 días"], [30, "30 días"], [31, "1 mes"], [49, "2 meses"],
    [60, "2 meses"], [212, "7 meses"], [365, "1 año"], [365 + 61, "1 año y 2 meses"], [-4, "4 días"],
  ])("%i días -> %s", (dias, texto) => expect(duracionTexto(dias)).toBe(texto));

  it.each([
    ["2026-10-16", "hoy"], ["2026-10-15", "ayer"], ["2026-10-17", "mañana"],
    ["2026-10-19", "en 3 días"], ["2026-10-02", "hace 14 días"],
  ])("%s -> %s", (iso, texto) => expect(relativoTexto(iso, HOY)).toBe(texto));

  it("diasEntre tiene signo", () => {
    expect(diasEntre(HOY, "2026-10-12")).toBe(-4);
    expect(diasEntre(HOY, "2027-10-16")).toBe(365);
  });
});

describe("formatos", () => {
  it("día largo sin año si es el año actual", () => expect(formatoDiaLargoConAnio("2026-10-16", HOY)).toBe("viernes 16 de octubre"));
  it("día largo con año si es otro año", () => expect(formatoDiaLargoConAnio("2027-05-16", HOY)).toBe("domingo 16 de mayo de 2027"));
  it("numérico dd/mm/aaaa", () => expect(formatoNumerico("2026-03-05")).toBe("05/03/2026"));
});

describe("leerFechaEscrita", () => {
  it.each([
    ["16/10/2026", "2026-10-16"], ["1/2/2027", "2027-02-01"], ["16-10-26", "2026-10-16"],
    ["16.10.2026", "2026-10-16"], [" 29/02/2028 ", "2028-02-29"],
  ])("%s -> %s", (texto, iso) => expect(leerFechaEscrita(texto)).toBe(iso));
  it.each(["", "16/13/2026", "31/04/2026", "29/02/2027", "2026-10-16", "hoy"])("rechaza %s", (texto) =>
    expect(leerFechaEscrita(texto)).toBeNull(),
  );
});

describe("atajos", () => {
  it("vencimiento ofrece 6 meses y 1 año", () => {
    expect(ATAJOS.vencimiento.map((a) => a.etiqueta)).toEqual(["En 6 meses", "En 1 año"]);
    expect(fechaDeAtajo(ATAJOS.vencimiento[1], HOY)).toBe("2027-10-16");
  });
  it("pasado ofrece Hoy y Ayer", () => {
    expect(ATAJOS.pasado.map((a) => fechaDeAtajo(a, HOY))).toEqual(["2026-10-16", "2026-10-15"]);
  });
  it("seguimiento, cotización, mantenimiento y garantía", () => {
    expect(ATAJOS.seguimiento.map((a) => a.etiqueta)).toEqual(["Mañana", "En 3 días", "En 1 semana"]);
    expect(ATAJOS.cotizacion.map((a) => a.etiqueta)).toEqual(["En 8 días", "En 15 días", "En 30 días"]);
    expect(ATAJOS.mantenimiento.map((a) => a.etiqueta)).toEqual(["En 3 meses", "En 6 meses"]);
    expect(ATAJOS.garantia.map((a) => a.etiqueta)).toEqual(["En 3 meses", "En 6 meses", "En 1 año"]);
  });
});

describe("ayudaFecha", () => {
  it("vencimiento: ok, aviso a 30 días o menos, vencido", () => {
    expect(ayudaFecha("vencimiento", "2027-05-16", HOY)).toEqual({ texto: "Vence en 7 meses", tono: "ok" });
    expect(ayudaFecha("vencimiento", "2026-11-03", HOY)).toEqual({ texto: "Vence en 18 días", tono: "aviso" });
    expect(ayudaFecha("vencimiento", HOY, HOY)).toEqual({ texto: "Vence hoy", tono: "vencido" });
    expect(ayudaFecha("vencimiento", "2026-10-12", HOY)).toEqual({ texto: "Venció hace 4 días", tono: "vencido" });
    expect(ayudaFecha("vencimiento", null, HOY)).toEqual({ texto: "Sin fecha", tono: "neutro" });
  });
  it("garantía usa los mismos textos que vencimiento", () => {
    expect(ayudaFecha("garantia", "2027-04-16", HOY)).toEqual({ texto: "Vence en 6 meses", tono: "ok" });
  });
  it("mantenimiento", () => {
    expect(ayudaFecha("mantenimiento", "2026-11-03", HOY)).toEqual({ texto: "Faltan 18 días", tono: "aviso" });
    expect(ayudaFecha("mantenimiento", HOY, HOY)).toEqual({ texto: "Es hoy", tono: "aviso" });
    expect(ayudaFecha("mantenimiento", "2026-10-12", HOY)).toEqual({ texto: "Se pasó hace 4 días", tono: "vencido" });
  });
  it("pasado, cotización y seguimiento", () => {
    expect(ayudaFecha("pasado", "2026-10-15", HOY)).toEqual({ texto: "Ayer", tono: "neutro" });
    expect(ayudaFecha("cotizacion", "2026-10-31", HOY)).toEqual({ texto: "El cliente tiene 15 días para aceptarla", tono: "neutro" });
    expect(ayudaFecha("cotizacion", HOY, HOY)).toEqual({ texto: "Vence hoy", tono: "aviso" });
    expect(ayudaFecha("seguimiento", "2026-10-19", HOY)).toEqual({ texto: "Volver a llamar en 3 días", tono: "neutro" });
  });
  it("sin valor: null salvo vencimiento, garantía y mantenimiento", () => {
    expect(ayudaFecha("pasado", null, HOY)).toBeNull();
    expect(ayudaFecha("mantenimiento", null, HOY)).toEqual({ texto: "Sin fecha", tono: "neutro" });
  });
});

describe("periodos", () => {
  const rango = (etiqueta: string) => PERIODOS.find((p) => p.etiqueta === etiqueta)!.rango(HOY);
  it("calcula cada periodo (la semana empieza el lunes)", () => {
    expect(rango("Hoy")).toEqual(["2026-10-16", "2026-10-16"]);
    expect(rango("Ayer")).toEqual(["2026-10-15", "2026-10-15"]);
    expect(rango("Esta semana")).toEqual(["2026-10-12", "2026-10-16"]);
    expect(rango("Semana pasada")).toEqual(["2026-10-05", "2026-10-11"]);
    expect(rango("Este mes")).toEqual(["2026-10-01", "2026-10-16"]);
    expect(rango("Mes pasado")).toEqual(["2026-09-01", "2026-09-30"]);
    expect(rango("Últimos 30 días")).toEqual(["2026-09-17", "2026-10-16"]);
    expect(rango("Este año")).toEqual(["2026-01-01", "2026-10-16"]);
  });
  it("periodoDe reconoce el periodo o devuelve -1", () => {
    expect(PERIODOS[periodoDe("2026-10-01", "2026-10-16", HOY)].etiqueta).toBe("Este mes");
    expect(periodoDe("2026-10-03", "2026-10-09", HOY)).toBe(-1);
  });
  it("textoRango", () => {
    expect(textoRango("2026-10-01", "2026-10-16", HOY)).toBe("1 – 16 de octubre");
    expect(textoRango("2026-09-20", "2026-10-05", HOY)).toBe("20 de septiembre – 5 de octubre");
    expect(textoRango("2025-12-20", "2026-01-05", HOY)).toBe("20 dic 2025 – 5 ene 2026");
    expect(textoRango("2026-10-16", "2026-10-16", HOY)).toBe("Viernes 16 de octubre");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/fechas-campo.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Write the implementation** (`src/lib/fechas-campo.ts`)

```ts
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
  // Hasta un mes, días exactos (decisión del usuario 2026-10-16).
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
```

- [ ] **Step 4: Run tests, tsc and lint**

Run: `npm test -- src/lib/fechas-campo.test.ts` → PASS. `npx tsc --noEmit` → sin errores. `npx eslint src/lib/fechas-campo.ts src/lib/fechas-campo.test.ts` → limpio.
Si un caso de prueba choca con el redondeo (p. ej. 212 días → "7 meses"), corrige el caso de prueba solo si el texto sigue siendo correcto para una persona; no cambies las reglas.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fechas-campo.ts src/lib/fechas-campo.test.ts docs/superpowers/plans/2026-10-16-campos-fecha.md
git commit -m "fechas-task 1: ayudantes de fecha (atajos, ayudas, periodos, fecha escrita)"
git push -u origin fechas-rediseno
```

---

### Task 2: Extraer `CalendarioMes` a `src/components/ui/calendario-mes.tsx`

**Files:**
- Create: `src/components/ui/calendario-mes.tsx`
- Modify: `src/components/selector-fecha-hora.tsx` (borrar la función local `CalendarioMes`, líneas ~427-551, e importarla)
- Test: `src/components/ui/calendario-mes.test.tsx`; `src/components/selector-fecha-hora.test.tsx` debe seguir pasando sin cambios.

**Interfaces:**
- Produces:
  ```ts
  export interface CalendarioMesProps {
    /** Día marcado como elegido ("aaaa-mm-dd") o null. */
    seleccionada: string | null;
    hoy: string;
    /** Límites inclusive; días fuera quedan deshabilitados y no se navega a meses fuera. */
    min?: string;
    max?: string;
    /** Rango a pintar (tramo suave entre los dos, extremos en naranja). */
    rango?: { desde: string; hasta: string | null };
    /** Opcional: punto azul y texto en aria-label ("ya hay 2 citas"). */
    citasPorDia?: (dia: string) => number;
    /** Mes que se muestra al abrir ("aaaa-mm"); por defecto el de seleccionada, rango.desde o hoy. */
    mesInicial?: string;
    onElegir: (dia: string) => void;
  }
  export function CalendarioMes(props: CalendarioMesProps): JSX.Element;
  ```
- El selector de citas pasa `min={permitirPasado ? undefined : ahora.fecha}` en lugar de `permitirPasado` y sigue pasando `citasPorDia`. La leyenda «ya hay citas ese día» solo se muestra si llega `citasPorDia`.

- [ ] **Step 1: Write failing tests** `calendario-mes.test.tsx`: (a) con `seleccionada="2026-10-16"` el botón «viernes 16 de octubre» tiene `aria-pressed="true"` y el de hoy `aria-current="date"`; (b) con `max="2026-10-16"` el día 17 está deshabilitado y el botón «Mes siguiente» también; (c) flecha derecha desde el 16 enfoca el 17; (d) con `rango={{desde:"2026-10-05",hasta:"2026-10-09"}}` el 07 tiene `data-tramo` y el 05 y 09 `aria-pressed="true"`; (e) clic en un día llama `onElegir("2026-10-20")`; (f) sin `citasPorDia` no aparece el texto «ya hay citas ese día».
- [ ] **Step 2:** `npm test -- src/components/ui/calendario-mes.test.tsx` → FAIL.
- [ ] **Step 3:** Mover el código tal cual desde `selector-fecha-hora.tsx` (mismas clases Tailwind, `ENCABEZADO_SEMANA`, teclado con `requestAnimationFrame`), cambiando: botones de día con `aria-pressed` (además de `aria-selected` en la celda), soporte de `min`/`max`/`rango`, y clases de rango: tramo `bg-primary/10 rounded-none`, extremos `bg-primary text-primary-foreground` con `rounded-l-md` / `rounded-r-md`. Exponer `data-tramo` en los días del tramo para las pruebas.
- [ ] **Step 4:** `npm test -- src/components/ui/calendario-mes.test.tsx src/components/selector-fecha-hora.test.tsx` → PASS; `npx tsc --noEmit`; eslint de los 3 archivos.
- [ ] **Step 5: Commit** `fechas-task 2: CalendarioMes reutilizable (selección, rango, límites)` y push.

---

### Task 3: `CampoFecha`

**Files:**
- Create: `src/components/campo-fecha.tsx`
- Test: `src/components/campo-fecha.test.tsx`

**Interfaces:**
- Consumes: `CalendarioMes` (Task 2), `ATAJOS`, `fechaDeAtajo`, `ayudaFecha`, `formatoDiaLargoConAnio`, `formatoNumerico`, `leerFechaEscrita` (Task 1), `formatoDiaBogota` de `src/lib/fecha-bogota.ts`, `Popover` de `@base-ui/react/popover` (mismo patrón que `selector-fecha-hora.tsx` líneas ~270-310).
- Produces:
  ```ts
  export interface CampoFechaProps {
    id: string;                 // id del botón (para <Label htmlFor>) y prefijo interno
    name?: string;              // si viene, emite <input type="hidden" name value="aaaa-mm-dd" | "">
    tipo: TipoFecha;
    value?: string;             // controlado ("" = sin fecha)
    defaultValue?: string;      // no controlado (formularios GET / FormData)
    onChange?: (valor: string) => void;
    onBlur?: () => void;        // para react-hook-form
    hoy?: string;               // por defecto formatoDiaBogota.format(new Date())
    min?: string;
    max?: string;
    obligatorio?: boolean;      // oculta «Borrar»
    invalid?: boolean;
    describedBy?: string;
    className?: string;
  }
  export function CampoFecha(props: CampoFechaProps): JSX.Element;
  ```
- Uso con RHF (lo usan las tareas 4 y 5):
  ```tsx
  <Controller control={control} name="soatVence" render={({ field }) => (
    <CampoFecha id="soatVence" tipo="vencimiento" value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur}
      invalid={!!errors.soatVence} describedBy={errors.soatVence ? "soatVence-error" : undefined} />
  )} />
  ```

**Comportamiento** (copiar del ejemplo aprobado):
- Disparador: `<button id={id} type="button" aria-haspopup="dialog">` alto 44px, ícono `CalendarDays` en cuadro `bg-primary/10 text-primary`, texto principal «Viernes 16 de octubre» (`formatoDiaLargoConAnio`, primera letra en mayúscula) y debajo en `text-xs text-muted-foreground` «16/10/2026»; vacío: «Elegir fecha» en gris. `aria-invalid` y `aria-describedby` en el botón.
- Fila de atajos `ATAJOS[tipo]` como chips redondeados `aria-pressed` (el que coincide con el valor queda resaltado). Los atajos que caen fuera de `min`/`max` no se muestran.
- Línea de ayuda `ayudaFecha` con punto de color según tono (ok verde, aviso ámbar, vencido `text-destructive`, neutro `text-muted-foreground`), `aria-live="polite"`.
- Popover: arriba «Escríbela» + `<input inputMode="numeric" placeholder="dd/mm/aaaa">`: al escribir una fecha válida el calendario salta a ese mes y la marca; Enter la elige y cierra; si es inválida muestra «Escríbela así: 16/10/2026», si pasa `max` «No puede ser una fecha futura», si es menor que `min` «Esa fecha ya pasó». Abajo `CalendarioMes`. Pie: «Borrar» (si no es obligatorio) e «Ir a hoy». Elegir un día cierra y devuelve el foco al disparador.

- [ ] **Step 1: Write failing tests** (patrón de `selector-fecha-hora.test.tsx`, con `hoy="2026-10-16"`):
  1. Muestra «Viernes 16 de octubre» y «16/10/2026» con `value="2026-10-16"`; vacío muestra «Elegir fecha».
  2. `tipo="vencimiento"`: clic en «En 1 año» → `onChange("2027-10-16")`, el chip queda `aria-pressed="true"` y aparece «Vence en 1 año».
  3. Con `value="2026-10-12"` y `tipo="vencimiento"` la ayuda dice «Venció hace 4 días».
  4. Abrir el popover, escribir «20/10/2026» + Enter → `onChange("2026-10-20")` y el popover se cierra.
  5. Escribir «99/99» + Enter → aparece «Escríbela así: 16/10/2026» y no llama `onChange`.
  6. `max` = hoy: el día 17 del calendario está deshabilitado.
  7. Con `name="fecha"` y `defaultValue="2026-10-01"` dentro de un `<form>`, `FormData.get("fecha") === "2026-10-01"`; tras clic en «Hoy» (tipo pasado) vale `"2026-10-16"`.
  8. `obligatorio` oculta «Borrar»; sin él, «Borrar» deja el valor en `""`.
- [ ] **Step 2:** correr → FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** tests + tsc + eslint.
- [ ] **Step 5: Commit** `fechas-task 3: CampoFecha con atajos, ayuda y fecha escrita` y push.

---

### Task 4: Migrar vencimientos del vehículo y validez de la cotización

**Files:**
- Modify: `src/app/(dashboard)/clientes/[id]/vehiculo-form-fields.tsx` (líneas ~306, 345, 359: `proximoMantenimiento` → tipo `mantenimiento`; `soatVence`, `tecnomecanicaVence` → tipo `vencimiento`)
- Modify: `src/app/(dashboard)/cotizaciones/nueva-cotizacion-form.tsx` (~139: `validaHasta` → tipo `cotizacion`, `min` = hoy)
- Modify: `src/app/(dashboard)/cotizaciones/[id]/registrar-seguimiento-form.tsx` (~156: `proximoSeguimiento` → tipo `seguimiento`, `min` = hoy). El campo `fecha` (datetime-local) NO se toca aquí: es la Task 6.

**Interfaces:** Consume `CampoFecha` (Task 3). Cambia `{...register("x")}` por `<Controller>` como en el ejemplo de la Task 3; si el componente recibe `register` desde el padre y no tiene `control`, agregar `control` a sus props siguiendo cómo llega `register`. Conservar los `<p id="x-error">`.

- [ ] **Step 1:** Leer cada archivo y sus tests (`*.test.tsx` vecinos si existen) para ver qué selectores usan los tests actuales (p. ej. `getByLabelText("SOAT vence")` sobre un input de fecha). Ajustar esos tests al nuevo componente: el label apunta a un botón; para cambiar el valor usar un atajo o escribir en el popover.
- [ ] **Step 2:** Reemplazar los 5 campos.
- [ ] **Step 3:** `npm test -- src/app/(dashboard)/clientes src/app/(dashboard)/cotizaciones` + `npx tsc --noEmit` + eslint de los archivos tocados.
- [ ] **Step 4: Commit** `fechas-task 4: vencimientos del vehículo y cotización usan CampoFecha` y push.

---

### Task 5: Migrar fechas de pago y garantía

**Files:**
- Modify: `src/app/(dashboard)/gastos/gasto-dialog.tsx` (~169, RHF `fecha` → tipo `pasado`, `max` = hoy, `obligatorio`)
- Modify: `src/app/(dashboard)/gastos/recurrentes-pendientes.tsx` (~90, no controlado `name="fecha"` + `defaultValue` → `<CampoFecha name="fecha" defaultValue=… tipo="pasado" obligatorio>`; ojo: hoy el default sale de `pendiente.fechaSugerida.toISOString().slice(0, 10)`, cambiarlo a `formatoDiaBogota.format(pendiente.fechaSugerida)` para no correr el día)
- Modify: `src/app/(dashboard)/liquidaciones/pagar-liquidacion-dialog.tsx` (~140, controlado `fecha`/`setFecha` → tipo `pasado`, `max` = hoy, `obligatorio`)
- Modify: `src/app/(dashboard)/ordenes/[id]/garantias-section.tsx` (~142, controlado `cubreHasta` → tipo `garantia`, `min` = hoy)

- [ ] **Step 1:** Revisar tests existentes de estos archivos y ajustarlos como en la Task 4.
- [ ] **Step 2:** Reemplazar los 4 campos. En diálogos angostos el componente debe ocupar el ancho de su columna (`className="w-full"`).
- [ ] **Step 3:** tests de `src/app/(dashboard)/gastos`, `liquidaciones`, `ordenes` + tsc + eslint.
- [ ] **Step 4: Commit** `fechas-task 5: fechas de pago y garantía usan CampoFecha` y push.

---

### Task 6: `CampoFechaHora` y fecha del seguimiento

**Files:**
- Create: `src/components/campo-fecha-hora.tsx`, `src/components/campo-fecha-hora.test.tsx`
- Modify: `src/app/(dashboard)/cotizaciones/[id]/registrar-seguimiento-form.tsx` (~129, `fecha` datetime-local)

**Interfaces:**
- Consumes: `CalendarioMes`, `formatoHora12`, `valorFechaHora`, `leerValorFechaHora`, `momentoBogota`, `type MomentoBogota` de `agenda-cita.ts`; `formatoDiaLargoConAnio` de `fechas-campo.ts`.
- Produces:
  ```ts
  export interface CampoFechaHoraProps {
    id: string; name?: string;
    value: string;                         // "aaaa-mm-ddTHH:mm" (mismo formato que datetime-local)
    onChange: (valor: string) => void; onBlur?: () => void;
    ahora?: MomentoBogota;                 // por defecto momentoBogota(new Date())
    soloPasado?: boolean;                  // true en seguimiento: no deja elegir después de ahora
    invalid?: boolean; describedBy?: string;
  }
  ```
**Comportamiento:** disparador con ícono `Clock`: «Hoy, viernes 16 de octubre» / «Ayer, …» / «Lunes 12 de octubre», debajo «a las 3:40 p. m.». Atajos «Ahora» (hora actual redondeada hacia abajo a 5 min) y «Hoy en la mañana» (9:00 a. m., oculto antes de las 9). Popover ancho: calendario a la izquierda y columna «Hora» con botones cada 30 min de 6:00 a. m. a 8:00 p. m. (más la hora actual del valor si no está en la lista); con `soloPasado` se deshabilitan días futuros y, si el día es hoy, las horas posteriores a ahora; al cambiar el día a hoy con una hora futura se ajusta a «Ahora». Elegir hora cierra. En pantallas < 520px la columna de horas pasa debajo en filas.
- [ ] **Step 1:** tests: muestra «Hoy, viernes 16 de octubre» + «a las 10:40 a. m.» con `ahora={fecha:"2026-10-16",minutos:640}`; «Ahora» → `onChange("2026-10-16T10:40")`; con `soloPasado` la hora 11:00 a. m. de hoy está deshabilitada; elegir ayer y 3:00 p. m. → `"2026-10-15T15:00"`.
- [ ] **Step 2-4:** FAIL → implementar → reemplazar el campo en el formulario con `<Controller>` (el default actual sale de `paraInputDatetimeLocal(new Date())`, mismo formato; no cambia) → tests + tsc + eslint.
- [ ] **Step 5: Commit** `fechas-task 6: CampoFechaHora en el seguimiento de cotizaciones` y push.

---

### Task 7: `RangoFechas` en Reportes y Exportar

**Files:**
- Create: `src/components/rango-fechas.tsx`, `src/components/rango-fechas.test.tsx`
- Modify: `src/app/(dashboard)/reportes/page.tsx` (~123-131, formulario GET con `desde`/`hasta` `required`)
- Modify: `src/components/exportar-con-rango.tsx` (~71-78)

**Interfaces:**
- Consumes: `CalendarioMes` (con `rango`), `PERIODOS`, `periodoDe`, `textoRango`, `diasEntre` (Task 1).
- Produces:
  ```ts
  export interface RangoFechasProps {
    id: string;
    nameDesde?: string;   // por defecto "desde"
    nameHasta?: string;   // por defecto "hasta"
    defaultDesde: string; defaultHasta: string;
    onChange?: (desde: string, hasta: string) => void;
    hoy?: string;
    max?: string;         // por defecto hoy
  }
  ```
  Emite dos `<input type="hidden">` (`desde`, `hasta`), así el formulario GET de Reportes y el de Exportar no cambian.
**Comportamiento:** disparador con nombre del periodo en negrita («Este mes») y debajo «1 – 16 de octubre · 16 días»; si no coincide con ninguno, «3 – 9 de octubre» y debajo «Personalizado · 7 días». Chips debajo: Hoy, Esta semana, Este mes, Mes pasado. Popover ancho: columna de los 8 periodos a la izquierda y calendario de rango a la derecha con la pista «Toca el primer día y luego el último.» → tras el primer clic «Desde el lunes 5 de octubre. Ahora toca el último día.»; si el segundo día es anterior, se invierten. Elegir periodo o terminar el rango cierra. < 520px: periodos arriba en chips. Como el rango nunca queda al revés, el mensaje de error de «Hasta antes que Desde» de `exportar-con-rango.tsx` puede quedarse (no estorba) pero ya no debería salir.
- [ ] **Step 1:** tests: texto inicial con `defaultDesde="2026-10-01" defaultHasta="2026-10-16" hoy="2026-10-16"` → «Este mes» y «1 – 16 de octubre · 16 días»; chip «Mes pasado» → hidden `desde=2026-09-01`, `hasta=2026-09-30`; rango a mano 9 y luego 5 → `2026-10-05` / `2026-10-09` y «Personalizado · 5 días»; días después de `max` deshabilitados.
- [ ] **Step 2-4:** FAIL → implementar → migrar Reportes (la página es server component: `RangoFechas` es cliente, se usa dentro del `<form>` igual que hoy) y Exportar → tests (incluye `src/components/exportar-con-rango.test.tsx` si existe) + tsc + eslint.
- [ ] **Step 5: Commit** `fechas-task 7: RangoFechas con periodos en Reportes y Exportar` y push.

---

### Task 8: `CampoMes` en Caja, Gastos y plantillas

**Files:**
- Create: `src/components/campo-mes.tsx`, `src/components/campo-mes.test.tsx`
- Modify: `src/app/(dashboard)/caja/filtros-caja.tsx` (~33), `src/app/(dashboard)/gastos/filtros-gastos.tsx` (~28), `src/app/(dashboard)/gastos/configuracion/plantillas-recurrentes-section.tsx` (~143, `desde` opcional: puede ir vacío)

**Interfaces:**
- Consumes: `sumarMeses`, `formatoMesLargo`, `diasDelMes` de `agenda-cita.ts`.
- Produces:
  ```ts
  export interface CampoMesProps {
    id: string; name?: string;
    value?: string; defaultValue?: string;   // "aaaa-mm" o "" si opcional
    onChange?: (mes: string) => void;
    hoy?: string;
    permitirFuturo?: boolean;                // plantillas: true; filtros: false
    opcional?: boolean;                      // muestra «Sin mes» / «Quitar»
  }
  ```
**Comportamiento:** fila `[‹] [disparador] [›]` con flechas de 44px; disparador «Octubre de 2026» y debajo «Del 1 al 16, va corriendo» (mes actual) o «Mes completo · 30 días». Chips «Este mes» y «Mes pasado» (solo en filtros). Popover: año con flechas y rejilla 3×4 de meses abreviados («ene», «feb», …), el actual en naranja, futuros deshabilitados si `!permitirFuturo`. Emite hidden `name` con «aaaa-mm». Los filtros de Caja y Gastos tienen botón «Aplicar»: mantenerlo (no autoenviar).
- [ ] **Step 1:** tests: texto inicial; flecha › deshabilitada en el mes actual sin `permitirFuturo`; clic en ‹ cambia hidden a `2026-09`; elegir «mar» de 2026 en el popover → `2026-03`; `opcional` con valor vacío muestra «Sin mes».
- [ ] **Step 2-4:** FAIL → implementar → migrar los 3 archivos → tests + tsc + eslint.
- [ ] **Step 5: Commit** `fechas-task 8: CampoMes en Caja, Gastos y plantillas` y push.

---

### Task 9: Revisión final, prueba en navegador y merge

- [ ] Confirmar que no quedan campos nativos: `grep -rn 'type="\(date\|month\|datetime-local\)"' src --include=*.tsx` → solo tests o nada.
- [ ] `npm test`, `npx tsc --noEmit`, `npm run lint`.
- [ ] Revisión de código de toda la rama (superpowers:requesting-code-review).
- [ ] Levantar `npm run dev` en segundo plano y revisar en el navegador, en claro y oscuro y a 400px de ancho: vehículo, gasto, liquidación, garantía, cotización nueva, seguimiento, Reportes, Exportar, Caja, Gastos y plantillas.
- [ ] Guardar de verdad un gasto y un vehículo y comprobar que la fecha guardada es la elegida (no se corre un día).
- [ ] Merge `--no-ff` a `main` con el mensaje `merge: campos de fecha nuevos (calendario de citas en toda la app, atajos, ayuda en palabras, rango y mes)` y push. Despliegue: el usuario lo hace aparte.
