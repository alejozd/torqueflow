# Datos de la semana: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npm run datos:semana` llena el taller `taller_dev` con movimiento realista en todos los flujos para un rango de fechas que pregunta al usuario.

**Architecture:** Un plan puro (`plan.ts`) convierte las respuestas y una semilla en una lista de **eventos con fecha y hora** por día y sede (abrir caja, crear orden, entregar orden…). Un ejecutor recorre los días y, dentro de **una transacción por día y sede**, despacha cada evento al módulo de su flujo, que escribe con Prisma **replicando las escrituras de la server action equivalente** (sin guardas de sesión ni `revalidatePath`) y usando las funciones puras de `src/lib`. Al final, `verificacion.ts` cuadra facturas, stock, cajas y cuentas por pagar.

**Tech Stack:** TypeScript, `tsx`, Prisma 6 (cliente de tenant vía `getTenantDb`), Vitest, `node:readline/promises`.

**Spec:** `docs/superpowers/specs/2026-10-22-datos-semana-design.md` — leer completo antes de empezar.

## Global Constraints

- Rama `datos-semana` desde `main`. Commits `datos-semana-task N: …` con push tras cada tarea. Merge `--no-ff` a `main` **solo con aprobación del usuario**.
- `RULES.md` aplica: sin reintentos automáticos; máximo un intento de corrección por error; reportes de 3 a 5 líneas. Al terminar cada tarea, decir "vamos en X de 11" y preguntar antes de seguir. **Responder al usuario siempre en español.**
- Verificación por tarea: `npx tsc --noEmit --incremental false`, `npx vitest run scripts/datos-semana` (y `npm test` completo al final de las tareas 10 y 11), `npx eslint <archivos tocados>`.
- **Solo `taller_dev`** (D2): cualquier otro schema → error antes de leer o escribir. **No ejecutar el script contra la base en ninguna tarea**; la primera corrida real es la tarea 11, con el usuario.
- **Nunca** enviar correos ni WhatsApp; correos inventados con dominio `@ejemplo.test` (D3).
- **No tocar** usuarios, sedes, configuración del taller, ni el cliente "Andrea Valencia Ríos" ni sus vehículos ni las placas `JKT482`, `MRW615`, `HBL290`, `DFN734` (D4). Nunca crear usuarios.
- **Marca `[datos-semana]`** (D5) en el primer campo de texto libre del registro (`notas`, `observaciones`, `descripcion`, `sintomas`…). Si el modelo no tiene texto libre, basta con que su padre esté marcado.
- **Replicar, no reinventar:** cada escritura copia lo que hace la server action indicada en su tarea (campos, stock, auditoría, estados), quitando `requirePermiso`/`requireSession`/`revalidatePath`/envíos. Leer la acción antes de escribir. Usar las funciones de `src/lib` que esa acción usa.
- Fechas: instantes con hora de Bogotá (`-05:00`, sin horario de verano). Columnas `@db.Date` (p. ej. `Gasto.fecha`, `CuentaPorPagar.fecha`, SOAT/tecnomecánica) se guardan como **medianoche UTC del día**: `new Date(\`${fecha}T00:00:00.000Z\`)` (ver `docs/TRASPASO-AGENTES.md` §7).
- Calendario: lunes a sábado 07:30–18:00 Bogotá; domingos sin eventos; nunca fechas futuras.
- Volúmenes (por día y sede): órdenes 3/6/10, citas 2/4/6, cotizaciones 1/3/5, ventas mostrador 2/4/8, gastos 1/2/4 (bajo/medio/alto).

## Estructura de archivos

```
scripts/datos-semana/
  tipos.ts            tipos compartidos (Evento, PlanDia, Respuestas, Contexto, Resumen)
  azar.ts             generador con semilla + datos colombianos inventados        (Task 1)
  fechas.ts           días del rango, horas Bogotá, @db.Date                       (Task 1)
  contexto.ts         guarda de schema, carga de catálogo y datos protegidos       (Task 2)
  plan.ts             respuestas + semilla → PlanDia[] (PURO)                      (Task 3)
  preguntas.ts        preguntas en consola y validación de respuestas              (Task 4)
  ejecutor.ts         recorre días, transacción por día/sede, despacha eventos     (Task 4, crece en 5–10)
  clientes.ts citas.ts cotizaciones.ts ordenes.ts dinero.ts mostrador.ts
  compras.ts gastos.ts liquidaciones.ts                                            (Tasks 5–10)
  verificacion.ts     cuadre final                                                 (Task 10)
  index.ts            orquesta: contexto → preguntas → plan → resumen → ejecutor → verificación
scripts/cli/datos-semana.ts                                                        (Task 4)
package.json: "datos:semana": "tsx scripts/cli/datos-semana.ts"                   (Task 4)
```

Tests `*.test.ts` al lado de cada archivo. Los tests de escritura usan una base simulada con `vi.fn()` al estilo de `scripts/seed-demo-inventario.test.ts`.

## Tipos compartidos (se crean en la Task 1 y no cambian de nombre)

