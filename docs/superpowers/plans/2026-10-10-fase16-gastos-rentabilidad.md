# Fase 16 — Gastos operativos y rentabilidad real Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar gastos operativos por sede (categorías editables, plantillas recurrentes mensuales que se confirman) y mostrar utilidad neta, margen neto y punto de equilibrio en el reporte de Rentabilidad.

**Architecture:** Cuatro tablas tenant nuevas (`CategoriaGasto` sembrada en la migración, `Gasto`, `GastoRecurrente`, `GastoRecurrenteOmitido`). Lógica pura en `src/lib/gastos/` (periodos, pendientes, rentabilidad neta). Server actions en `gasto-actions.ts`, `gasto-recurrente-actions.ts`, `categoria-gasto-actions.ts`. UI: `/gastos` (operación) y `/gastos/configuracion` (ADMIN), más KPIs nuevos en `/reportes`.

**Tech Stack:** Next.js 16 App Router (server actions), Prisma 6.19.3 (schema por tenant), Zod 4, React 19, react-hook-form, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-10-fase16-gastos-rentabilidad-design.md`

## Global Constraints

- Rama `fase16-gastos-rentabilidad`. Commit por tarea `fase16-task N: descripción` + trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; push a la rama tras cada tarea. Cierre: revisión de rama → merge `--no-ff` a `main`.
- Cada gasto pertenece a una sede. RECEPCION registra **siempre en su sede activa**; ADMIN puede elegir cualquier sede del taller.
- Roles: `/gastos` y crear gasto → ADMIN, RECEPCION. Editar/eliminar gasto, confirmar/omitir recurrente, plantillas y categorías → solo ADMIN. Rentabilidad → solo ADMIN. TECNICO no ve "Gastos" en el menú.
- Categorías: no se borran, se desactivan; nombre trim 1–60, único ("Ya existe una categoría con ese nombre"). Las 11 por defecto se siembran **en la migración**: Arriendo, Servicios públicos, Nómina, Seguridad social, Herramientas y equipos, Insumos, Mantenimiento del local, Impuestos, Publicidad, Transporte, Otros.
- Montos: Decimal(12,2), > 0 y ≤ 9.999.999.999,99, COP con IVA incluido. Descripción trim 1–200; referencia ≤ 60.
- `periodo` = `"YYYY-MM"`; `diaDelMes` 1–28. El periodo actual se calcula en **America/Bogota**.
- Columnas `@db.Date` llegan como medianoche UTC: comparar/formatear como fecha calendario (`toISOString().slice(0, 10)`, `timeZone: "UTC"`), nunca con hora de Bogotá.
- Los `Decimal` de Prisma **no** se pasan a componentes cliente: convertir a `number` en las actions.
- Eliminar con `ConfirmacionEnLinea` (patrón existente). Errores Prisma con `friendlyPrismaErrorMessage`.
- `tsc --noEmit` y `npm test` al final de cada tarea; no reintentos automáticos (RULES §1).

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `prisma/tenant/schema.prisma` + `migrations/20261011120000_gastos/migration.sql` | modelos + siembra de categorías |
| `src/lib/validation/gasto.ts` | esquemas Zod de gasto, plantilla, categoría, confirmación |
| `src/lib/gastos/periodo.ts` | helpers de periodo `YYYY-MM` |
| `src/lib/gastos/recurrentes-pendientes.ts` | cálculo de pendientes por plantilla |
| `src/lib/gastos/rentabilidad-neta.ts` | utilidad neta, margen neto, punto de equilibrio |
| `src/lib/reportes/rentabilidad.ts` | + `baseFacturada` en `RentabilidadTotales` |
| `src/app/actions/categoria-gasto-actions.ts` | CRUD de categorías |
| `src/app/actions/gasto-actions.ts` | listar/crear/editar/eliminar gastos + KPIs del mes |
| `src/app/actions/gasto-recurrente-actions.ts` | plantillas, pendientes, confirmar, omitir |
| `src/app/(dashboard)/gastos/*` | página, tabla, diálogos, pendientes, loading |
| `src/app/(dashboard)/gastos/configuracion/*` | plantillas y categorías (ADMIN) |
| `src/app/(dashboard)/dashboard-sidebar.tsx`, `layout.tsx` | ítem de menú por rol |
| `src/app/actions/reporte-actions.ts`, `src/app/(dashboard)/reportes/*` | rentabilidad neta |

---

### Task 1: Esquema, migración con siembra y validación

**Files:**
- Modify: `prisma/tenant/schema.prisma` (modelos nuevos; relaciones inversas en `Sede` y `Usuario`)
- Create: `prisma/tenant/migrations/20261011120000_gastos/migration.sql`
- Modify: `src/lib/validation/reporte.ts` (exportar `fechaSchema`)
- Create: `src/lib/validation/gasto.ts`, `src/lib/validation/gasto.test.ts`

**Interfaces:**
- Produces: `tenantDb.categoriaGasto`, `tenantDb.gasto`, `tenantDb.gastoRecurrente`, `tenantDb.gastoRecurrenteOmitido`; claves compuestas `gastoRecurrenteId_periodo` (en `Gasto` y en `GastoRecurrenteOmitido`); esquemas `gastoInputSchema`, `gastoRecurrenteInputSchema`, `categoriaGastoInputSchema`, `confirmarRecurrenteInputSchema`, `periodoSchema`, constantes `MONTO_MAXIMO = 9_999_999_999.99`; `fechaSchema` exportado desde `@/lib/validation/reporte`.

- [ ] **Step 1: Schema Prisma**

Al final de `prisma/tenant/schema.prisma`:

```prisma
/// Categoría de gasto editable por el taller. No se borra: se desactiva
/// (deja de ofrecerse al registrar; los gastos viejos la conservan).
model CategoriaGasto {
  id                String            @id @default(cuid())
  nombre            String            @unique
  activo            Boolean           @default(true)
  orden             Int
  createdAt         DateTime          @default(now()) @map("created_at")
  gastos            Gasto[]
  gastosRecurrentes GastoRecurrente[]

  @@map("categorias_gasto")
}

/// Gasto operativo de una sede. `periodo` ("YYYY-MM") y `gastoRecurrenteId`
/// solo existen cuando nació de confirmar una plantilla recurrente.
model Gasto {
  id                String           @id @default(cuid())
  sedeId            String           @map("sede_id")
  sede              Sede             @relation(fields: [sedeId], references: [id], onDelete: Restrict)
  categoriaId       String           @map("categoria_id")
  categoria         CategoriaGasto   @relation(fields: [categoriaId], references: [id], onDelete: Restrict)
  descripcion       String
  monto             Decimal          @db.Decimal(12, 2)
  fecha             DateTime         @db.Date
  referencia        String?
  gastoRecurrenteId String?          @map("gasto_recurrente_id")
  gastoRecurrente   GastoRecurrente? @relation(fields: [gastoRecurrenteId], references: [id], onDelete: SetNull)
  periodo           String?
  registradoPorId   String           @map("registrado_por_id")
  registradoPor     Usuario          @relation("GastosRegistrados", fields: [registradoPorId], references: [id], onDelete: Restrict)
  createdAt         DateTime         @default(now()) @map("created_at")
  updatedAt         DateTime         @updatedAt @map("updated_at")

  @@unique([gastoRecurrenteId, periodo])
  @@index([sedeId, fecha])
  @@index([categoriaId])
  @@map("gastos")
}

/// Plantilla de gasto mensual. No genera nada sola: cada mes aparece como
/// pendiente en /gastos hasta que el ADMIN lo confirma u omite.
model GastoRecurrente {
  id            String                   @id @default(cuid())
  sedeId        String                   @map("sede_id")
  sede          Sede                     @relation(fields: [sedeId], references: [id], onDelete: Restrict)
  categoriaId   String                   @map("categoria_id")
  categoria     CategoriaGasto           @relation(fields: [categoriaId], references: [id], onDelete: Restrict)
  descripcion   String
  montoEstimado Decimal                  @map("monto_estimado") @db.Decimal(12, 2)
  diaDelMes     Int                      @map("dia_del_mes")
  desde         String
  activo        Boolean                  @default(true)
  createdAt     DateTime                 @default(now()) @map("created_at")
  updatedAt     DateTime                 @updatedAt @map("updated_at")
  gastos        Gasto[]
  omitidos      GastoRecurrenteOmitido[]

  @@map("gastos_recurrentes")
}

model GastoRecurrenteOmitido {
  id                String          @id @default(cuid())
  gastoRecurrenteId String          @map("gasto_recurrente_id")
  gastoRecurrente   GastoRecurrente @relation(fields: [gastoRecurrenteId], references: [id], onDelete: Cascade)
  periodo           String
  omitidoPorId      String          @map("omitido_por_id")
  omitidoPor        Usuario         @relation("GastosRecurrentesOmitidos", fields: [omitidoPorId], references: [id], onDelete: Restrict)
  createdAt         DateTime        @default(now()) @map("created_at")

  @@unique([gastoRecurrenteId, periodo])
  @@map("gastos_recurrentes_omitidos")
}
```

En `model Sede`: `gastos Gasto[]` y `gastosRecurrentes GastoRecurrente[]`.
En `model Usuario`: `gastosRegistrados Gasto[] @relation("GastosRegistrados")` y `gastosRecurrentesOmitidos GastoRecurrenteOmitido[] @relation("GastosRecurrentesOmitidos")`.

- [ ] **Step 2: Migración**

Generar el SQL estructural **con Prisma, sin base de datos**:

```bash
git show main:prisma/tenant/schema.prisma > "$TEMP/schema-antes.prisma"
npx prisma migrate diff --from-schema-datamodel "$TEMP/schema-antes.prisma" --to-schema-datamodel prisma/tenant/schema.prisma --script > prisma/tenant/migrations/20261011120000_gastos/migration.sql
```

(crear la carpeta antes). Revisar que solo contenga las 4 tablas, sus índices y FKs. Luego **agregar al final** la siembra:

```sql
-- Seed: categorías de gasto por defecto (el aprovisionamiento de tenants corre
-- migrate deploy, así que esto cubre talleres existentes y nuevos).
INSERT INTO "categorias_gasto" ("id", "nombre", "orden") VALUES
  ('cat_arriendo', 'Arriendo', 0),
  ('cat_servicios_publicos', 'Servicios públicos', 1),
  ('cat_nomina', 'Nómina', 2),
  ('cat_seguridad_social', 'Seguridad social', 3),
  ('cat_herramientas_equipos', 'Herramientas y equipos', 4),
  ('cat_insumos', 'Insumos', 5),
  ('cat_mantenimiento_local', 'Mantenimiento del local', 6),
  ('cat_impuestos', 'Impuestos', 7),
  ('cat_publicidad', 'Publicidad', 8),
  ('cat_transporte', 'Transporte', 9),
  ('cat_otros', 'Otros', 10);
```

Run: `npx prisma validate --schema=prisma/tenant/schema.prisma && npx prisma generate --schema=prisma/tenant/schema.prisma` → válido y generado. **No** aplicar la migración a ninguna base (la única configurada es la compartida con producción; se aplica al cierre con aprobación del usuario).

- [ ] **Step 3: Tests de validación (fallan)**

`src/lib/validation/gasto.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  categoriaGastoInputSchema,
  confirmarRecurrenteInputSchema,
  gastoInputSchema,
  gastoRecurrenteInputSchema,
  periodoSchema,
} from "./gasto";

const gastoBase = { categoriaId: "cat_arriendo", descripcion: "Arriendo local", monto: "1500000", fecha: "2026-10-05" };

describe("gastoInputSchema", () => {
  it("acepta un gasto válido, recorta textos y convierte el monto", () => {
    const r = gastoInputSchema.parse({ ...gastoBase, descripcion: "  Arriendo local ", referencia: " F-123 " });
    expect(r).toMatchObject({ descripcion: "Arriendo local", monto: 1500000, fecha: "2026-10-05", referencia: "F-123" });
  });

  it.each([
    [{ categoriaId: "" }, "Selecciona una categoría"],
    [{ descripcion: "   " }, "La descripción es obligatoria"],
    [{ monto: "0" }, "El monto debe ser mayor que cero"],
    [{ monto: "10000000000" }, "El monto es demasiado alto"],
    [{ fecha: "2026-02-31" }, "La fecha no existe en el calendario"],
  ])("rechaza %o", (cambio, mensaje) => {
    const r = gastoInputSchema.safeParse({ ...gastoBase, ...cambio });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe(mensaje);
  });

  it("referencia vacía queda undefined", () => {
    expect(gastoInputSchema.parse({ ...gastoBase, referencia: "  " }).referencia).toBeUndefined();
  });
});

describe("gastoRecurrenteInputSchema", () => {
  const base = { categoriaId: "cat_arriendo", descripcion: "Arriendo", montoEstimado: "1500000", diaDelMes: "5", desde: "2026-10" };

  it("acepta una plantilla válida", () => {
    expect(gastoRecurrenteInputSchema.parse(base)).toMatchObject({ montoEstimado: 1500000, diaDelMes: 5, desde: "2026-10" });
  });

  it.each([["0"], ["29"], ["abc"]])("rechaza diaDelMes %s", (diaDelMes) => {
    const r = gastoRecurrenteInputSchema.safeParse({ ...base, diaDelMes });
    expect(r.error?.issues[0]?.message).toBe("El día debe estar entre 1 y 28");
  });
});

describe("periodoSchema", () => {
  it("acepta YYYY-MM y rechaza meses inválidos", () => {
    expect(periodoSchema.safeParse("2026-12").success).toBe(true);
    expect(periodoSchema.safeParse("2026-13").success).toBe(false);
    expect(periodoSchema.safeParse("2026-1").success).toBe(false);
  });
});

describe("categoriaGastoInputSchema", () => {
  it("recorta y exige nombre", () => {
    expect(categoriaGastoInputSchema.parse({ nombre: "  Repuestos menores " }).nombre).toBe("Repuestos menores");
    expect(categoriaGastoInputSchema.safeParse({ nombre: "  " }).error?.issues[0]?.message).toBe("El nombre es obligatorio");
    expect(categoriaGastoInputSchema.safeParse({ nombre: "x".repeat(61) }).success).toBe(false);
  });
});

describe("confirmarRecurrenteInputSchema", () => {
  it("valida monto y fecha", () => {
    expect(confirmarRecurrenteInputSchema.parse({ monto: "98000", fecha: "2026-10-05" })).toEqual({ monto: 98000, fecha: "2026-10-05" });
  });
});
```

Run: `npx vitest run --project unit src/lib/validation/gasto.test.ts` → FAIL.

- [ ] **Step 4: Implementar**

En `src/lib/validation/reporte.ts` cambiar `const fechaSchema` por `export const fechaSchema` (sin tocar su cuerpo).

`src/lib/validation/gasto.ts`:

```ts
import { z } from "zod";
import { fechaSchema } from "./reporte";

export const MONTO_MAXIMO = 9_999_999_999.99;

const montoSchema = z.coerce
  .number({ error: "El monto debe ser un número" })
  .positive("El monto debe ser mayor que cero")
  .max(MONTO_MAXIMO, "El monto es demasiado alto");

const categoriaIdSchema = z.string().trim().min(1, "Selecciona una categoría");

const descripcionSchema = z
  .string()
  .trim()
  .min(1, "La descripción es obligatoria")
  .max(200, "La descripción admite máximo 200 caracteres");

export const periodoSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "El periodo debe tener el formato AAAA-MM");

export const gastoInputSchema = z.object({
  categoriaId: categoriaIdSchema,
  descripcion: descripcionSchema,
  monto: montoSchema,
  fecha: fechaSchema,
  referencia: z
    .string()
    .trim()
    .max(60, "La referencia admite máximo 60 caracteres")
    .optional()
    .transform((valor) => (valor ? valor : undefined)),
  sedeId: z.string().trim().optional(),
});

export const gastoRecurrenteInputSchema = z.object({
  categoriaId: categoriaIdSchema,
  descripcion: descripcionSchema,
  montoEstimado: montoSchema,
  diaDelMes: z.coerce
    .number({ error: "El día debe estar entre 1 y 28" })
    .int("El día debe estar entre 1 y 28")
    .min(1, "El día debe estar entre 1 y 28")
    .max(28, "El día debe estar entre 1 y 28"),
  desde: periodoSchema,
  sedeId: z.string().trim().optional(),
});

export const categoriaGastoInputSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(60, "El nombre admite máximo 60 caracteres"),
});

export const confirmarRecurrenteInputSchema = z.object({
  monto: montoSchema,
  fecha: fechaSchema,
});
```

(Si `z.coerce.number` sobre `"abc"` produce un mensaje distinto en Zod 4, ajustar el `error` del constructor para que el test de `diaDelMes` dé "El día debe estar entre 1 y 28".)

Run: test → PASS.

- [ ] **Step 5: Verificar y commit**

Run: `npx tsc --noEmit && npm test` → PASS.

```bash
git add prisma/tenant src/lib/validation
git commit -m "fase16-task 1: esquema, migración con categorías por defecto y validación de gastos"
git push
```

---

### Task 2: Lógica de dominio pura (periodos, pendientes, rentabilidad neta)

**Files:**
- Create: `src/lib/gastos/periodo.ts` (+ `.test.ts`), `src/lib/gastos/recurrentes-pendientes.ts` (+ `.test.ts`), `src/lib/gastos/rentabilidad-neta.ts` (+ `.test.ts`)
- Modify: `src/lib/reportes/rentabilidad.ts` (+ su test): exponer `baseFacturada`

**Interfaces:**
- Produces:
  - `periodoActualBogota(ahora: Date): string`, `periodoDeFechaDb(fecha: Date): string`, `periodoAnterior(periodo: string): string`, `periodosEntre(desde: string, hasta: string): string[]`, `rangoDelPeriodo(periodo: string): { gte: Date; lt: Date }`, `fechaEnPeriodo(periodo: string, dia: number): Date`, `ETIQUETA_MES(periodo: string): string` (p. ej. "octubre de 2026")
  - `interface PlantillaParaPendientes { id: string; descripcion: string; categoriaNombre: string; montoEstimado: number; diaDelMes: number; desde: string; activo: boolean; periodosResueltos: string[] }`
  - `interface RecurrentePendiente { recurrenteId: string; descripcion: string; categoriaNombre: string; periodo: string; fechaSugerida: Date; montoEstimado: number }`
  - `calcularRecurrentesPendientes(plantillas: PlantillaParaPendientes[], periodoActual: string): RecurrentePendiente[]`
  - `interface RentabilidadNeta { gastosTotal: number; utilidadNeta: number; margenNetoPorcentaje: number; ticketPromedioBase: number; puntoEquilibrioVentas: number | null; puntoEquilibrioFacturas: number | null; diferenciaEquilibrio: number | null }`
  - `computeRentabilidadNeta(totales: RentabilidadTotales, gastosTotal: number): RentabilidadNeta`
  - `RentabilidadTotales.baseFacturada: number`

- [ ] **Step 1: Tests (fallan)**

`src/lib/gastos/periodo.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ETIQUETA_MES,
  fechaEnPeriodo,
  periodoActualBogota,
  periodoAnterior,
  periodoDeFechaDb,
  periodosEntre,
  rangoDelPeriodo,
} from "./periodo";

describe("periodo", () => {
  it("periodoActualBogota usa el calendario de Bogotá", () => {
    // 1 nov 2026 02:00Z = 31 oct 2026 21:00 en Bogotá
    expect(periodoActualBogota(new Date("2026-11-01T02:00:00Z"))).toBe("2026-10");
  });

  it("periodoDeFechaDb lee la fecha calendario de una columna @db.Date", () => {
    expect(periodoDeFechaDb(new Date("2026-11-01T00:00:00Z"))).toBe("2026-11");
  });

  it("periodoAnterior cruza el año", () => {
    expect(periodoAnterior("2026-01")).toBe("2025-12");
    expect(periodoAnterior("2026-10")).toBe("2026-09");
  });

  it("periodosEntre es inclusivo y vacío si desde > hasta", () => {
    expect(periodosEntre("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(periodosEntre("2026-03", "2026-02")).toEqual([]);
  });

  it("rangoDelPeriodo devuelve medianoches UTC semiabiertas", () => {
    const r = rangoDelPeriodo("2026-12");
    expect(r.gte.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(r.lt.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("fechaEnPeriodo arma la fecha del día dado", () => {
    expect(fechaEnPeriodo("2026-02", 28).toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });

  it("ETIQUETA_MES en español", () => {
    expect(ETIQUETA_MES("2026-10")).toBe("octubre de 2026");
  });
});
```

`src/lib/gastos/recurrentes-pendientes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calcularRecurrentesPendientes, type PlantillaParaPendientes } from "./recurrentes-pendientes";

function plantilla(overrides: Partial<PlantillaParaPendientes> = {}): PlantillaParaPendientes {
  return {
    id: "r1", descripcion: "Arriendo", categoriaNombre: "Arriendo", montoEstimado: 1500000,
    diaDelMes: 5, desde: "2026-08", activo: true, periodosResueltos: [], ...overrides,
  };
}

describe("calcularRecurrentesPendientes", () => {
  it("lista cada mes sin resolver desde `desde` hasta el actual", () => {
    const r = calcularRecurrentesPendientes([plantilla({ periodosResueltos: ["2026-09"] })], "2026-10");
    expect(r.map((p) => p.periodo)).toEqual(["2026-08", "2026-10"]);
    expect(r[0]).toMatchObject({ recurrenteId: "r1", montoEstimado: 1500000 });
    expect(r[0].fechaSugerida.toISOString()).toBe("2026-08-05T00:00:00.000Z");
  });

  it("ignora plantillas inactivas y las que empiezan en el futuro", () => {
    expect(
      calcularRecurrentesPendientes([plantilla({ activo: false }), plantilla({ id: "r2", desde: "2026-11" })], "2026-10"),
    ).toEqual([]);
  });

  it("ordena por periodo y luego por descripción", () => {
    const r = calcularRecurrentesPendientes(
      [plantilla({ id: "b", descripcion: "Internet", desde: "2026-10" }), plantilla({ id: "a", descripcion: "Arriendo", desde: "2026-10" })],
      "2026-10",
    );
    expect(r.map((p) => p.descripcion)).toEqual(["Arriendo", "Internet"]);
  });
});
```

`src/lib/gastos/rentabilidad-neta.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeRentabilidadNeta } from "./rentabilidad-neta";
import type { RentabilidadTotales } from "@/lib/reportes/rentabilidad";

function totales(overrides: Partial<RentabilidadTotales> = {}): RentabilidadTotales {
  return {
    facturasCount: 20, totalFacturado: 11900000, baseFacturada: 10000000, costoRepuestos: 6000000,
    margen: 4000000, margenPorcentaje: 40, manoDeObraFacturada: 3000000, ...overrides,
  };
}

describe("computeRentabilidadNeta", () => {
  it("calcula utilidad neta, margen neto y punto de equilibrio", () => {
    expect(computeRentabilidadNeta(totales(), 3000000)).toEqual({
      gastosTotal: 3000000,
      utilidadNeta: 1000000,
      margenNetoPorcentaje: 10,
      ticketPromedioBase: 500000,
      puntoEquilibrioVentas: 7500000,
      puntoEquilibrioFacturas: 15,
      diferenciaEquilibrio: 2500000,
    });
  });

  it("punto de equilibrio no alcanzable si el margen es 0 o negativo", () => {
    const r = computeRentabilidadNeta(totales({ margen: -100000, margenPorcentaje: -1 }), 500000);
    expect(r.puntoEquilibrioVentas).toBeNull();
    expect(r.puntoEquilibrioFacturas).toBeNull();
    expect(r.diferenciaEquilibrio).toBeNull();
    expect(r.utilidadNeta).toBe(-600000);
  });

  it("sin facturas: margen neto 0, ticket 0, sin punto de equilibrio en facturas", () => {
    const r = computeRentabilidadNeta(
      totales({ facturasCount: 0, totalFacturado: 0, baseFacturada: 0, costoRepuestos: 0, margen: 0, margenPorcentaje: 0 }),
      200000,
    );
    expect(r).toMatchObject({ utilidadNeta: -200000, margenNetoPorcentaje: 0, ticketPromedioBase: 0, puntoEquilibrioVentas: null });
  });

  it("redondea el punto de equilibrio en facturas hacia arriba", () => {
    // base 1.000.000 / 3 facturas => ticket 333.333,33; PE 500.000 => 1,5 => 2
    const r = computeRentabilidadNeta(totales({ facturasCount: 3, baseFacturada: 1000000, margen: 400000, margenPorcentaje: 40 }), 200000);
    expect(r.puntoEquilibrioFacturas).toBe(2);
  });
});
```

En `src/lib/reportes/rentabilidad.test.ts`, agregar al test principal la aserción `expect(totales.baseFacturada).toBe(<base esperada del fixture>)` y actualizar `toEqual` existentes con el campo nuevo.

Run: `npx vitest run --project unit src/lib/gastos src/lib/reportes/rentabilidad.test.ts` → FAIL.

- [ ] **Step 2: Implementar**

En `src/lib/reportes/rentabilidad.ts`: agregar `baseFacturada: number;` a `RentabilidadTotales` (comentario: "Suma de base sin IVA (subtotal − descuento); denominador del margen y del punto de equilibrio.") y `baseFacturada: baseTotal,` al objeto devuelto.

`src/lib/gastos/periodo.ts`:

```ts
import { formatoDiaBogota } from "@/lib/fecha-bogota";

/**
 * Periodos contables "YYYY-MM". El periodo actual se lee del calendario de
 * Bogotá; las columnas @db.Date (medianoche UTC) se leen por fecha calendario.
 */