```ts
// scripts/datos-semana/tipos.ts
export type Volumen = "bajo" | "medio" | "alto";

export interface Respuestas {
  desde: string;              // "YYYY-MM-DD"
  hasta: string;              // "YYYY-MM-DD", <= hoy
  sedeIds: string[];          // una o todas
  clientesNuevos: number;     // 0 = usar existentes
  volumen: Volumen;
  liquidar: boolean;
}

/** Clave estable de una orden dentro del plan, para encadenar eventos entre días. */
export type ClaveOrden = string; // p. ej. "o-2026-10-20-s1-3"

export type Evento =
  | { tipo: "abrirCaja"; hora: string }
  | { tipo: "cerrarCaja"; hora: string; diferencia: number }
  | { tipo: "crearCliente"; hora: string }
  | { tipo: "cita"; hora: string; estado: "PROGRAMADA" | "CONFIRMADA" | "COMPLETADA" | "CANCELADA"; ordenClave?: ClaveOrden }
  | { tipo: "cotizacion"; hora: string; destino: "ENVIADA" | "APROBADA" | "RECHAZADA" | "VENCIDA"; ordenClave?: ClaveOrden }
  | { tipo: "crearOrden"; hora: string; clave: ClaveOrden; borrador: boolean; conAnticipo: boolean }
  | { tipo: "terminarOrden"; hora: string; clave: ClaveOrden }
  | { tipo: "entregarOrden"; hora: string; clave: ClaveOrden; pago: "COMPLETO" | "PARCIAL" | "PENDIENTE"; garantia: boolean }
  | { tipo: "anularOrden"; hora: string; clave: ClaveOrden }
  | { tipo: "ventaMostrador"; hora: string; fiada: boolean; devolucion: boolean }
  | { tipo: "gasto"; hora: string; efectivo: boolean }
  | { tipo: "gastosRecurrentes"; hora: string }
  | { tipo: "pedidoCompra"; hora: string; recibir: boolean }
  | { tipo: "abonoProveedor"; hora: string }
  | { tipo: "liquidacion"; hora: string };

export interface PlanDia {
  fecha: string;    // "YYYY-MM-DD"
  sedeId: string;
  eventos: Evento[]; // ordenados por hora "HH:MM"
}
```

`hora` siempre `"HH:MM"` entre `"07:30"` y `"18:00"`.

---

### Task 1: Tipos, azar y fechas

**Files:**
- Create: `scripts/datos-semana/tipos.ts` (contenido exacto de arriba), `scripts/datos-semana/azar.ts`, `scripts/datos-semana/fechas.ts`
- Test: `scripts/datos-semana/azar.test.ts`, `scripts/datos-semana/fechas.test.ts`

**Interfaces:**
- Produces:
  - `crearAzar(semilla: number): Azar` con `azar(): number` (0–1), `entero(min, max)`, `elegir<T>(lista: readonly T[]): T`, `probabilidad(p: number): boolean`.
  - `nombrePersona(az: Azar): { nombres: string; apellidos: string }`, `cedula(az: Azar): string` (8–10 dígitos), `celular(az: Azar): string` (`3XX XXX XXXX`), `correo(nombres: string, apellidos: string, az: Azar): string` (termina en `@ejemplo.test`, sin tildes ni espacios), `placa(az: Azar, ocupadas: ReadonlySet<string>): string` (`/^[A-Z]{3}\d{3}$/`, nunca en `ocupadas`).
  - `diasDelRango(desde: string, hasta: string): string[]` (sin domingos), `instante(fecha: string, hora: string): Date` (Bogotá), `soloDia(fecha: string): Date` (medianoche UTC), `hoyBogota(ahora?: Date): string`, `sumarDias(fecha: string, n: number): string`.

- [ ] **Step 1: Crear `tipos.ts`** con el bloque de "Tipos compartidos".
- [ ] **Step 2: Tests que fallan**

```ts
// scripts/datos-semana/azar.test.ts
import { describe, expect, it } from "vitest";
import { cedula, celular, correo, crearAzar, nombrePersona, placa } from "./azar";

describe("azar", () => {
  it("es repetible con la misma semilla", () => {
    const a = crearAzar(42), b = crearAzar(42);
    expect([a.entero(1, 1000), a.entero(1, 1000), a.azar()]).toEqual([b.entero(1, 1000), b.entero(1, 1000), b.azar()]);
  });
  it("entero respeta los límites", () => {
    const az = crearAzar(1);
    for (let i = 0; i < 500; i++) {
      const n = az.entero(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
  });
  it("datos colombianos con formato válido y correo de prueba", () => {
    const az = crearAzar(9);
    const { nombres, apellidos } = nombrePersona(az);
    expect(nombres.length).toBeGreaterThan(0);
    expect(cedula(az)).toMatch(/^\d{8,10}$/);
    expect(celular(az)).toMatch(/^3\d{2} \d{3} \d{4}$/);
    expect(correo("José Ángel", "Núñez Ríos", az)).toMatch(/^[a-z0-9.]+@ejemplo\.test$/);
  });
  it("placa con formato colombiano y nunca repetida", () => {
    const az = crearAzar(3);
    const ocupadas = new Set(["JKT482", "MRW615"]);
    for (let i = 0; i < 200; i++) {
      const p = placa(az, ocupadas);
      expect(p).toMatch(/^[A-Z]{3}\d{3}$/);
      expect(ocupadas.has(p)).toBe(false);
      ocupadas.add(p);
    }
  });
});
```

```ts
// scripts/datos-semana/fechas.test.ts
import { describe, expect, it } from "vitest";
import { diasDelRango, hoyBogota, instante, soloDia, sumarDias } from "./fechas";

describe("fechas", () => {
  it("diasDelRango excluye domingos e incluye los extremos", () => {
    // 2026-10-19 es lunes; 2026-10-25 es domingo
    expect(diasDelRango("2026-10-19", "2026-10-25")).toEqual([
      "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24",
    ]);
  });
  it("instante usa hora de Bogotá (UTC-5)", () => {
    expect(instante("2026-10-20", "07:30").toISOString()).toBe("2026-10-20T12:30:00.000Z");
  });
  it("soloDia es medianoche UTC", () => {
    expect(soloDia("2026-10-20").toISOString()).toBe("2026-10-20T00:00:00.000Z");
  });
  it("hoyBogota corta a medianoche de Bogotá", () => {
    expect(hoyBogota(new Date("2026-10-21T03:00:00.000Z"))).toBe("2026-10-20");
  });
  it("sumarDias cruza meses", () => {
    expect(sumarDias("2026-10-30", 3)).toBe("2026-11-02");
  });
});
```

- [ ] **Step 3: Correr** `npx vitest run scripts/datos-semana` → FAIL (módulos no existen).
- [ ] **Step 4: Implementar.** `azar.ts`: el generador lineal de `scripts/seed-demo-inventario.ts` (`crearAzar`), más `probabilidad = (p) => azar() < p`; listas de 30+ nombres, 30+ apellidos colombianos; `correo` quita tildes con `normalize("NFD").replace(/\p{Diacritic}/gu, "")`, minúsculas, `nombre.apellido.NN@ejemplo.test`. `fechas.ts`: aritmética sobre `Date.UTC` del `YYYY-MM-DD` (no usar la zona del equipo); `instante` = `new Date(\`${fecha}T${hora}:00-05:00\`)`; domingo = `getUTCDay() === 0` sobre la fecha a medianoche UTC; `hoyBogota` con `Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" })`.
- [ ] **Step 5: Correr** → PASS. `tsc`, `eslint`.
- [ ] **Step 6: Commit** `datos-semana-task 1: tipos, azar con datos colombianos y fechas de Bogotá` y push.

---

### Task 2: Contexto (guarda de schema, catálogo y datos protegidos)

**Files:**
- Create: `scripts/datos-semana/contexto.ts`
- Test: `scripts/datos-semana/contexto.test.ts`

**Interfaces:**
- Consumes: `getTenantDb` de `@/lib/db/tenant-client`; `ROLES_MECANICO` de `@/lib/auth/permisos`.
- Produces:

```ts
export const SCHEMA_PERMITIDO = "taller_dev";
export const MARCA = "[datos-semana]";
export const CLIENTE_PROTEGIDO = "Andrea Valencia Ríos";
export const PLACAS_PROTEGIDAS = ["JKT482", "MRW615", "HBL290", "DFN734"] as const;

export type TenantDb = ReturnType<typeof getTenantDb>;

export interface Contexto {
  schema: string;
  actorId: string;                       // un ADMIN activo (quien "hace" lo administrativo)
  recepcionistaId: string;               // un RECEPCION activo, o el actorId si no hay
  sedes: { id: string; nombre: string }[];
  mecanicos: { id: string; nombre: string; sedeIds: string[] }[];   // ROLES_MECANICO, activos
  repuestos: { id: string; nombre: string; precioCompra: number; precioVenta: number; stockActual: number; stockMinimo: number; bodegaId: string; proveedorId: string | null }[];
  servicios: { id: string; nombre: string }[];
  proveedores: { id: string; nombre: string }[];
  categoriasGasto: { id: string; nombre: string }[];
  clientesExistentes: { id: string; vehiculoIds: string[] }[];       // SIN el cliente protegido ni vehículos con placa protegida
  placasOcupadas: Set<string>;
}

export function exigirSchemaPermitido(schema: string): void;   // lanza Error("Solo se permite taller_dev …")
export async function cargarContexto(db: TenantDb, schema: string): Promise<Contexto>;
```

- [ ] **Step 1: Tests que fallan:** `exigirSchemaPermitido("taller_prod")` lanza; `"taller_dev"` no lanza. `cargarContexto` con base simulada: (a) sin mecánicos lanza `Error` con "mecánico"; (b) excluye de `clientesExistentes` al cliente "Andrea Valencia Ríos" y a cualquier vehículo con placa de `PLACAS_PROTEGIDAS` (y si un cliente queda sin vehículos, igual se incluye con `vehiculoIds: []`); (c) `placasOcupadas` contiene todas las placas de la base, protegidas incluidas; (d) sin ADMIN activo lanza.
- [ ] **Step 2: Correr** → FAIL.
- [ ] **Step 3: Implementar.** Consultas `select` explícitas (nunca `include` de `Usuario` completo: no traer `passwordHash`). Mecánicos: `usuario.findMany({ where: { activo: true, role: { in: [...ROLES_MECANICO] } }, select: { id, nombre, sedes: { select: { sedeId: true } } } })`. Convertir `Decimal` a `number`. Si faltan proveedores, categorías de gasto o repuestos, **no** crearlos aquí: devolver listas vacías (la Task 9 crea lo mínimo).
- [ ] **Step 4: Correr** → PASS; `tsc`, `eslint`.
- [ ] **Step 5: Commit** `datos-semana-task 2: contexto con guarda de taller_dev y datos protegidos` y push.

---

### Task 3: Plan puro