const formatoMes = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric", timeZone: "UTC" });

function partes(periodo: string): [number, number] {
  const [anio, mes] = periodo.split("-").map(Number);
  return [anio, mes];
}

function aPeriodo(anio: number, mes: number): string {
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

export function periodoActualBogota(ahora: Date): string {
  return formatoDiaBogota.format(ahora).slice(0, 7);
}

export function periodoDeFechaDb(fecha: Date): string {
  return fecha.toISOString().slice(0, 7);
}

export function periodoAnterior(periodo: string): string {
  const [anio, mes] = partes(periodo);
  return mes === 1 ? aPeriodo(anio - 1, 12) : aPeriodo(anio, mes - 1);
}

function periodoSiguiente(periodo: string): string {
  const [anio, mes] = partes(periodo);
  return mes === 12 ? aPeriodo(anio + 1, 1) : aPeriodo(anio, mes + 1);
}

export function periodosEntre(desde: string, hasta: string): string[] {
  const periodos: string[] = [];
  for (let actual = desde; actual <= hasta; actual = periodoSiguiente(actual)) {
    periodos.push(actual);
  }
  return periodos;
}

export function rangoDelPeriodo(periodo: string): { gte: Date; lt: Date } {
  return {
    gte: new Date(`${periodo}-01T00:00:00.000Z`),
    lt: new Date(`${periodoSiguiente(periodo)}-01T00:00:00.000Z`),
  };
}

export function fechaEnPeriodo(periodo: string, dia: number): Date {
  return new Date(`${periodo}-${String(dia).padStart(2, "0")}T00:00:00.000Z`);
}

export function ETIQUETA_MES(periodo: string): string {
  return formatoMes.format(new Date(`${periodo}-01T00:00:00.000Z`));
}
```

(La comparación `actual <= hasta` funciona porque "YYYY-MM" ordena lexicográficamente igual que cronológicamente. Si `Intl` del entorno devuelve "octubre de 2026" con otra capitalización/forma, ajustar el test a la salida real.)

`src/lib/gastos/recurrentes-pendientes.ts`:

```ts
import { fechaEnPeriodo, periodosEntre } from "./periodo";

export interface PlantillaParaPendientes {
  id: string;
  descripcion: string;
  categoriaNombre: string;
  montoEstimado: number;
  diaDelMes: number;
  desde: string;
  activo: boolean;
  /** Periodos ya confirmados (con Gasto) u omitidos. */
  periodosResueltos: string[];
}

export interface RecurrentePendiente {
  recurrenteId: string;
  descripcion: string;
  categoriaNombre: string;
  periodo: string;
  fechaSugerida: Date;
  montoEstimado: number;
}

/**
 * Una plantilla activa queda pendiente en cada mes, desde `desde` hasta el
 * actual inclusive, que no tenga gasto confirmado ni omisión. Así un mes
 * olvidado sigue visible hasta que el ADMIN lo resuelva.
 */
export function calcularRecurrentesPendientes(
  plantillas: PlantillaParaPendientes[],
  periodoActual: string,
): RecurrentePendiente[] {
  const pendientes: RecurrentePendiente[] = [];
  for (const plantilla of plantillas) {
    if (!plantilla.activo) continue;
    const resueltos = new Set(plantilla.periodosResueltos);
    for (const periodo of periodosEntre(plantilla.desde, periodoActual)) {
      if (resueltos.has(periodo)) continue;
      pendientes.push({
        recurrenteId: plantilla.id,
        descripcion: plantilla.descripcion,
        categoriaNombre: plantilla.categoriaNombre,
        periodo,
        fechaSugerida: fechaEnPeriodo(periodo, plantilla.diaDelMes),
        montoEstimado: plantilla.montoEstimado,
      });
    }
  }
  return pendientes.sort(
    (a, b) => a.periodo.localeCompare(b.periodo) || a.descripcion.localeCompare(b.descripcion, "es"),
  );
}
```

`src/lib/gastos/rentabilidad-neta.ts`:

```ts
import { roundMoney } from "@/lib/money/round";
import type { RentabilidadTotales } from "@/lib/reportes/rentabilidad";

export interface RentabilidadNeta {
  gastosTotal: number;
  utilidadNeta: number;
  margenNetoPorcentaje: number;
  ticketPromedioBase: number;
  /** Ventas sin IVA necesarias para cubrir los gastos; null si el margen es <= 0. */
  puntoEquilibrioVentas: number | null;
  puntoEquilibrioFacturas: number | null;
  /** base − punto de equilibrio: positivo sobra, negativo falta. */
  diferenciaEquilibrio: number | null;
}

/**
 * El margen bruto no descuenta lo pagado a los mecánicos: eso entra como gasto
 * de Nómina, así que restar los gastos no cuenta nada dos veces. El punto de
 * equilibrio usa margen/base sin redondear para no arrastrar el redondeo del %.
 */
export function computeRentabilidadNeta(totales: RentabilidadTotales, gastosTotal: number): RentabilidadNeta {
  const base = totales.baseFacturada;
  const gastos = roundMoney(gastosTotal);
  const utilidadNeta = roundMoney(totales.margen - gastos);
  const ticketPromedioBase = totales.facturasCount > 0 ? roundMoney(base / totales.facturasCount) : 0;

  const alcanzable = totales.margen > 0 && base > 0;
  const puntoEquilibrioVentas = alcanzable ? roundMoney((gastos * base) / totales.margen) : null;

  return {
    gastosTotal: gastos,
    utilidadNeta,
    margenNetoPorcentaje: base === 0 ? 0 : roundMoney((utilidadNeta / base) * 100),
    ticketPromedioBase,
    puntoEquilibrioVentas,
    puntoEquilibrioFacturas:
      puntoEquilibrioVentas !== null && ticketPromedioBase > 0 ? Math.ceil(puntoEquilibrioVentas / ticketPromedioBase) : null,
    diferenciaEquilibrio: puntoEquilibrioVentas !== null ? roundMoney(base - puntoEquilibrioVentas) : null,
  };
}
```

Run tests → PASS.

- [ ] **Step 3: Verificar y commit**

Run: `npx tsc --noEmit && npm test` → PASS (actualizar cualquier fixture de `RentabilidadTotales` que `tsc` marque, agregando `baseFacturada`).

```bash
git add src/lib/gastos src/lib/reportes
git commit -m "fase16-task 2: lógica de periodos, recurrentes pendientes y rentabilidad neta"
git push
```

---

### Task 3: Categorías de gasto (actions + configuración)

**Files:**
- Create: `src/app/actions/categoria-gasto-actions.ts` (+ `.test.ts`)
- Create: `src/app/(dashboard)/gastos/configuracion/page.tsx`, `categorias-gasto-section.tsx` (+ `.test.tsx`)

**Interfaces:**
- Consumes: `categoriaGastoInputSchema` (Task 1).
- Produces:
  - `interface CategoriaGastoVista { id: string; nombre: string; activo: boolean; orden: number }`
  - `listCategoriasGasto(opciones?: { soloActivas?: boolean }): Promise<CategoriaGastoVista[]>` — `soloActivas: true` → ADMIN/RECEPCION; sin opción (todas) → ADMIN. Orden por `orden` asc.
  - `interface CategoriaGastoFormState { error: string | null; success: boolean }`
  - `crearCategoriaGastoAction(prev, formData)`, `renombrarCategoriaGastoAction(categoriaId: string, prev, formData)` — ADMIN; campo `nombre`.
  - `toggleCategoriaGastoActivaAction(categoriaId: string): Promise<{ error: string | null }>` — ADMIN.
  - Página `/gastos/configuracion` (ADMIN) con la sección de categorías; Task 5 le agrega la de plantillas.

- [ ] **Step 1: Tests de actions (fallan)** — `categoria-gasto-actions.test.ts` (mocks como `src/app/actions/vehiculo-actions.test.ts`: `@/lib/auth/guards`, `@/lib/db/tenant-client`, `next/cache`):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({ requireRole: (...a: unknown[]) => mockRequireRole(...a), requireSession: vi.fn() }));
const db = {
  categoriaGasto: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), findUnique: vi.fn(), aggregate: vi.fn() },
};
vi.mock("@/lib/db/tenant-client", () => ({ getTenantDb: () => db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  crearCategoriaGastoAction,
  listCategoriasGasto,
  renombrarCategoriaGastoAction,
  toggleCategoriaGastoActivaAction,
} from "./categoria-gasto-actions";

const inicial = { error: null, success: false };
const ADMIN = { user: { id: "u1", role: "ADMIN", tenantSchema: "t" } };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireRole.mockResolvedValue(ADMIN);
});

function fd(nombre: string) {
  const f = new FormData();
  f.set("nombre", nombre);
  return f;
}

describe("listCategoriasGasto", () => {
  it("solo activas: ADMIN y RECEPCION, filtrando activo", async () => {
    db.categoriaGasto.findMany.mockResolvedValue([{ id: "c1", nombre: "Arriendo", activo: true, orden: 0, createdAt: new Date() }]);
    const r = await listCategoriasGasto({ soloActivas: true });
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
    expect(db.categoriaGasto.findMany).toHaveBeenCalledWith({ where: { activo: true }, orderBy: { orden: "asc" } });
    expect(r).toEqual([{ id: "c1", nombre: "Arriendo", activo: true, orden: 0 }]);
  });

  it("todas: solo ADMIN", async () => {
    db.categoriaGasto.findMany.mockResolvedValue([]);
    await listCategoriasGasto();
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
    expect(db.categoriaGasto.findMany).toHaveBeenCalledWith({ where: {}, orderBy: { orden: "asc" } });
  });
});

describe("crearCategoriaGastoAction", () => {
  it("crea al final del orden", async () => {
    db.categoriaGasto.aggregate.mockResolvedValue({ _max: { orden: 10 } });
    db.categoriaGasto.create.mockResolvedValue({});
    expect(await crearCategoriaGastoAction(inicial, fd("  Repuestos menores "))).toEqual({ error: null, success: true });
    expect(db.categoriaGasto.create).toHaveBeenCalledWith({ data: { nombre: "Repuestos menores", orden: 11 } });
  });

  it("nombre duplicado", async () => {
    db.categoriaGasto.aggregate.mockResolvedValue({ _max: { orden: 0 } });
    db.categoriaGasto.create.mockRejectedValue({ code: "P2002" });
    expect(await crearCategoriaGastoAction(inicial, fd("Arriendo"))).toEqual({
      error: "Ya existe una categoría con ese nombre",
      success: false,
    });
  });

  it("exige ADMIN y nombre", async () => {
    expect((await crearCategoriaGastoAction(inicial, fd("  "))).error).toBe("El nombre es obligatorio");
    expect(db.categoriaGasto.create).not.toHaveBeenCalled();
  });
});

describe("renombrar y activar/desactivar", () => {
  it("renombra", async () => {
    db.categoriaGasto.update.mockResolvedValue({});
    expect(await renombrarCategoriaGastoAction("c1", inicial, fd("Arriendo bodega"))).toEqual({ error: null, success: true });
    expect(db.categoriaGasto.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { nombre: "Arriendo bodega" } });
  });

  it("alterna activo", async () => {
    db.categoriaGasto.findUnique.mockResolvedValue({ id: "c1", activo: true });
    db.categoriaGasto.update.mockResolvedValue({});
    expect(await toggleCategoriaGastoActivaAction("c1")).toEqual({ error: null });
    expect(db.categoriaGasto.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { activo: false } });
  });

  it("categoría inexistente", async () => {
    db.categoriaGasto.findUnique.mockResolvedValue(null);
    expect(await toggleCategoriaGastoActivaAction("x")).toEqual({ error: "Categoría no encontrada" });
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implementar** `src/app/actions/categoria-gasto-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { categoriaGastoInputSchema } from "@/lib/validation/gasto";

export interface CategoriaGastoVista {
  id: string;
  nombre: string;
  activo: boolean;
  orden: number;
}

export interface CategoriaGastoFormState {
  error: string | null;
  success: boolean;
}

const MENSAJE_DUPLICADO = "Ya existe una categoría con ese nombre";

function mensajeError(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "code" in err && (err as { code?: unknown }).code === "P2002") {
    return MENSAJE_DUPLICADO;
  }
  return friendlyPrismaErrorMessage(err, fallback);
}