**Files:**
- Create: `scripts/datos-semana/plan.ts`
- Test: `scripts/datos-semana/plan.test.ts`

**Interfaces:**
- Consumes: `Respuestas`, `Evento`, `PlanDia` (tipos.ts); `crearAzar`, `Azar` (azar.ts); `diasDelRango`, `sumarDias` (fechas.ts).
- Produces:

```ts
export const VOLUMENES: Record<Volumen, { ordenes: number; citas: number; cotizaciones: number; ventas: number; gastos: number }> = {
  bajo: { ordenes: 3, citas: 2, cotizaciones: 1, ventas: 2, gastos: 1 },
  medio: { ordenes: 6, citas: 4, cotizaciones: 3, ventas: 4, gastos: 2 },
  alto: { ordenes: 10, citas: 6, cotizaciones: 5, ventas: 8, gastos: 4 },
};
export function armarPlan(respuestas: Respuestas, semilla: number, hoy: string): PlanDia[];
export function contarEventos(plan: PlanDia[]): Record<Evento["tipo"], number>;
```

Reglas de `armarPlan` (todas con test):
1. Un `PlanDia` por cada día de `diasDelRango(desde, hasta)` × cada sede de `sedeIds`; ninguno en domingo ni después de `hoy`.
2. Cada día empieza con `abrirCaja` (≈07:30–08:00) y termina con `cerrarCaja` (≈17:30–18:00), **salvo** que el día sea `hoy`: entonces no hay `cerrarCaja`. `diferencia` de caja: 0 en ~80 % de los días, si no un valor entre −5000 y 5000.
3. Órdenes: `VOLUMENES[v].ordenes` `crearOrden` por día; cada una define su ciclo con días posteriores **dentro del rango**: `terminarOrden` 0–2 días después, `entregarOrden` 0–2 días después de terminar. Si el ciclo no cabe en el rango, se corta (queda en proceso o terminada). ~5 % `anularOrden` (sin terminar ni entregar); ~5 % `borrador: true` (sin ciclo). `conAnticipo` en ~15 %. En `entregarOrden`: `pago` COMPLETO ~70 %, PARCIAL ~15 %, PENDIENTE ~15 %; `garantia` ~20 %. Horas: crear < terminar < entregar cuando caen el mismo día.
4. Citas: `VOLUMENES[v].citas` por día; ~60 % COMPLETADA (con `ordenClave` de una `crearOrden` del mismo día y hora posterior), ~20 % CONFIRMADA, ~10 % PROGRAMADA, ~10 % CANCELADA.
5. Cotizaciones: `VOLUMENES[v].cotizaciones` por día; ~40 % APROBADA (con `ordenClave` de una orden del mismo día, creada después), ~30 % ENVIADA, ~15 % RECHAZADA, ~15 % VENCIDA. Una orden no puede venir de cita y de cotización a la vez.
6. `ventaMostrador`: `VOLUMENES[v].ventas` por día; `fiada` ~20 %; `devolucion` ~10 %.
7. `gasto`: `VOLUMENES[v].gastos` por día; `efectivo` ~60 %. Un `gastosRecurrentes` por sede el primer día del rango.
8. Compras por sede en el rango: un `pedidoCompra` cada 2 días hábiles (empezando el primero); `recibir` ~70 %. Un `abonoProveedor` cada 3 días hábiles.
9. `crearCliente` solo si `clientesNuevos > 0`: repartir ese total entre los días y sedes, antes de las órdenes de la mañana.
10. Si `liquidar`, un único `liquidacion` en el último día del rango (primera sede), después de las entregas y antes de `cerrarCaja`.
11. Eventos de cada día ordenados por `hora`; `abrirCaja` primero y `cerrarCaja` último.
12. Misma `semilla` + mismas respuestas + mismo `hoy` ⇒ plan idéntico (`toEqual`).

- [ ] **Step 1: Tests que fallan** (uno por regla). Ejemplo de los más importantes:

```ts
import { describe, expect, it } from "vitest";
import { armarPlan, contarEventos } from "./plan";
import type { Respuestas } from "./tipos";

const R: Respuestas = { desde: "2026-10-19", hasta: "2026-10-24", sedeIds: ["s1"], clientesNuevos: 0, volumen: "medio", liquidar: true };

describe("armarPlan", () => {
  it("es repetible con la misma semilla", () => {
    expect(armarPlan(R, 7, "2026-10-24")).toEqual(armarPlan(R, 7, "2026-10-24"));
  });
  it("sin domingos ni días futuros", () => {
    const plan = armarPlan({ ...R, hasta: "2026-10-25" }, 7, "2026-10-22");
    expect(plan.map((d) => d.fecha)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22"]);
  });
  it("cada día abre y cierra caja, salvo hoy que queda abierta", () => {
    const plan = armarPlan(R, 7, "2026-10-22");
    for (const dia of plan) {
      expect(dia.eventos[0]!.tipo).toBe("abrirCaja");
      const ultimo = dia.eventos.at(-1)!.tipo;
      if (dia.fecha === "2026-10-22") expect(dia.eventos.some((e) => e.tipo === "cerrarCaja")).toBe(false);
      else expect(ultimo).toBe("cerrarCaja");
    }
  });
  it("una orden nunca se entrega antes de terminarse ni se termina antes de crearse", () => {
    const plan = armarPlan(R, 11, "2026-10-24");
    const momento = new Map<string, Record<string, string>>();
    for (const dia of plan) for (const e of dia.eventos) {
      if ("clave" in e) {
        const m = momento.get(e.clave) ?? {};
        m[e.tipo] = `${dia.fecha} ${e.hora}`;
        momento.set(e.clave, m);
      }
    }
    for (const m of momento.values()) {
      if (m.terminarOrden) expect(m.crearOrden! < m.terminarOrden).toBe(true);
      if (m.entregarOrden) expect(m.terminarOrden! < m.entregarOrden).toBe(true);
    }
  });
  it("respeta el volumen de órdenes por día", () => {
    const plan = armarPlan({ ...R, volumen: "bajo" }, 3, "2026-10-24");
    for (const dia of plan) expect(dia.eventos.filter((e) => e.tipo === "crearOrden")).toHaveLength(3);
  });
  it("horas dentro del horario", () => {
    for (const dia of armarPlan(R, 5, "2026-10-24")) for (const e of dia.eventos) {
      expect(e.hora >= "07:30" && e.hora <= "18:00").toBe(true);
    }
  });
  it("una sola liquidación, el último día", () => {
    const conteo = contarEventos(armarPlan(R, 2, "2026-10-24"));
    expect(conteo.liquidacion).toBe(1);
  });
});
```

Agregar los tests de las reglas 4–9 con el mismo estilo (proporciones verificadas sobre un rango largo, p. ej. 4 semanas en volumen alto, con tolerancia ±10 puntos).

- [ ] **Step 2: Correr** → FAIL.
- [ ] **Step 3: Implementar** `armarPlan` sin tocar la base ni `Date.now()` (recibe `hoy`). Claves de orden `o-${fecha}-${sedeId}-${n}`.
- [ ] **Step 4: Correr** → PASS; `tsc`, `eslint`.
- [ ] **Step 5: Commit** `datos-semana-task 3: plan puro de eventos por día` y push.

---

### Task 4: Preguntas, ejecutor vacío y comando

**Files:**
- Create: `scripts/datos-semana/preguntas.ts`, `scripts/datos-semana/ejecutor.ts`, `scripts/datos-semana/index.ts`, `scripts/cli/datos-semana.ts`
- Modify: `package.json` (script `"datos:semana": "tsx scripts/cli/datos-semana.ts"`)
- Test: `scripts/datos-semana/preguntas.test.ts`, `scripts/datos-semana/ejecutor.test.ts`

**Interfaces:**
- Produces:

```ts
// preguntas.ts
export interface Pregunton { preguntar(texto: string): Promise<string>; cerrar(): void }
export function crearPregunton(): Pregunton;                      // node:readline/promises
export function validarRango(desde: string, hasta: string, hoy: string): string | null; // mensaje de error o null
export async function hacerPreguntas(p: Pregunton, ctx: Pick<Contexto, "sedes">, hoy: string): Promise<Respuestas>;
export async function confirmar(p: Pregunton, resumen: string): Promise<boolean>;

// ejecutor.ts
export type Manejador = (tx: TenantTx, ctx: Contexto, estado: EstadoEjecucion, dia: PlanDia, evento: Evento, az: Azar) => Promise<void>;
export interface EstadoEjecucion {
  ordenes: Map<ClaveOrden, string>;   // clave del plan → id real
  cajaAbierta: Map<string, string>;   // sedeId → id de CajaSesion abierta
  creados: Record<string, number>;    // para el resumen final
}
export type TenantTx = Parameters<Parameters<TenantDb["$transaction"]>[0]>[0];
export const MANEJADORES: Partial<Record<Evento["tipo"], Manejador>>;  // vacío en esta tarea
export async function ejecutarPlan(db: TenantDb, ctx: Contexto, plan: PlanDia[], semilla: number,
  aviso: (texto: string) => void): Promise<EstadoEjecucion>;
```

Reglas:
- `hacerPreguntas`: desde (por defecto lunes de la semana de `hoy`), hasta (por defecto `hoy`), sede (lista numerada + "Todas"), clientes nuevos (número, 0 = usar existentes; por defecto 0), volumen (bajo/medio/alto; por defecto medio), liquidar (s/n; por defecto n). Respuesta inválida ⇒ vuelve a preguntar con el mensaje de `validarRango` o "Opción no válida".
- `validarRango`: formato `YYYY-MM-DD`; `hasta <= hoy` ("No se permiten fechas futuras"); `desde <= hasta`.
- `ejecutarPlan`: por cada `PlanDia`, `db.$transaction(async (tx) => { for (evento) await MANEJADORES[evento.tipo]?.(...) })`; un evento sin manejador se cuenta en `creados["omitido:" + tipo]` (se irán llenando en las tareas 5–10). Si una transacción lanza, re-lanza `Error(\`Falló el ${fecha} (sede ${nombre}) en "${tipo}": ${mensaje}\`)` y no sigue con los días siguientes.
- `index.ts` `main(argv)`: `--semilla N` opcional (si no, aleatoria 1–999999); schema `SCHEMA_PERMITIDO` (no se recibe por argumento); `exigirSchemaPermitido` → `cargarContexto` → `hacerPreguntas` → `armarPlan` → resumen con `contarEventos` → `confirmar` → `ejecutarPlan` → (Task 10) verificación → imprime creados y semilla.
- `scripts/cli/datos-semana.ts`: `import "dotenv/config"`, llama `main(process.argv.slice(2))`, `process.exit(0|1)` como los otros CLI.