function revalidar() {
  revalidatePath("/gastos");
  revalidatePath("/gastos/configuracion");
}

export async function listCategoriasGasto(opciones: { soloActivas?: boolean } = {}): Promise<CategoriaGastoVista[]> {
  const session = await requireRole(opciones.soloActivas ? ["ADMIN", "RECEPCION"] : ["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const filas = await tenantDb.categoriaGasto.findMany({
    where: opciones.soloActivas ? { activo: true } : {},
    orderBy: { orden: "asc" },
  });
  return filas.map(({ id, nombre, activo, orden }) => ({ id, nombre, activo, orden }));
}

export async function crearCategoriaGastoAction(
  prevState: CategoriaGastoFormState,
  formData: FormData,
): Promise<CategoriaGastoFormState> {
  const session = await requireRole(["ADMIN"]);
  const parsed = categoriaGastoInputSchema.safeParse({ nombre: formData.get("nombre") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };

  const tenantDb = getTenantDb(session.user.tenantSchema);
  try {
    const { _max } = await tenantDb.categoriaGasto.aggregate({ _max: { orden: true } });
    await tenantDb.categoriaGasto.create({ data: { nombre: parsed.data.nombre, orden: (_max.orden ?? -1) + 1 } });
  } catch (err) {
    return { error: mensajeError(err, "No se pudo crear la categoría"), success: false };
  }
  revalidar();
  return { error: null, success: true };
}

export async function renombrarCategoriaGastoAction(
  categoriaId: string,
  prevState: CategoriaGastoFormState,
  formData: FormData,
): Promise<CategoriaGastoFormState> {
  const session = await requireRole(["ADMIN"]);
  const parsed = categoriaGastoInputSchema.safeParse({ nombre: formData.get("nombre") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };

  const tenantDb = getTenantDb(session.user.tenantSchema);
  try {
    await tenantDb.categoriaGasto.update({ where: { id: categoriaId }, data: { nombre: parsed.data.nombre } });
  } catch (err) {
    return { error: mensajeError(err, "No se pudo renombrar la categoría"), success: false };
  }
  revalidar();
  return { error: null, success: true };
}

export async function toggleCategoriaGastoActivaAction(categoriaId: string): Promise<{ error: string | null }> {
  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const categoria = await tenantDb.categoriaGasto.findUnique({ where: { id: categoriaId } });
  if (!categoria) return { error: "Categoría no encontrada" };
  try {
    await tenantDb.categoriaGasto.update({ where: { id: categoriaId }, data: { activo: !categoria.activo } });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "No se pudo actualizar la categoría") };
  }
  revalidar();
  return { error: null };
}
```

Nota: aquí el guard va **antes** del parse (a diferencia de `dvi-checklist-item-actions.ts`) para que un no-ADMIN nunca reciba mensajes de validación; ajustar el test "exige ADMIN y nombre" si el orden lo requiere.

Run tests → PASS.

- [ ] **Step 3: UI de categorías**

`src/app/(dashboard)/gastos/configuracion/page.tsx` (server): `await requireRole(["ADMIN"])`; título "Configuración de gastos", link "← Volver a Gastos" a `/gastos`; `const categorias = await listCategoriasGasto();` y `<CategoriasGastoSection categorias={categorias} />` dentro de una `Card` "Categorías". (Task 5 agrega aquí la tarjeta "Gastos recurrentes" arriba de esta.)

`categorias-gasto-section.tsx` (client), mismo estilo visual que la configuración del checklist DVI (`src/app/(dashboard)/ordenes/[id]/` — buscar el diálogo/lista de ítems de checklist y su toggle):
- Lista en orden: nombre; insignia "Inactiva" si `!activo`; botón "Renombrar" (convierte la fila en un `Input` + "Guardar"/"Cancelar", con `useActionState(renombrarCategoriaGastoAction.bind(null, id), ...)`); botón "Desactivar"/"Activar" (llama `toggleCategoriaGastoActivaAction` en `startTransition`, `toast.error` si devuelve error, try/catch con `toast.error("No se pudo actualizar la categoría")`).
- Formulario "Nueva categoría" (`Input name="nombre"` + botón "Agregar") con `useActionState(crearCategoriaGastoAction, ...)`, error en `<p className="text-xs text-destructive" role="alert">`, `toast.success("Categoría creada")` y reset del input al éxito.

Test `categorias-gasto-section.test.tsx` (mockear `@/app/actions/categoria-gasto-actions` y `sonner`): renderiza las categorías con "Inactiva" para la inactiva; clic en "Desactivar" llama `toggleCategoriaGastoActivaAction("c1")`; enviar "Nueva categoría" llama `crearCategoriaGastoAction`.

- [ ] **Step 4: Verificar y commit**

Run: `npx tsc --noEmit && npm test` → PASS.

```bash
git add src/app/actions/categoria-gasto-actions* "src/app/(dashboard)/gastos/configuracion"
git commit -m "fase16-task 3: categorías de gasto editables"
git push
```

---

### Task 4: Gastos — actions, página `/gastos` y menú

**Files:**
- Create: `src/app/actions/gasto-actions.ts` (+ `.test.ts`)
- Create: `src/app/(dashboard)/gastos/page.tsx`, `loading.tsx`, `gastos-table.tsx`, `gasto-dialog.tsx` (+ `gasto-dialog.test.tsx`), `filtros-gastos.tsx`
- Modify: `src/app/(dashboard)/dashboard-sidebar.tsx`, `src/app/(dashboard)/layout.tsx`

**Interfaces:**
- Consumes: `gastoInputSchema`, `periodoSchema` (Task 1); `periodoActualBogota`, `periodoAnterior`, `rangoDelPeriodo`, `ETIQUETA_MES` (Task 2); `listCategoriasGasto` (Task 3).
- Produces:
  - `interface GastoFila { id: string; fecha: Date; descripcion: string; categoriaId: string; categoriaNombre: string; referencia: string | null; monto: number; registradoPorNombre: string; esRecurrente: boolean }`
  - `interface GastosDelMes { periodo: string; sedeId: string; filas: GastoFila[]; total: number; totalMesAnterior: number; categoriaMayor: { nombre: string; monto: number } | null }`
  - `listGastos(filtros: { periodo?: string; sedeId?: string; categoriaId?: string }): Promise<GastosDelMes>` — ADMIN/RECEPCION; RECEPCION ignora `sedeId` (usa la activa); periodo inválido/ausente → actual.
  - `interface GastoFormState { error: string | null; success: boolean }`
  - `crearGastoAction(prev, formData)` — ADMIN/RECEPCION; campos `categoriaId, descripcion, monto, fecha, referencia, sedeId`.
  - `actualizarGastoAction(gastoId: string, prev, formData)` — ADMIN.
  - `eliminarGastoAction(gastoId: string): Promise<{ error: string | null }>` — ADMIN.
  - Sidebar prop `puedeVerGastos: boolean`.

- [ ] **Step 1: Tests de actions (fallan)** — `gasto-actions.test.ts`, mismo estilo de mocks que Task 3 (`db.gasto: { findMany, create, update, delete, aggregate, groupBy }`, `db.categoriaGasto.findUnique`, `db.sede.findUnique`). Fijar `vi.setSystemTime(new Date("2026-10-15T15:00:00Z"))`. Casos:

```ts
// RECEPCION: sesión { user: { id: "u2", role: "RECEPCION", tenantSchema: "t", sedeActivaId: "s1" } }
// ADMIN:     sesión { user: { id: "u1", role: "ADMIN",     tenantSchema: "t", sedeActivaId: "s1" } }