- [ ] **Step 1: Tests que fallan:** `validarRango` (futuro, invertido, formato); `hacerPreguntas` con un `Pregunton` falso que responde una lista fija (`["", "", "2", "0", "bajo", "n"]` ⇒ defaults + sede 2), y que repite ante una respuesta inválida; `ejecutarPlan` con base simulada: abre una transacción por `PlanDia`, despacha a un manejador de prueba inyectado en `MANEJADORES`, y si el manejador lanza el día 2, el error dice la fecha y el tipo y no se ejecuta el día 3.
- [ ] **Step 2: Correr** → FAIL.
- [ ] **Step 3: Implementar.** **No correr el comando contra la base.**
- [ ] **Step 4: Correr** → PASS; `tsc`, `eslint`.
- [ ] **Step 5: Commit** `datos-semana-task 4: preguntas, ejecutor por día y comando npm` y push.

---

### Task 5: Caja, clientes y citas

**Files:**
- Create: `scripts/datos-semana/dinero.ts` (solo caja en esta tarea), `scripts/datos-semana/clientes.ts`, `scripts/datos-semana/citas.ts`
- Modify: `scripts/datos-semana/ejecutor.ts` (registrar manejadores `abrirCaja`, `cerrarCaja`, `crearCliente`, `cita`)
- Test: `dinero.test.ts`, `clientes.test.ts`, `citas.test.ts`

**Replicar:** `abrirCajaAction` / `cerrarCajaAction` (`src/app/actions/caja-actions.ts`; arqueo con `calcularResumenCaja` de `src/lib/caja/resumen.ts`: `efectivoEsperado` = lo que calcula esa función con los movimientos en efectivo del día; `efectivoContado` = esperado + `diferencia` del evento), `createClienteAction` (`cliente-actions.ts`), `createVehiculoAction` (`vehiculo-actions.ts`), `createCitaAction` + `cambiarEstadoCitaAction` (`cita-actions.ts`).

**Interfaces:**
- Produces: `abrirCaja`, `cerrarCaja`, `crearCliente`, `registrarCita` (todas `Manejador`); y para las tareas siguientes `elegirClienteYVehiculo(tx, ctx, estado, az): Promise<{ clienteId: string; vehiculoId: string }>` en `clientes.ts` (si `clientesNuevos > 0` y quedan clientes creados por el script sin usar hoy, usa uno de esos; si no, uno de `ctx.clientesExistentes` con vehículo; si no hay ninguno, crea uno nuevo). Guarda los creados en `estado.creados` y en una lista `estado.clientesCreados` (agregar ese campo a `EstadoEjecucion`).

Reglas: cliente con `nombrePersona`, `cedula`, `celular`, `correo` de `azar.ts`, marca en notas; 1–2 vehículos con `placa(az, ctx.placasOcupadas)` (agregarla al set), marca/modelo del catálogo existente, y en ~25 % SOAT o tecnomecánica que vence en 5–40 días después de la fecha del evento (`soloDia`). Cita `COMPLETADA` con `ordenClave` ⇒ guardar en `estado` el par `ordenClave → citaId` para que la Task 6 la enlace al crear la orden (agregar `citasPorOrden: Map<ClaveOrden, string>` a `EstadoEjecucion`). Las citas `PROGRAMADA`/`CONFIRMADA` se agendan 1–5 días después de la fecha del evento.

- [ ] **Step 1: Tests que fallan** (base simulada): abrir caja crea `CajaSesion` con `sedeId`, `baseInicial` > 0, `abiertaAt` = `instante(fecha, hora)` y la registra en `estado.cajaAbierta`; cerrar caja calcula el esperado con `calcularResumenCaja` (mock de movimientos) y guarda contado = esperado + diferencia; crear cliente nunca usa placas de `placasOcupadas` y marca `[datos-semana]`; cita cancelada queda `CANCELADA`; `elegirClienteYVehiculo` nunca devuelve el cliente protegido.
- [ ] **Step 2: Correr** → FAIL. **Step 3: Implementar.** **Step 4: Correr** → PASS; `tsc`, `eslint`.
- [ ] **Step 5: Commit** `datos-semana-task 5: caja, clientes y citas` y push.

---

### Task 6: Órdenes (crear, trabajar, terminar, anular)

**Files:**
- Create: `scripts/datos-semana/ordenes.ts`
- Modify: `ejecutor.ts` (manejadores `crearOrden`, `terminarOrden`, `anularOrden`)
- Test: `ordenes.test.ts`

**Replicar:** `createOrdenDesdeVehiculoAction` / `createOrdenAction` (`orden-actions.ts`), `guardarRecepcionAction` + `agregarDanioAction` (`recepcion-actions.ts`), `updateDviChecklistAction` (`dvi-actions.ts`; sin fotos reales: no subir archivos), `addItemOrdenAction` (`item-orden-actions.ts`: descuenta `stockActual` con guarda `stockActual >= cantidad`), `addManoDeObraAction` (`mano-de-obra-actions.ts`), `updateEstadoOrdenAction` (`orden-actions.ts`) para EN_PROCESO → TERMINADA y → ANULADA (la anulación devuelve stock como lo haga la acción).

**Interfaces:**
- Consumes: `elegirClienteYVehiculo`, `estado.citasPorOrden`.
- Produces: `crearOrden`, `terminarOrden`, `anularOrden` (`Manejador`); `estado.ordenes.set(clave, id)`.