it("crearGastoAction (RECEPCION) usa la sede activa aunque envíe otra", async () => {
  // categoría activa
  db.categoriaGasto.findUnique.mockResolvedValue({ id: "cat_arriendo", activo: true });
  const f = form({ categoriaId: "cat_arriendo", descripcion: "Arriendo", monto: "1500000", fecha: "2026-10-05", sedeId: "s2" });
  expect(await crearGastoAction(inicial, f)).toEqual({ error: null, success: true });
  expect(db.gasto.create).toHaveBeenCalledWith({
    data: {
      sedeId: "s1", categoriaId: "cat_arriendo", descripcion: "Arriendo", monto: 1500000,
      fecha: new Date("2026-10-05T00:00:00.000Z"), referencia: null, registradoPorId: "u2",
    },
  });
});

it("crearGastoAction (ADMIN) puede elegir otra sede existente", async () => {
  db.categoriaGasto.findUnique.mockResolvedValue({ id: "cat_arriendo", activo: true });
  db.sede.findUnique.mockResolvedValue({ id: "s2" });
  await crearGastoAction(inicial, form({ ...valido, sedeId: "s2" }));
  expect(db.gasto.create.mock.calls[0][0].data.sedeId).toBe("s2");
});

it("rechaza categoría inactiva o inexistente", async () => {
  db.categoriaGasto.findUnique.mockResolvedValue({ id: "c", activo: false });
  expect((await crearGastoAction(inicial, form(valido))).error).toBe("La categoría no está disponible");
  expect(db.gasto.create).not.toHaveBeenCalled();
});