Reglas: mecánico de la orden = uno de `ctx.mecanicos` de esa sede (si ninguno tiene la sede, cualquiera); 1–3 repuestos con stock suficiente (si ninguno tiene stock, sin repuestos); 1–3 líneas de mano de obra repartidas entre mecánicos de la sede (incluido el Jefe de taller si existe); recepción con kilometraje creciente para el vehículo y 0–2 daños; checklist DVI marcado. `borrador: true` ⇒ la orden queda en BORRADOR sin ítems. Si la orden viene de una cita completada, enlazarla como lo haga la app (ver si `Cita` tiene `ordenId`; si no, solo marcar la cita completada). Orden con `conAnticipo`: dejar el anticipo para la Task 7 (registrar en `estado.anticiposPendientes: ClaveOrden[]`).

- [ ] **Step 1: Tests que fallan:** crear orden descuenta stock de cada repuesto usado y nunca deja stock negativo; usa un mecánico de la sede; marca `[datos-semana]` en los síntomas/observaciones; `terminarOrden` de una clave desconocida lanza con mensaje claro; `anularOrden` deja la orden ANULADA y repone el stock como la acción.
- [ ] **Step 2–4:** FAIL → implementar → PASS; `tsc`, `eslint`.
- [ ] **Step 5: Commit** `datos-semana-task 6: órdenes con recepción, DVI, repuestos y mano de obra` y push.

---

### Task 7: Entrega, facturas, pagos, anticipos y garantías

**Files:**
- Modify: `scripts/datos-semana/dinero.ts` (facturas, pagos, anticipos), `scripts/datos-semana/ordenes.ts` (entrega con acta y garantía), `ejecutor.ts` (manejador `entregarOrden`)
- Test: `dinero.test.ts`, `ordenes.test.ts`

**Replicar:** `guardarActaAction` + `firmarActaAction` + `entregarOrdenAction` (`recepcion-actions.ts`), `agregarGarantiaAction` (`recepcion-actions.ts`), `crearFacturaAction` (`factura-actions.ts`, totales con `computeFacturaTotales` de `src/lib/factura/totales.ts`), `registrarPagoAction` (`pago-actions.ts`: el efectivo exige caja abierta de la sede — usar `estado.cajaAbierta`; si no hay caja abierta, pagar con tarjeta o transferencia), `registrarAnticipoAction` (`anticipo-actions.ts`; se registra al crear la orden: procesar `estado.anticiposPendientes` en el `crearOrden` correspondiente o justo después).

Reglas del evento `entregarOrden`: acta firmada (firma de ejemplo como la que acepte la acción, sin archivos externos), orden ENTREGADA, factura creada; `pago` COMPLETO ⇒ pagos hasta saldo 0 (a veces dos pagos con métodos distintos), PARCIAL ⇒ 30–70 % del total, PENDIENTE ⇒ sin pagos; el estado de la factura (PENDIENTE/PAGADA) como lo derive la acción. Si la orden tenía anticipo, aplicarlo como lo haga la app al pagar (método ANTICIPO). `garantia` ⇒ una garantía sobre la mano de obra o un repuesto.

- [ ] **Step 1: Tests que fallan:** factura con totales de `computeFacturaTotales`; pago completo deja saldo 0 y factura PAGADA; parcial deja saldo > 0 y PENDIENTE; sin caja abierta nunca registra efectivo; entregar una orden no TERMINADA lanza.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `datos-semana-task 7: entrega con acta, factura, pagos, anticipos y garantías` y push.

---

### Task 8: Cotizaciones

**Files:**
- Create: `scripts/datos-semana/cotizaciones.ts`
- Modify: `ejecutor.ts` (manejador `cotizacion`)
- Test: `cotizaciones.test.ts`

**Replicar:** `crearCotizacionAction`, `enviarCotizacionAction`, `aprobarCotizacionAction` (crea la orden: en ese caso **no** se crea otra en el `crearOrden` de esa clave — registrar en `estado.ordenes` la orden creada por la aprobación y hacer que `crearOrden` la complete con recepción, DVI y mano de obra en vez de crear una nueva), `rechazarCotizacionAction` (`cotizacion-actions.ts`), el seguimiento como `registrarSeguimiento` (buscarlo en `cotizacion-actions.ts`), y los totales con `computeCotizacionTotales` / `recomputeCotizacionTotales`. VENCIDA: crear con fecha de vigencia ya pasada respecto al evento, como la app la marque vencida al consultarla.

- [ ] **Step 1: Tests que fallan:** cada destino deja el estado correcto; APROBADA enlaza la orden y el `crearOrden` posterior no duplica la orden; ENVIADA tiene al menos un seguimiento; totales con la función de `src/lib`.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `datos-semana-task 8: cotizaciones en todos sus estados` y push.

---

### Task 9: Mostrador, gastos y compras

**Files:**
- Create: `scripts/datos-semana/mostrador.ts`, `scripts/datos-semana/gastos.ts`, `scripts/datos-semana/compras.ts`
- Modify: `ejecutor.ts` (manejadores `ventaMostrador`, `gasto`, `gastosRecurrentes`, `pedidoCompra`, `abonoProveedor`)
- Test: `mostrador.test.ts`, `gastos.test.ts`, `compras.test.ts`