it("rechaza sede inexistente (ADMIN)", async () => {
  db.categoriaGasto.findUnique.mockResolvedValue({ id: "c", activo: true });
  db.sede.findUnique.mockResolvedValue(null);
  expect((await crearGastoAction(inicial, form({ ...valido, sedeId: "zz" }))).error).toBe("Sede no encontrada");
});

it("actualizar y eliminar exigen ADMIN", async () => {
  await actualizarGastoAction("g1", inicial, form(valido));
  expect(mockRequireRole).toHaveBeenLastCalledWith(["ADMIN"]);
  db.gasto.delete.mockResolvedValue({});
  expect(await eliminarGastoAction("g1")).toEqual({ error: null });
  expect(mockRequireRole).toHaveBeenLastCalledWith(["ADMIN"]);
});

it("eliminar inexistente devuelve error amable", async () => {
  db.gasto.delete.mockRejectedValue({ code: "P2025" });
  expect(await eliminarGastoAction("x")).toEqual({ error: "No se pudo eliminar el gasto" });
});

it("listGastos arma filas, total, mes anterior y categoría mayor", async () => {
  db.gasto.findMany.mockResolvedValue([
    { id: "g1", fecha: new Date("2026-10-05T00:00:00Z"), descripcion: "Arriendo", categoriaId: "c1",
      categoria: { nombre: "Arriendo" }, referencia: null, monto: { toString: () => "1500000" },
      registradoPor: { nombre: "Ana" }, gastoRecurrenteId: "r1" },
    { id: "g2", fecha: new Date("2026-10-07T00:00:00Z"), descripcion: "Aceite", categoriaId: "c2",
      categoria: { nombre: "Insumos" }, referencia: "F-1", monto: { toString: () => "200000" },
      registradoPor: { nombre: "Luis" }, gastoRecurrenteId: null },
  ]);
  db.gasto.aggregate.mockResolvedValue({ _sum: { monto: { toString: () => "1000000" } } });
  const r = await listGastos({ periodo: "2026-10" });
  expect(db.gasto.findMany.mock.calls[0][0].where).toMatchObject({
    sedeId: "s1", fecha: { gte: new Date("2026-10-01T00:00:00.000Z"), lt: new Date("2026-11-01T00:00:00.000Z") },
  });
  expect(r.total).toBe(1700000);
  expect(r.totalMesAnterior).toBe(1000000);
  expect(r.categoriaMayor).toEqual({ nombre: "Arriendo", monto: 1500000 });
  expect(r.filas[0]).toMatchObject({ monto: 1500000, esRecurrente: true, categoriaNombre: "Arriendo" });
});
```

(`form(obj)` arma un `FormData`; `valido` = el objeto del primer caso sin `sedeId`. Mockear `Number(decimal)`: los objetos con `toString` funcionan con `Number(...)`.)

Run → FAIL.

- [ ] **Step 2: Implementar `gasto-actions.ts`**

Reglas (escribir el código siguiendo `categoria-gasto-actions.ts` de Task 3):
- Guard primero (`requireRole`), luego parse con `gastoInputSchema` (campos de `formData`, `referencia`/`sedeId` con `|| undefined`).
- `crearGastoAction`: `sedeId = role === "RECEPCION" ? session.user.sedeActivaId : (parsed.sedeId || session.user.sedeActivaId)`; si es distinta de la activa, verificar `tenantDb.sede.findUnique` → "Sede no encontrada". Verificar categoría `findUnique` → si no existe o `!activo` → "La categoría no está disponible". `create` con `fecha: new Date(\`${fecha}T00:00:00.000Z\`)`, `referencia: referencia ?? null`, `registradoPorId: session.user.id`. Errores → `friendlyPrismaErrorMessage(err, "No se pudo registrar el gasto")`. `revalidatePath("/gastos")`, `revalidatePath("/reportes")`.
- `actualizarGastoAction`: ADMIN; misma validación de categoría (para editar se permite la categoría actual aunque esté inactiva: si `categoriaId` no cambió, no exigir `activo`) y sede; `update` (no cambia `gastoRecurrenteId`/`periodo`). Error → "No se pudo actualizar el gasto".
- `eliminarGastoAction`: ADMIN; `delete`; error → "No se pudo eliminar el gasto".
- `listGastos`: ADMIN/RECEPCION; `periodo = periodoSchema.safeParse(f.periodo).success ? f.periodo : periodoActualBogota(new Date())`; `sedeId` como en crear (RECEPCION fuerza activa; ADMIN usa `f.sedeId || activa`); `findMany({ where: { sedeId, fecha: rangoDelPeriodo(periodo), ...(categoriaId ? { categoriaId } : {}) }, include: { categoria: { select: { nombre: true } }, registradoPor: { select: { nombre: true } } }, orderBy: [{ fecha: "desc" }, { createdAt: "desc" }] })`; `totalMesAnterior` vía `aggregate({ _sum: { monto: true }, where: { sedeId, fecha: rangoDelPeriodo(periodoAnterior(periodo)) } })` (sin filtro de categoría); `total` y `categoriaMayor` calculados sobre las filas del mes **sin** filtro de categoría (si hay filtro, hacer una segunda consulta `groupBy` por categoría o calcular desde un `findMany` sin filtro — elegir una y documentarla en un comentario). Convertir todos los `Decimal` con `Number()` y redondear con `roundMoney`.

Run tests → PASS.

- [ ] **Step 3: Página `/gastos`**

`page.tsx` (server): `const session = await requireRole(["ADMIN", "RECEPCION"])`; `searchParams: Promise<{ periodo?: string; sedeId?: string; categoriaId?: string }>`; `const gastos = await listGastos(...)`, `const categorias = await listCategoriasGasto({ soloActivas: true })`, y si ADMIN `const sedes = await listSedes()` (secuencial, no `Promise.all`: los guards redirigen lanzando — ver comentario en `reportes/page.tsx`). Estructura:
- Encabezado "Gastos" + subtítulo `ETIQUETA_MES(periodo)` · nombre de la sede; botones "Nuevo gasto" (abre `GastoDialog` modo crear) y, si ADMIN, link "Configuración" a `/gastos/configuracion`.
- `FiltrosGastos` (client, `<form method="get">` como el de `/reportes`): `Input type="month" name="periodo"`, `SelectField` de sede (solo ADMIN), `SelectField` de categoría ("Todas" + activas), botón "Aplicar".
- Tres `KpiCard`: "Total del mes" (`formatoMoneda`), "vs. mes anterior" (diferencia % con signo; "Sin datos del mes anterior" si es 0), "Categoría mayor" (nombre + monto, o "—").
- `GastosTable` (client): columnas Fecha (`formatoFechaVencimiento`-style: `Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "UTC" })`), Descripción (+ insignia "Recurrente" si `esRecurrente`), Categoría, Referencia, Monto (derecha, mono), Registrado por, Acciones (solo ADMIN: "Editar" abre `GastoDialog` modo editar; eliminar con `EliminarConConfirmacion` — revisar su API en `src/components/eliminar-con-confirmacion.tsx` — pregunta `¿Eliminar el gasto "<descripcion>"?`). Estado vacío: "No hay gastos registrados en este mes."
- `loading.tsx` igual al de otra página de lista.

`gasto-dialog.tsx` (client): `Dialog` con formulario react-hook-form (seguir `nuevo-vehiculo-form.tsx`): Categoría (`SelectField`, activas + la actual si se edita), Descripción, Monto (`Input type="number" min="1" step="1"`), Fecha (`Input type="date"`, por defecto hoy en Bogotá: `formatoDiaBogota.format(new Date())`), Referencia, Sede (`SelectField`, solo ADMIN, por defecto la del filtro). Envía a `crearGastoAction` o `actualizarGastoAction.bind(null, id)`; al éxito cierra, `toast.success("Gasto registrado" | "Gasto actualizado")`. Validación cliente con `gastoInputSchema` (zodResolver) para que errores aparezcan sin ir al servidor.

Test `gasto-dialog.test.tsx`: con descripción vacía y monto 0 no llama a la action y muestra "La descripción es obligatoria"; con datos válidos llama `crearGastoAction` con `FormData` que contiene `categoriaId`, `descripcion`, `monto`, `fecha`; RECEPCION no ve el selector de sede.

- [ ] **Step 4: Menú**

`layout.tsx`: `const puedeVerGastos = session.user.role !== "TECNICO";` y pasarlo a `DashboardSidebar`. En `dashboard-sidebar.tsx`: prop `puedeVerGastos: boolean`; ítem `{ href: "/gastos", label: "Gastos", icon: Wallet }` (importar `Wallet` de lucide-react) añadido al grupo Operación **solo si** `puedeVerGastos` (p. ej. construyendo `const operacion = puedeVerGastos ? { ...OPERACION, items: [...OPERACION.items, GASTOS] } : OPERACION;`). Actualizar tests que rendericen el sidebar si los hay.

- [ ] **Step 5: Verificar y commit**

Run: `npx tsc --noEmit && npm test` → PASS.

```bash
git add src/app/actions/gasto-actions* "src/app/(dashboard)/gastos" "src/app/(dashboard)/dashboard-sidebar.tsx" "src/app/(dashboard)/layout.tsx"
git commit -m "fase16-task 4: registro de gastos por sede y página de gastos"
git push
```

---

### Task 5: Gastos recurrentes (plantillas, pendientes, confirmar, omitir)

**Files:**
- Create: `src/app/actions/gasto-recurrente-actions.ts` (+ `.test.ts`)
- Create: `src/app/(dashboard)/gastos/recurrentes-pendientes.tsx` (+ `.test.tsx`), `src/app/(dashboard)/gastos/configuracion/plantillas-recurrentes-section.tsx` (+ `.test.tsx`)
- Modify: `src/app/(dashboard)/gastos/page.tsx`, `src/app/(dashboard)/gastos/configuracion/page.tsx`

**Interfaces:**
- Consumes: `gastoRecurrenteInputSchema`, `confirmarRecurrenteInputSchema`, `periodoSchema` (Task 1); `calcularRecurrentesPendientes`, `PlantillaParaPendientes`, `RecurrentePendiente`, `periodoActualBogota`, `periodoDeFechaDb`, `ETIQUETA_MES` (Task 2); `listCategoriasGasto` (Task 3).
- Produces:
  - `interface PlantillaVista { id: string; sedeId: string; sedeNombre: string; categoriaId: string; categoriaNombre: string; descripcion: string; montoEstimado: number; diaDelMes: number; desde: string; activo: boolean }`
  - `listPlantillasRecurrentes(): Promise<PlantillaVista[]>` — ADMIN.
  - `crearGastoRecurrenteAction(prev, formData)`, `actualizarGastoRecurrenteAction(id: string, prev, formData)` — ADMIN; `toggleGastoRecurrenteActivoAction(id: string): Promise<{ error: string | null }>` — ADMIN.
  - `listRecurrentesPendientes(filtros: { sedeId?: string }): Promise<RecurrentePendiente[]>` — ADMIN/RECEPCION (RECEPCION fuerza sede activa).
  - `contarRecurrentesPendientesEnRango(tenantSchema: string, sedeId: string, gte: Date, lt: Date): Promise<number>` en `src/lib/gastos/pendientes-db.ts` (sin `"use server"`, para que no quede expuesta como endpoint; sin guard propio — la llama el reporte, que ya pasó `requireRole(["ADMIN"])`; documentarlo en un comentario): cuenta pendientes cuya `fechaSugerida` ∈ [gte, lt).
  - `cargarPlantillasParaPendientes(tenantDb, sedeId: string): Promise<PlantillaParaPendientes[]>` en el mismo archivo, compartida por la función anterior y por `listRecurrentesPendientes`.
  - `confirmarRecurrenteAction(recurrenteId: string, periodo: string, prev, formData)` — ADMIN; campos `monto`, `fecha`.
  - `omitirRecurrenteAction(recurrenteId: string, periodo: string): Promise<{ error: string | null }>` — ADMIN.

- [ ] **Step 1: Tests (fallan)** — `gasto-recurrente-actions.test.ts` con el mismo estilo de mocks (`db.gastoRecurrente: { findMany, findUnique, create, update }`, `db.gasto.create`, `db.gastoRecurrenteOmitido.create`, `db.categoriaGasto.findUnique`, `db.sede.findUnique`), `vi.setSystemTime(new Date("2026-10-15T15:00:00Z"))`:

```ts
it("listRecurrentesPendientes arma periodos resueltos con gastos y omisiones", async () => {
  db.gastoRecurrente.findMany.mockResolvedValue([
    { id: "r1", descripcion: "Arriendo", categoria: { nombre: "Arriendo" }, montoEstimado: { toString: () => "1500000" },
      diaDelMes: 5, desde: "2026-08", activo: true, gastos: [{ periodo: "2026-08" }], omitidos: [{ periodo: "2026-09" }] },
  ]);
  const r = await listRecurrentesPendientes({});
  expect(db.gastoRecurrente.findMany.mock.calls[0][0].where).toEqual({ sedeId: "s1", activo: true });
  expect(r.map((p) => p.periodo)).toEqual(["2026-10"]);
  expect(r[0].montoEstimado).toBe(1500000);
});

it("confirmarRecurrenteAction crea el gasto con periodo y datos de la plantilla", async () => {
  db.gastoRecurrente.findUnique.mockResolvedValue({ id: "r1", sedeId: "s1", categoriaId: "cat_arriendo", descripcion: "Arriendo", desde: "2026-08", activo: true });
  const f = new FormData(); f.set("monto", "1550000"); f.set("fecha", "2026-10-05");
  expect(await confirmarRecurrenteAction("r1", "2026-10", inicial, f)).toEqual({ error: null, success: true });
  expect(db.gasto.create).toHaveBeenCalledWith({
    data: {
      sedeId: "s1", categoriaId: "cat_arriendo", descripcion: "Arriendo", monto: 1550000,
      fecha: new Date("2026-10-05T00:00:00.000Z"), referencia: null, gastoRecurrenteId: "r1", periodo: "2026-10", registradoPorId: "u1",
    },
  });
});

it("confirmar: la fecha debe caer en el periodo; periodo futuro o anterior a `desde` se rechaza", async () => {
  db.gastoRecurrente.findUnique.mockResolvedValue({ id: "r1", sedeId: "s1", categoriaId: "c", descripcion: "A", desde: "2026-08", activo: true });
  const f = new FormData(); f.set("monto", "1"); f.set("fecha", "2026-11-05");
  expect((await confirmarRecurrenteAction("r1", "2026-10", inicial, f)).error).toBe("La fecha debe estar dentro de octubre de 2026");
  f.set("fecha", "2026-12-05");
  expect((await confirmarRecurrenteAction("r1", "2026-12", inicial, f)).error).toBe("Ese mes todavía no ha empezado");
  f.set("fecha", "2026-07-05");
  expect((await confirmarRecurrenteAction("r1", "2026-07", inicial, f)).error).toBe("La plantilla empieza después de ese mes");
});

it("confirmar duplicado (P2002) -> mensaje claro", async () => {
  db.gastoRecurrente.findUnique.mockResolvedValue({ id: "r1", sedeId: "s1", categoriaId: "c", descripcion: "A", desde: "2026-08", activo: true });
  db.gasto.create.mockRejectedValue({ code: "P2002" });
  const f = new FormData(); f.set("monto", "1"); f.set("fecha", "2026-10-05");
  expect((await confirmarRecurrenteAction("r1", "2026-10", inicial, f)).error).toBe("Este gasto ya fue confirmado");
});

it("omitir crea el registro y P2002 se trata como ya omitido (éxito)", async () => {
  db.gastoRecurrente.findUnique.mockResolvedValue({ id: "r1", desde: "2026-08" });
  expect(await omitirRecurrenteAction("r1", "2026-10")).toEqual({ error: null });
  expect(db.gastoRecurrenteOmitido.create).toHaveBeenCalledWith({ data: { gastoRecurrenteId: "r1", periodo: "2026-10", omitidoPorId: "u1" } });
  db.gastoRecurrenteOmitido.create.mockRejectedValue({ code: "P2002" });
  expect(await omitirRecurrenteAction("r1", "2026-10")).toEqual({ error: null });
});

it("confirmar/omitir/plantillas exigen ADMIN; pendientes admite RECEPCION", async () => {
  db.gastoRecurrente.findMany.mockResolvedValue([]);
  await listRecurrentesPendientes({});
  expect(mockRequireRole).toHaveBeenLastCalledWith(["ADMIN", "RECEPCION"]);

  db.gastoRecurrente.findUnique.mockResolvedValue(null);
  await omitirRecurrenteAction("r1", "2026-10");
  expect(mockRequireRole).toHaveBeenLastCalledWith(["ADMIN"]);
  await confirmarRecurrenteAction("r1", "2026-10", inicial, new FormData());
  expect(mockRequireRole).toHaveBeenLastCalledWith(["ADMIN"]);
  await toggleGastoRecurrenteActivoAction("r1");
  expect(mockRequireRole).toHaveBeenLastCalledWith(["ADMIN"]);
});

it("crearGastoRecurrenteAction valida categoría activa y sede", async () => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ categoriaId: "c", descripcion: "Internet", montoEstimado: "98000", diaDelMes: "10", desde: "2026-10", sedeId: "zz" })) f.set(k, v);

  db.categoriaGasto.findUnique.mockResolvedValue({ id: "c", activo: false });
  expect((await crearGastoRecurrenteAction(inicial, f)).error).toBe("La categoría no está disponible");

  db.categoriaGasto.findUnique.mockResolvedValue({ id: "c", activo: true });
  db.sede.findUnique.mockResolvedValue(null);
  expect((await crearGastoRecurrenteAction(inicial, f)).error).toBe("Sede no encontrada");
  expect(db.gastoRecurrente.create).not.toHaveBeenCalled();

  db.sede.findUnique.mockResolvedValue({ id: "zz" });
  expect(await crearGastoRecurrenteAction(inicial, f)).toEqual({ error: null, success: true });
  expect(db.gastoRecurrente.create).toHaveBeenCalledWith({
    data: { sedeId: "zz", categoriaId: "c", descripcion: "Internet", montoEstimado: 98000, diaDelMes: 10, desde: "2026-10" },
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implementar** `gasto-recurrente-actions.ts` y `src/lib/gastos/pendientes-db.ts`:
- `listRecurrentesPendientes`: guard ADMIN/RECEPCION; `sedeId` (RECEPCION → activa; ADMIN → `f.sedeId || activa`); `findMany({ where: { sedeId, activo: true }, include: { categoria: { select: { nombre: true } }, gastos: { where: { periodo: { not: null } }, select: { periodo: true } }, omitidos: { select: { periodo: true } } } })`; mapear a `PlantillaParaPendientes` (`periodosResueltos` = periodos de gastos + omitidos; `montoEstimado: Number(...)`) y devolver `calcularRecurrentesPendientes(plantillas, periodoActualBogota(new Date()))`.
- `pendientes-db.ts` `contarRecurrentesPendientesEnRango(tenantSchema, sedeId, gte, lt)`: misma consulta vía `getTenantDb(tenantSchema)`, filtra pendientes con `gte <= fechaSugerida < lt` y devuelve el conteo. Hacer que `listRecurrentesPendientes` reutilice una función compartida `cargarPlantillasParaPendientes(tenantDb, sedeId)` exportada desde `pendientes-db.ts` (DRY).
- `confirmarRecurrenteAction(recurrenteId, periodo, prev, formData)`: guard ADMIN; `periodoSchema.parse(periodo)` (inválido → "Periodo inválido"); `confirmarRecurrenteInputSchema` sobre `monto`/`fecha`; cargar plantilla (no existe → "Plantilla no encontrada"); `periodo > periodoActualBogota(ahora)` → "Ese mes todavía no ha empezado"; `periodo < plantilla.desde` → "La plantilla empieza después de ese mes"; `fecha.slice(0, 7) !== periodo` → `La fecha debe estar dentro de ${ETIQUETA_MES(periodo)}`; `gasto.create` con los datos del test; P2002 → "Este gasto ya fue confirmado"; otros → `friendlyPrismaErrorMessage(err, "No se pudo confirmar el gasto")`; revalidar `/gastos` y `/reportes`.
- `omitirRecurrenteAction`: guard ADMIN; validar periodo y plantilla; `gastoRecurrenteOmitido.create`; P2002 → éxito (idempotente); otros → `{ error: friendlyPrismaErrorMessage(err, "No se pudo omitir el gasto") }`; revalidar.
- Plantillas: `listPlantillasRecurrentes` (ADMIN, todas las sedes, `include` sede/categoría, orden por `activo desc, descripcion asc`); `crear`/`actualizar` con `gastoRecurrenteInputSchema` (sede: `sedeId || activa`, verificar existencia; categoría activa — al actualizar se permite mantener la actual inactiva); `toggle...Activo`. Mensajes: "No se pudo guardar la plantilla", "Plantilla no encontrada".

Run tests → PASS.

- [ ] **Step 3: UI**

`recurrentes-pendientes.tsx` (client), renderizado en `/gastos` arriba de la tabla solo si hay pendientes (la página llama `listRecurrentesPendientes({ sedeId })` y pasa `esAdmin`):
- `Card` "Gastos recurrentes por confirmar" con una fila por pendiente: descripción, categoría, `ETIQUETA_MES(periodo)`, monto estimado.
- ADMIN: botón **Confirmar** → `Dialog` con `Input` monto (default estimado) y `Input type="date"` fecha (default `fechaSugerida` como `toISOString().slice(0,10)`), envía `confirmarRecurrenteAction.bind(null, recurrenteId, periodo)`; `toast.success("Gasto confirmado")`. Botón **Omitir este mes** con `ConfirmacionEnLinea` (`pregunta={`¿Omitir "${descripcion}" en ${ETIQUETA_MES(periodo)}?`}`, `etiquetaConfirmar="Sí, omitir"`, `destructiva={false}`), llama `omitirRecurrenteAction` en transición con try/catch y `toast.error`.
- RECEPCION: sin botones; texto "El administrador debe confirmarlo".

`plantillas-recurrentes-section.tsx` (client) en `/gastos/configuracion` (tarjeta "Gastos recurrentes" arriba de "Categorías"): lista de plantillas (descripción, sede, categoría, monto estimado, "Día N", "Desde <mes>", insignia "Inactiva"), botón "Nueva plantilla" y "Editar" (mismo `Dialog` con campos `sedeId`, `categoriaId`, `descripcion`, `montoEstimado`, `diaDelMes` 1–28, `desde` (`Input type="month"`)), botón "Desactivar/Activar". La página de configuración carga `listPlantillasRecurrentes()`, `listCategoriasGasto({ soloActivas: true })` y `listSedes()`.

Tests: `recurrentes-pendientes.test.tsx` (ADMIN ve Confirmar/Omitir; RECEPCION ve el texto; "Omitir" pide confirmación antes de llamar la action); `plantillas-recurrentes-section.test.tsx` (lista con "Inactiva"; toggle llama la action).

- [ ] **Step 4: Verificar y commit**

Run: `npx tsc --noEmit && npm test` → PASS.

```bash
git add src/app/actions/gasto-recurrente-actions* src/lib/gastos/pendientes-db.ts "src/app/(dashboard)/gastos"
git commit -m "fase16-task 5: gastos recurrentes con confirmación mensual"
git push
```

---

### Task 6: Rentabilidad neta en `/reportes`

**Files:**
- Modify: `src/app/actions/reporte-actions.ts` (+ su test)
- Modify: `src/app/(dashboard)/reportes/page.tsx` (+ `page.test.tsx`)

**Interfaces:**
- Consumes: `computeRentabilidadNeta`, `RentabilidadNeta` (Task 2); `contarRecurrentesPendientesEnRango` (Task 5, `src/lib/gastos/pendientes-db.ts`); `buildRangoFechas` (existente).
- Produces: `ReporteRentabilidadResult` gana `neta: RentabilidadNeta`, `gastosPorCategoria: { categoria: string; monto: number; porcentaje: number }[]` (desc por monto) y `recurrentesSinConfirmar: number`.

- [ ] **Step 1: Tests (fallan)** — en el test existente de `getReporteRentabilidad`, agregar al mock de tenantDb `gasto: { groupBy }` y `categoriaGasto: { findMany }`, y mockear `@/lib/gastos/pendientes-db`:

```ts
it("incluye gastos del periodo, utilidad neta y gastos por categoría", async () => {
  // facturas del fixture existente => base y margen conocidos
  db.gasto.groupBy.mockResolvedValue([
    { categoriaId: "c1", _sum: { monto: { toString: () => "300000" } } },
    { categoriaId: "c2", _sum: { monto: { toString: () => "100000" } } },
  ]);
  db.categoriaGasto.findMany.mockResolvedValue([{ id: "c1", nombre: "Arriendo" }, { id: "c2", nombre: "Insumos" }]);
  mockContarPendientes.mockResolvedValue(2);

  const r = await getReporteRentabilidad({ desde: "2026-10-01", hasta: "2026-10-31" });

  expect(db.gasto.groupBy).toHaveBeenCalledWith({
    by: ["categoriaId"],
    where: { sedeId: "s1", fecha: { gte: new Date("2026-10-01T00:00:00.000Z"), lt: new Date("2026-11-01T00:00:00.000Z") } },
    _sum: { monto: true },
  });
  expect(r.neta.gastosTotal).toBe(400000);
  expect(r.gastosPorCategoria).toEqual([
    { categoria: "Arriendo", monto: 300000, porcentaje: 75 },
    { categoria: "Insumos", monto: 100000, porcentaje: 25 },
  ]);
  expect(r.recurrentesSinConfirmar).toBe(2);
  expect(mockContarPendientes).toHaveBeenCalledWith("taller_x", "s1", new Date("2026-10-01T00:00:00.000Z"), new Date("2026-11-01T00:00:00.000Z"));
});
```

(Ajustar `tenantSchema`/`sedeActivaId` a los del fixture existente. En la rama de error de filtros devolver `neta: computeRentabilidadNeta(computeRentabilidad([]), 0)`, `gastosPorCategoria: []`, `recurrentesSinConfirmar: 0`.)

Run → FAIL.

- [ ] **Step 2: Implementar** en `getReporteRentabilidad`, después de calcular `totales`:

```ts
  const gastosAgrupados = await tenantDb.gasto.groupBy({
    by: ["categoriaId"],
    where: { sedeId, fecha: { gte: rango.gte, lt: rango.lt } },
    _sum: { monto: true },
  });
  const categorias = await tenantDb.categoriaGasto.findMany({
    where: { id: { in: gastosAgrupados.map((fila) => fila.categoriaId) } },
    select: { id: true, nombre: true },
  });
  const nombrePorId = new Map(categorias.map((categoria) => [categoria.id, categoria.nombre]));
  const gastosTotal = roundMoney(gastosAgrupados.reduce((suma, fila) => suma + Number(fila._sum.monto ?? 0), 0));
  const gastosPorCategoria = gastosAgrupados
    .map((fila) => {
      const monto = roundMoney(Number(fila._sum.monto ?? 0));
      return {
        categoria: nombrePorId.get(fila.categoriaId) ?? "Sin categoría",
        monto,
        porcentaje: gastosTotal === 0 ? 0 : roundMoney((monto / gastosTotal) * 100),
      };
    })
    .sort((a, b) => b.monto - a.monto);
  const recurrentesSinConfirmar = await contarRecurrentesPendientesEnRango(
    session.user.tenantSchema,
    sedeId,
    rango.gte,
    rango.lt,
  );

  return {
    filtros: aplicados,
    error: null,
    totales,
    neta: computeRentabilidadNeta(totales, gastosTotal),
    gastosPorCategoria,
    recurrentesSinConfirmar,
  };
```

(El rango ya es medianoche UTC semiabierto, válido para comparar columnas `@db.Date`.)

- [ ] **Step 3: UI** — en la `Card` "Rentabilidad" de `reportes/page.tsx`, después de los KPIs existentes:
- Si `recurrentesSinConfirmar > 0`: `Alert` (no destructivo) "Hay N gastos recurrentes sin confirmar en este periodo; la utilidad puede estar sobreestimada." + `Link` "Revisar gastos" a `/gastos`. Singular/plural ("1 gasto recurrente sin confirmar").
- Cuatro `KpiCard` nuevos: **Gastos del periodo** (danger), **Utilidad neta** (success si ≥ 0, danger si < 0), **Margen neto (%)**, **Punto de equilibrio** (valor = ventas sin IVA necesarias o "No alcanzable"; subtítulo: `"≈ N facturas · Sobran $X"` / `"≈ N facturas · Faltan $X"`; si no alcanzable: "No alcanzable con el margen actual"). Iconos de lucide (`Wallet`, `TrendingUp`, `Percent`, `Target`).
- Tabla "Gastos por categoría" (`DataTable` existente): Categoría, Monto (derecha, mono), % del total. Vacía: "No hay gastos registrados en este periodo."

Tests en `reportes/page.test.tsx` (si existe; si no, crear con mocks de las actions): renderiza "Utilidad neta", el aviso con N=1 en singular, y "No alcanzable con el margen actual" cuando `puntoEquilibrioVentas` es null.

- [ ] **Step 4: Verificar y commit**

Run: `npx tsc --noEmit && npm test` → PASS.

```bash
git add src/app/actions/reporte-actions* "src/app/(dashboard)/reportes"
git commit -m "fase16-task 6: utilidad neta y punto de equilibrio en rentabilidad"
git push
```

---

### Cierre de fase

- [ ] Revisión final de la rama contra el spec; fix wave si hay hallazgos (`fase16-fix: ...`).
- [ ] `npx tsc --noEmit && npm test && npx eslint` en las áreas tocadas.
- [ ] Con aprobación del usuario: respaldo (`pg_dump` en el servidor, `~/backups/`) y aplicar la migración a `taller_dev` y `taller_dev_reference` (base compartida con producción); verificar `migrate diff` vacío y que existan las 11 categorías.
- [ ] Dejar `npm run dev` corriendo para la revisión manual del usuario: registrar gasto (ADMIN y RECEPCION), editar/eliminar, categorías, plantilla recurrente → confirmar y omitir, reporte con utilidad neta y punto de equilibrio, menú oculto para TECNICO.
- [ ] Merge `--no-ff` a `main` y push; deploy lo hace el usuario (build + restart; la BD ya quedará migrada).