**Replicar:** `crearVentaMostradorAction` (`venta-mostrador-actions.ts`, totales con `calcularTotalesVenta`; contado exige caja abierta; fiada exige cliente), `crearDevolucionAction` (`devolucion-mostrador-actions.ts`, `totalDevolucion`), `crearGastoAction` (`gasto-actions.ts`; en efectivo exige caja abierta, si no hay caja abierta el gasto va por transferencia), recurrentes con `calcularRecurrentesPendientes` + `confirmarRecurrenteAction` (`gasto-recurrente-actions.ts`), `crearPedidosCompraAction` + `recibirPedidoCompraAction` (`pedido-compra-actions.ts`: la recepción crea la entrada de mercancía, sube stock y crea la `CuentaPorPagar`), `abonarCuentaPorPagarAction` (`cuenta-por-pagar-actions.ts`).

Mínimos si faltan (marcados): 2 proveedores (`Autopartes Andina`, `Distribuidora Gates`), 1 categoría de gasto por cada tipo usado (`Papelería`, `Aseo`, `Alimentación`, `Arriendo`, `Servicios públicos`), y si no hay repuestos, 6 básicos (aceite, filtros, pastillas, bujías) con stock inicial. Al final del rango, al menos 2 repuestos deben quedar bajo `stockMinimo` (si no los hay, en el último `pedidoCompra` no reponer dos de los más vendidos).

- [ ] **Step 1: Tests que fallan:** la venta nunca vende más que el stock y descuenta stock; la devolución repone stock y nunca excede lo vendido; contado sin caja abierta no se registra como efectivo; recibir un pedido sube el stock y crea la cuenta por pagar con el total de la entrada; el abono nunca supera el saldo; gastos de fecha `@db.Date` con `soloDia`.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `datos-semana-task 9: mostrador, gastos y compras` y push.

---

### Task 10: Liquidaciones y verificación de cuadre

**Files:**
- Create: `scripts/datos-semana/liquidaciones.ts`, `scripts/datos-semana/verificacion.ts`
- Modify: `ejecutor.ts` (manejador `liquidacion`), `index.ts` (llamar a la verificación y mostrar el resultado)
- Test: `liquidaciones.test.ts`, `verificacion.test.ts`

**Replicar:** `pagarLiquidacionAction` (`liquidacion-actions.ts`, monto con `calcularMontoLiquidacion` / `totalLiquidacion` de `src/lib/liquidaciones/calculo.ts`; solo mecánicos con esquema configurado; si nadie tiene esquema, avisar y omitir).

**Interfaces:**

```ts
export interface Descuadre { tipo: "factura" | "stock" | "caja" | "cuentaPorPagar"; id: string; detalle: string }
export function verificarFacturas(facturas: { id: string; total: number; pagado: number; estado: string }[]): Descuadre[];
export function verificarStock(movs: { repuestoId: string; inicial: number; entradas: number; usado: number; vendido: number; devuelto: number; final: number }[]): Descuadre[];
export function verificarCajas(cajas: { id: string; esperado: number; calculado: number }[]): Descuadre[];
export function verificarCuentas(cuentas: { id: string; total: number; abonos: number; saldo: number }[]): Descuadre[];
export async function verificarTodo(db: TenantDb, ctx: Contexto, estado: EstadoEjecucion, stockInicial: Map<string, number>): Promise<Descuadre[]>;
```

`index.ts` guarda `stockInicial` (de `ctx.repuestos`) antes de ejecutar; al final imprime "Todo cuadra ✓" o la lista de descuadres. Un descuadre no borra nada (sale código 0 pero con el aviso visible).

- [ ] **Step 1: Tests que fallan:** cada `verificar*` detecta un caso armado a propósito y no reporta nada en uno correcto (`pagada` con saldo > 0; stock final distinto de la fórmula o negativo; caja con esperado distinto de lo calculado; cuenta con saldo ≠ total − abonos).
- [ ] **Step 2–4:** FAIL → implementar → PASS; además `npm test` completo.
- [ ] **Step 5: Commit** `datos-semana-task 10: liquidaciones y verificación de cuadre` y push.

---

### Task 11: Primera corrida con el usuario, revisión y cierre

- [ ] **Step 1:** `npx tsc --noEmit --incremental false`, `npm test`, `npx eslint scripts/datos-semana scripts/cli/datos-semana.ts`, `npm run build`.
- [ ] **Step 2: Revisión independiente** del diff `main...datos-semana` (otro modelo, solo lectura): foco en que cada flujo replique su server action (stock, caja, saldos), en D2–D4 (taller_dev, sin envíos, datos protegidos) y en la transacción por día. Ronda de arreglos con test por hallazgo, commits `datos-semana-fix: …`.
- [ ] **Step 3: Primera corrida real, con el usuario presente** (Tailscale encendido): `npm run datos:semana` con **un solo día (hoy), una sede, 2 clientes nuevos, volumen bajo, sin liquidación**. Revisar juntos el resumen, el cuadre y el Inicio/caja/órdenes/facturas en `http://localhost:3025` (lanzar `npm run dev` en segundo plano).
- [ ] **Step 4:** Si todo está bien, el usuario decide si correr una semana completa.
- [ ] **Step 5:** Documentar el comando en `docs/TRASPASO-AGENTES.md` §6 (qué hace, D2–D5, la semilla) y merge `--no-ff` a `main` **solo con aprobación del usuario**; push.
