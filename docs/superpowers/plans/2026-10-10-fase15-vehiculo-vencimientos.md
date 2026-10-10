# Fase 15 — Vehículo y vencimientos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar tipo, VIN y vencimientos de SOAT/tecnomecánica de cada vehículo y avisar al cliente (email automático por cron + WhatsApp manual vía wa.me desde una vista `/vencimientos`).

**Architecture:** Columnas nuevas en `Vehiculo` + tablas `AvisoVencimiento` (de-dup por fecha y canal) y `ConfiguracionTaller` (singleton, días de anticipación). Lógica pura en `src/lib/vencimientos/` (sin Prisma, testeable con mocks), un gateway Prisma, y el barrido de email se engancha al cron existente `/api/cron/recordatorios`. UI: formulario/detalle de vehículo, página `/vencimientos`, aviso en nueva orden, KPI en dashboard y sección en `/configuracion-smtp`.

**Tech Stack:** Next.js 16 App Router (server actions), Prisma 6.19.3 (schema por tenant), Zod 4, React 19, react-hook-form, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-10-fase15-vehiculo-vencimientos-design.md`

## Global Constraints

- Rama: `fase15-vehiculo-vencimientos`. Commit por tarea: `fase15-task N: descripción` + trailers `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; push a la rama tras cada tarea. Al final: revisión de toda la rama → merge `--no-ff` a `main`.
- WhatsApp solo vía enlace `wa.me` (sin API). Email solo vía SMTP del tenant.
- Tipos de vehículo: `CARRO`, `MOTO`, `CAMIONETA`, `CAMION` (default `CARRO`).
- VIN: opcional; normalizado (sin espacios, mayúsculas); regex `^[A-HJ-NPR-Z0-9]{17}$`.
- Placa: validación existente intacta; aviso **no bloqueante** — MOTO `^[A-Z]{3}\d{2}[A-Z]$`, resto `^[A-Z]{3}\d{3}$`.
- Estados: `VENCIDO` (< hoy), `PROXIMO` (0–7 días), `POR_VENCER` (8–`diasAviso`), `VIGENTE`, `SIN_DATO`. Comparación por fecha calendario America/Bogota.
- `diasAvisoVencimiento`: default 30, rango 1–90, solo ADMIN lo edita. Sin auditoría.
- Barrido de email: no persigue vencidos de hace más de 30 días.
- Columnas `@db.Date` llegan como medianoche UTC: **nunca** formatearlas con zona Bogotá (se correría un día). Usar `fecha.toISOString().slice(0, 10)` para inputs y `timeZone: "UTC"` para mostrar.
- `RecordatorioEnviado` y el barrido de mantenimiento no cambian de comportamiento.
- Ajuste sobre el spec §4 (decidido al planificar): `/vencimientos` se **ve** con cualquier rol (el grupo Operación es visible para todos y páginas hermanas como `/facturas` solo exigen sesión); el botón/acción de WhatsApp exige ADMIN o RECEPCION.
- `tsc --noEmit` y `npm test` solo al final de cada tarea (RULES §4). No reintentos automáticos (RULES §1).

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `prisma/tenant/schema.prisma` | enums + columnas + modelos nuevos |
| `prisma/tenant/migrations/20261010120000_vehiculo_vencimientos/migration.sql` | migración |
| `src/lib/validation/vehiculo.ts` | schema Zod + `placaFormatoHabitual` |
| `src/lib/vencimientos/estado-vencimiento.ts` | estado, días restantes, rango de aviso (puro) |
| `src/lib/vencimientos/plantilla.ts` | textos email/WhatsApp |
| `src/lib/vencimientos/ejecutar-avisos.ts` | barrido de email sin Prisma |
| `src/lib/vencimientos/gateway-prisma.ts` | gateway Prisma del barrido |
| `src/lib/vencimientos/configuracion.ts` | lectura de `diasAvisoVencimiento` con fallback |
| `src/lib/whatsapp/url.ts` | `urlWhatsapp` (movido desde pedido-compra) |
| `src/app/actions/vehiculo-actions.ts` | persistir campos nuevos |
| `src/app/actions/configuracion-taller-actions.ts` | leer/guardar días de aviso |
| `src/app/actions/vencimiento-actions.ts` | lista de vencimientos + registrar aviso WhatsApp |
| `src/app/(dashboard)/clientes/[id]/vehiculo-form-fields.tsx` (+ nuevo/editar) | campos nuevos |
| `src/components/vencimiento-badge.tsx` | insignia de estado reutilizable |
| `src/app/(dashboard)/vehiculos/[id]/page.tsx` | tipo, VIN, insignias |
| `src/app/(dashboard)/vencimientos/*` | página, tabla, botón WhatsApp |
| `src/app/(dashboard)/configuracion-smtp/*` | sección Recordatorios |
| `src/app/api/cron/recordatorios/route.ts` | ejecutar ambos barridos |
| `src/components/aviso-vencimientos-orden.tsx` | aviso en nueva orden |
| `src/app/(dashboard)/page.tsx`, `dashboard-sidebar.tsx` | KPI + menú |

---

### Task 1: Esquema, migración y persistencia de los campos nuevos

**Files:**
- Modify: `prisma/tenant/schema.prisma` (model `Vehiculo`, `Usuario`; enums y modelos nuevos)
- Create: `prisma/tenant/migrations/20261010120000_vehiculo_vencimientos/migration.sql`
- Modify: `src/lib/validation/vehiculo.ts`
- Modify: `src/app/actions/vehiculo-actions.ts` (create y update)
- Test: `src/lib/validation/vehiculo.test.ts` (crear si no existe), `src/app/actions/vehiculo-actions.test.ts`

**Interfaces:**
- Produces: enums Prisma `TipoVehiculo`, `TipoDocumentoVehiculo`, `CanalAviso`; modelos `AvisoVencimiento` (`tenantDb.avisoVencimiento`), `ConfiguracionTaller` (`tenantDb.configuracionTaller`); campos `Vehiculo.tipo/vin/soatVence/tecnomecanicaVence`; `tipoVehiculoSchema`, `placaFormatoHabitual(placa: string, tipo: "CARRO"|"MOTO"|"CAMIONETA"|"CAMION"): boolean`, `MENSAJE_VIN_INVALIDO`.

- [ ] **Step 1: Schema Prisma**

Agregar a `prisma/tenant/schema.prisma` (junto a los demás enums):

```prisma
enum TipoVehiculo {
  CARRO
  MOTO
  CAMIONETA
  CAMION
}

enum TipoDocumentoVehiculo {
  SOAT
  TECNOMECANICA
}

enum CanalAviso {
  EMAIL
  WHATSAPP
}
```

En `model Vehiculo`, después de `observaciones`:

```prisma
  tipo                 TipoVehiculo          @default(CARRO)
  vin                  String?
  soatVence            DateTime?             @map("soat_vence") @db.Date
  tecnomecanicaVence   DateTime?             @map("tecnomecanica_vence") @db.Date
```

y en sus relaciones, después de `recordatorios`: `avisosVencimiento    AvisoVencimiento[]`.

En `model Usuario`, junto a las demás relaciones: `avisosVencimientoEnviados AvisoVencimiento[]`.

Modelos nuevos (al final del archivo):

```prisma
/// Aviso de vencimiento de SOAT/RTM enviado a un cliente. Único por fecha y
/// canal: una misma fecha se avisa una vez por canal; al renovar (fecha nueva)
/// se puede volver a avisar. enviadoPorId null = lo envió el cron.
model AvisoVencimiento {
  id               String                @id @default(cuid())
  vehiculoId       String                @map("vehiculo_id")
  vehiculo         Vehiculo              @relation(fields: [vehiculoId], references: [id], onDelete: Cascade)
  tipo             TipoDocumentoVehiculo
  fechaVencimiento DateTime              @map("fecha_vencimiento") @db.Date
  canal            CanalAviso
  destino          String
  enviadoPorId     String?               @map("enviado_por_id")
  enviadoPor       Usuario?              @relation(fields: [enviadoPorId], references: [id], onDelete: SetNull)
  enviadoAt        DateTime              @default(now()) @map("enviado_at")

  @@unique([vehiculoId, tipo, fechaVencimiento, canal])
  @@index([enviadoPorId])
  @@map("avisos_vencimiento")
}

/// Configuración general del taller (una fila por tenant, id "singleton").
model ConfiguracionTaller {
  id                   String   @id @default("singleton")
  diasAvisoVencimiento Int      @default(30) @map("dias_aviso_vencimiento")
  updatedAt            DateTime @updatedAt @map("updated_at")

  @@map("configuracion_taller")
}
```

- [ ] **Step 2: Migración SQL**

Crear `prisma/tenant/migrations/20261010120000_vehiculo_vencimientos/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "TipoVehiculo" AS ENUM ('CARRO', 'MOTO', 'CAMIONETA', 'CAMION');

-- CreateEnum
CREATE TYPE "TipoDocumentoVehiculo" AS ENUM ('SOAT', 'TECNOMECANICA');

-- CreateEnum
CREATE TYPE "CanalAviso" AS ENUM ('EMAIL', 'WHATSAPP');

-- AlterTable
ALTER TABLE "vehiculos" ADD COLUMN     "tipo" "TipoVehiculo" NOT NULL DEFAULT 'CARRO',
ADD COLUMN     "vin" TEXT,
ADD COLUMN     "soat_vence" DATE,
ADD COLUMN     "tecnomecanica_vence" DATE;

-- CreateTable
CREATE TABLE "avisos_vencimiento" (
    "id" TEXT NOT NULL,
    "vehiculo_id" TEXT NOT NULL,
    "tipo" "TipoDocumentoVehiculo" NOT NULL,
    "fecha_vencimiento" DATE NOT NULL,
    "canal" "CanalAviso" NOT NULL,
    "destino" TEXT NOT NULL,
    "enviado_por_id" TEXT,
    "enviado_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avisos_vencimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracion_taller" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "dias_aviso_vencimiento" INTEGER NOT NULL DEFAULT 30,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracion_taller_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "avisos_vencimiento_enviado_por_id_idx" ON "avisos_vencimiento"("enviado_por_id");

-- CreateIndex
CREATE UNIQUE INDEX "avisos_vencimiento_vehiculo_id_tipo_fecha_vencimiento_canal_key" ON "avisos_vencimiento"("vehiculo_id", "tipo", "fecha_vencimiento", "canal");

-- AddForeignKey
ALTER TABLE "avisos_vencimiento" ADD CONSTRAINT "avisos_vencimiento_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avisos_vencimiento" ADD CONSTRAINT "avisos_vencimiento_enviado_por_id_fkey" FOREIGN KEY ("enviado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 3: Regenerar cliente y validar**

Run: `npx prisma validate --schema=prisma/tenant/schema.prisma && npx prisma generate --schema=prisma/tenant/schema.prisma`
Expected: "The schema ... is valid" y cliente generado en `src/generated/prisma-tenant`.

Si hay una base local configurada (`TENANT_DATABASE_URL` en `.env`), aplicar con `npx prisma migrate deploy --schema=prisma/tenant/schema.prisma` y confirmar que `npx prisma migrate diff --from-url "$TENANT_DATABASE_URL" --to-schema-datamodel prisma/tenant/schema.prisma --script` sale vacío. Si no hay base local, reportarlo y seguir (no bloquear).

- [ ] **Step 4: Tests de validación (fallan)**

`src/lib/validation/vehiculo.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MENSAJE_VIN_INVALIDO, placaFormatoHabitual, vehiculoInputSchema } from "./vehiculo";

const base = { placa: "ABC123", marca: "Mazda", modelo: "3" };

describe("vehiculoInputSchema — campos de Fase 15", () => {
  it("usa CARRO como tipo por defecto", () => {
    expect(vehiculoInputSchema.parse(base).tipo).toBe("CARRO");
  });

  it("normaliza el VIN a mayúsculas y sin espacios", () => {
    const r = vehiculoInputSchema.parse({ ...base, vin: " 9bwzzz377vt004251 " });
    expect(r.vin).toBe("9BWZZZ377VT004251");
  });

  it("rechaza VIN con longitud distinta de 17 o con I/O/Q", () => {
    for (const vin of ["9BWZZZ377VT00425", "9BWZZZ377VT00425I", "OBWZZZ377VT004251"]) {
      const r = vehiculoInputSchema.safeParse({ ...base, vin });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0]?.message).toBe(MENSAJE_VIN_INVALIDO);
    }
  });

  it("acepta fechas de vencimiento como string YYYY-MM-DD", () => {
    const r = vehiculoInputSchema.parse({ ...base, soatVence: "2026-11-30", tecnomecanicaVence: "2027-01-15" });
    expect(r.soatVence?.toISOString()).toBe("2026-11-30T00:00:00.000Z");
    expect(r.tecnomecanicaVence?.toISOString()).toBe("2027-01-15T00:00:00.000Z");
  });
});

describe("placaFormatoHabitual", () => {
  it("valida carro/camioneta/camión como ABC123", () => {
    expect(placaFormatoHabitual("ABC123", "CARRO")).toBe(true);
    expect(placaFormatoHabitual("abc-123", "CAMION")).toBe(true);
    expect(placaFormatoHabitual("ABC12D", "CAMIONETA")).toBe(false);
  });

  it("valida moto como ABC12D", () => {
    expect(placaFormatoHabitual("ABC12D", "MOTO")).toBe(true);
    expect(placaFormatoHabitual("ABC123", "MOTO")).toBe(false);
  });
});
```

Run: `npx vitest run --project unit src/lib/validation/vehiculo.test.ts` → FAIL (exports inexistentes).

- [ ] **Step 5: Implementar validación**

En `src/lib/validation/vehiculo.ts`:

```ts
export const tipoVehiculoSchema = z.enum(["CARRO", "MOTO", "CAMIONETA", "CAMION"]);
export type TipoVehiculoValor = z.infer<typeof tipoVehiculoSchema>;

export const MENSAJE_VIN_INVALIDO = "El VIN debe tener 17 caracteres (letras y números, sin I, O ni Q)";
const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

const vinSchema = z
  .string()
  .transform((valor) => valor.replace(/\s+/g, "").toUpperCase())
  .refine((valor) => VIN_REGEX.test(valor), MENSAJE_VIN_INVALIDO);

/**
 * Formato habitual de placa colombiana según el tipo. Solo alimenta un aviso
 * NO bloqueante en el formulario: placas antiguas, diplomáticas o de remolque
 * no siguen el patrón y deben poder guardarse igual.
 */
export function placaFormatoHabitual(placa: string, tipo: TipoVehiculoValor): boolean {
  const normalizada = placa.replace(/[\s-]/g, "").toUpperCase();
  return tipo === "MOTO" ? /^[A-Z]{3}\d{2}[A-Z]$/.test(normalizada) : /^[A-Z]{3}\d{3}$/.test(normalizada);
}
```

y dentro de `vehiculoInputSchema`, después de `observaciones`:

```ts
  tipo: tipoVehiculoSchema.default("CARRO"),
  vin: vinSchema.optional(),
  soatVence: z.coerce.date().optional(),
  tecnomecanicaVence: z.coerce.date().optional(),
```

Run el test del Step 4 → PASS.

- [ ] **Step 6: Tests de actions (fallan)**

En `src/app/actions/vehiculo-actions.test.ts` agregar:

```ts
describe("Fase 15 — campos de tipo, VIN y vencimientos", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockCreate.mockReset().mockResolvedValue({ id: "v1" });
    mockUpdate.mockReset().mockResolvedValue({ clienteId: "c1" });
  });

  function formBase(): FormData {
    const formData = new FormData();
    formData.set("placa", "ABC12D");
    formData.set("marca", "Yamaha");
    formData.set("modelo", "NMAX");
    return formData;
  }

  it("createVehiculoAction guarda tipo, VIN y vencimientos", async () => {
    const formData = formBase();
    formData.set("tipo", "MOTO");
    formData.set("vin", "9bwzzz377vt004251");
    formData.set("soatVence", "2026-11-30");
    formData.set("tecnomecanicaVence", "2027-01-15");

    await createVehiculoAction("c1", initialState, formData);

    const data = mockCreate.mock.calls[0][0].data;
    expect(data.tipo).toBe("MOTO");
    expect(data.vin).toBe("9BWZZZ377VT004251");
    expect(data.soatVence.toISOString()).toBe("2026-11-30T00:00:00.000Z");
    expect(data.tecnomecanicaVence.toISOString()).toBe("2027-01-15T00:00:00.000Z");
  });

  it("updateVehiculoAction limpia VIN y vencimientos cuando llegan vacíos", async () => {
    const formData = formBase();
    formData.set("vin", "");
    formData.set("soatVence", "");
    formData.set("tecnomecanicaVence", "");

    await updateVehiculoAction("v1", initialState, formData);

    const data = mockUpdate.mock.calls[0][0].data;
    expect(data.tipo).toBe("CARRO");
    expect(data.vin).toBeNull();
    expect(data.soatVence).toBeNull();
    expect(data.tecnomecanicaVence).toBeNull();
  });

  it("rechaza un VIN inválido sin tocar la base", async () => {
    const formData = formBase();
    formData.set("vin", "123");
    const result = await createVehiculoAction("c1", initialState, formData);
    expect(result.success).toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
```

Run: `npx vitest run --project unit src/app/actions/vehiculo-actions.test.ts` → FAIL.

- [ ] **Step 7: Implementar en las actions**

En `createVehiculoAction` y `updateVehiculoAction`, agregar al objeto de `safeParse`:

```ts
    tipo: formData.get("tipo") || undefined,
    vin: formData.get("vin") || undefined,
    soatVence: formData.get("soatVence") || undefined,
    tecnomecanicaVence: formData.get("tecnomecanicaVence") || undefined,
```

En el `data` de `create`:

```ts
        tipo: parsed.data.tipo,
        vin: parsed.data.vin,
        soatVence: parsed.data.soatVence,
        tecnomecanicaVence: parsed.data.tecnomecanicaVence,
```

En el `data` de `update` (con `?? null`: un campo vaciado en el formulario debe borrarse, no quedar intacto — a diferencia de los campos viejos, que conservan su comportamiento):

```ts
        tipo: parsed.data.tipo,
        vin: parsed.data.vin ?? null,
        soatVence: parsed.data.soatVence ?? null,
        tecnomecanicaVence: parsed.data.tecnomecanicaVence ?? null,
```

Además `revalidatePath("/vencimientos")` en ambas actions tras el éxito.

Si algún test existente compara el `data` completo con `toEqual`/`toHaveBeenCalledWith`, actualizarlo agregando `tipo: "CARRO"` (y `vin/soatVence/tecnomecanicaVence: null` en update).

- [ ] **Step 8: Verificar y commit**

Run: `npx tsc --noEmit && npm test`
Expected: sin errores; todos los tests PASS.

```bash
git add prisma/tenant src/lib/validation src/app/actions/vehiculo-actions.ts src/app/actions/vehiculo-actions.test.ts
git commit -m "fase15-task 1: esquema y persistencia de tipo, VIN y vencimientos del vehículo"
git push
```

(`src/generated/` está en `.gitignore`: el cliente se regenera, no se commitea.)

---

### Task 2: Lógica de dominio de vencimientos (pura) y `urlWhatsapp` compartido

**Files:**
- Create: `src/lib/vencimientos/estado-vencimiento.ts`, `src/lib/vencimientos/estado-vencimiento.test.ts`
- Create: `src/lib/vencimientos/plantilla.ts`, `src/lib/vencimientos/plantilla.test.ts`
- Create: `src/lib/whatsapp/url.ts`, `src/lib/whatsapp/url.test.ts`
- Modify: `src/lib/pedido-compra/pedido-compra.ts` (quitar `urlWhatsapp`), `src/lib/pedido-compra/pedido-compra.test.ts` (mover sus tests), `src/app/actions/pedido-compra-actions.ts` (import)
- Modify: `src/lib/recordatorios/plantilla.ts` (exportar `escaparHtml`)

**Interfaces:**
- Produces:
  - `type TipoDocumento = "SOAT" | "TECNOMECANICA"`
  - `type EstadoVencimiento = "SIN_DATO" | "VIGENTE" | "POR_VENCER" | "PROXIMO" | "VENCIDO"`
  - `DIAS_PROXIMO = 7`, `DIAS_AVISO_POR_DEFECTO = 30`, `VENTANA_VENCIDOS_EMAIL_DIAS = 30`
  - `diasHastaVencimiento(fecha: Date, ahora: Date): number`
  - `estadoVencimiento(fecha: Date | null, ahora: Date, diasAviso: number): EstadoVencimiento`
  - `requiereAviso(estado: EstadoVencimiento): boolean`
  - `fechaLimiteAviso(ahora: Date, diasAviso: number): Date` (medianoche UTC del día hoy+diasAviso)
  - `fechaIsoAUtc(iso: string): Date`
  - `formatoFechaVencimiento: Intl.DateTimeFormat` (es-CO, `timeZone: "UTC"`)
  - `NOMBRE_DOCUMENTO: Record<TipoDocumento, string>`
  - `interface DatosAvisoVencimiento { clienteNombre: string; placa: string; tipo: TipoDocumento; fechaVencimiento: Date; tallerNombre: string; ahora: Date }`
  - `textoAvisoVencimiento(datos): string`, `construirMensajeAvisoVencimiento(para: string, datos): MensajeEmail`
  - `urlWhatsapp(telefono: string | null, texto: string): string | null` en `@/lib/whatsapp/url`
  - `escaparHtml(valor: string): string` exportado desde `@/lib/recordatorios/plantilla`

- [ ] **Step 1: Tests de estado (fallan)**

`src/lib/vencimientos/estado-vencimiento.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  diasHastaVencimiento,
  estadoVencimiento,
  fechaLimiteAviso,
  requiereAviso,
} from "./estado-vencimiento";

// 2026-10-10 a las 22:00 en Bogotá = 2026-10-11T03:00Z: el día calendario sigue siendo el 10.
const AHORA = new Date("2026-10-11T03:00:00Z");
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("diasHastaVencimiento", () => {
  it("cuenta por día calendario de Bogotá, no por instante UTC", () => {
    expect(diasHastaVencimiento(d("2026-10-10"), AHORA)).toBe(0);
    expect(diasHastaVencimiento(d("2026-10-11"), AHORA)).toBe(1);
    expect(diasHastaVencimiento(d("2026-10-09"), AHORA)).toBe(-1);
  });
});

describe("estadoVencimiento", () => {
  it("SIN_DATO sin fecha", () => {
    expect(estadoVencimiento(null, AHORA, 30)).toBe("SIN_DATO");
  });

  it("bordes con diasAviso = 30", () => {
    expect(estadoVencimiento(d("2026-10-09"), AHORA, 30)).toBe("VENCIDO");
    expect(estadoVencimiento(d("2026-10-10"), AHORA, 30)).toBe("PROXIMO");
    expect(estadoVencimiento(d("2026-10-17"), AHORA, 30)).toBe("PROXIMO");
    expect(estadoVencimiento(d("2026-10-18"), AHORA, 30)).toBe("POR_VENCER");
    expect(estadoVencimiento(d("2026-11-09"), AHORA, 30)).toBe("POR_VENCER");
    expect(estadoVencimiento(d("2026-11-10"), AHORA, 30)).toBe("VIGENTE");
  });

  it("con diasAviso menor que 7, PROXIMO no se sale de la ventana", () => {
    expect(estadoVencimiento(d("2026-10-15"), AHORA, 5)).toBe("PROXIMO");
    expect(estadoVencimiento(d("2026-10-16"), AHORA, 5)).toBe("VIGENTE");
  });
});

describe("requiereAviso", () => {
  it("solo PROXIMO, POR_VENCER y VENCIDO", () => {
    expect(["SIN_DATO", "VIGENTE", "POR_VENCER", "PROXIMO", "VENCIDO"].map((e) => requiereAviso(e as never))).toEqual([
      false,
      false,
      true,
      true,
      true,
    ]);
  });
});

describe("fechaLimiteAviso", () => {
  it("devuelve medianoche UTC del día hoy + diasAviso (Bogotá)", () => {
    expect(fechaLimiteAviso(AHORA, 30).toISOString()).toBe("2026-11-09T00:00:00.000Z");
  });
});
```

Run: `npx vitest run --project unit src/lib/vencimientos` → FAIL.

- [ ] **Step 2: Implementar estado**

`src/lib/vencimientos/estado-vencimiento.ts`:

```ts
import { formatoDiaBogota } from "@/lib/fecha-bogota";

/**
 * Reglas de vencimiento de documentos del vehículo (SOAT / revisión
 * técnico-mecánica). Puro y sin Prisma: lo usan el barrido de email, la vista
 * /vencimientos, el detalle del vehículo y la nueva orden.
 *
 * Las fechas son columnas @db.Date, que Prisma entrega como medianoche UTC. Se
 * comparan como FECHA CALENDARIO contra "hoy en Bogotá": convertirlas a hora
 * de Bogotá las correría un día hacia atrás.
 */
export type TipoDocumento = "SOAT" | "TECNOMECANICA";
export type EstadoVencimiento = "SIN_DATO" | "VIGENTE" | "POR_VENCER" | "PROXIMO" | "VENCIDO";

export const DIAS_PROXIMO = 7;
export const DIAS_AVISO_POR_DEFECTO = 30;
/** El barrido de email no persigue indefinidamente a documentos vencidos hace mucho. */
export const VENTANA_VENCIDOS_EMAIL_DIAS = 30;

const MS_DIA = 24 * 60 * 60 * 1000;

export const NOMBRE_DOCUMENTO: Record<TipoDocumento, string> = {
  SOAT: "SOAT",
  TECNOMECANICA: "revisión técnico-mecánica",
};

/** Para mostrar una columna @db.Date sin correrla de día. */
export const formatoFechaVencimiento = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "UTC" });

export function fechaIsoAUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function hoyBogotaUtc(ahora: Date): Date {
  return fechaIsoAUtc(formatoDiaBogota.format(ahora));
}

export function diasHastaVencimiento(fecha: Date, ahora: Date): number {
  const vence = fechaIsoAUtc(fecha.toISOString().slice(0, 10));
  return Math.round((vence.getTime() - hoyBogotaUtc(ahora).getTime()) / MS_DIA);
}

export function estadoVencimiento(fecha: Date | null, ahora: Date, diasAviso: number): EstadoVencimiento {
  if (!fecha) return "SIN_DATO";
  const dias = diasHastaVencimiento(fecha, ahora);
  if (dias < 0) return "VENCIDO";
  if (dias <= Math.min(DIAS_PROXIMO, diasAviso)) return "PROXIMO";
  if (dias <= diasAviso) return "POR_VENCER";
  return "VIGENTE";
}

export function requiereAviso(estado: EstadoVencimiento): boolean {
  return estado === "PROXIMO" || estado === "POR_VENCER" || estado === "VENCIDO";
}

/** Último día (inclusive) que entra en la ventana de aviso, como medianoche UTC. */
export function fechaLimiteAviso(ahora: Date, diasAviso: number): Date {
  return new Date(hoyBogotaUtc(ahora).getTime() + diasAviso * MS_DIA);
}

/** Primer día (inclusive) de vencidos que el barrido de email todavía avisa. */
export function fechaInicioVencidosEmail(ahora: Date): Date {
  return new Date(hoyBogotaUtc(ahora).getTime() - VENTANA_VENCIDOS_EMAIL_DIAS * MS_DIA);
}
```

Run: tests del Step 1 → PASS.

- [ ] **Step 3: Mover `urlWhatsapp`**

Crear `src/lib/whatsapp/url.ts` con la función **idéntica** (incluido su comentario) que hoy está en `src/lib/pedido-compra/pedido-compra.ts:64-75`; borrarla de `pedido-compra.ts`; en `src/app/actions/pedido-compra-actions.ts` importarla desde `@/lib/whatsapp/url`; mover el `describe("urlWhatsapp", ...)` de `pedido-compra.test.ts` a `src/lib/whatsapp/url.test.ts` (importando desde `./url`). Buscar otros usos con `grep -rn "urlWhatsapp" src --include=*.ts` y actualizarlos.

- [ ] **Step 4: Exportar `escaparHtml`**

En `src/lib/recordatorios/plantilla.ts` cambiar `function escaparHtml` por `export function escaparHtml` (sin cambiar su cuerpo).

- [ ] **Step 5: Tests de plantilla (fallan)**

`src/lib/vencimientos/plantilla.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { construirMensajeAvisoVencimiento, textoAvisoVencimiento } from "./plantilla";

const AHORA = new Date("2026-10-10T15:00:00Z");
const base = {
  clienteNombre: "Ana <b>Pérez</b>",
  placa: "ABC123",
  tipo: "SOAT" as const,
  fechaVencimiento: new Date("2026-10-30T00:00:00Z"),
  tallerNombre: "Taller Pérez",
  ahora: AHORA,
};

describe("textoAvisoVencimiento", () => {
  it("habla de 'vence el' cuando aún no vence, con la fecha sin correrse de día", () => {
    const texto = textoAvisoVencimiento(base);
    expect(texto).toContain("SOAT");
    expect(texto).toContain("ABC123");
    expect(texto).toContain("vence el 30 oct 2026");
    expect(texto).toContain("Taller Pérez");
  });

  it("habla de 'venció el' cuando ya venció", () => {
    const texto = textoAvisoVencimiento({ ...base, tipo: "TECNOMECANICA", fechaVencimiento: new Date("2026-10-01T00:00:00Z") });
    expect(texto).toContain("revisión técnico-mecánica");
    expect(texto).toContain("venció el 1 oct 2026");
  });
});

describe("construirMensajeAvisoVencimiento", () => {
  it("arma asunto y escapa el HTML", () => {
    const mensaje = construirMensajeAvisoVencimiento("ana@cliente.test", base);
    expect(mensaje.para).toBe("ana@cliente.test");
    expect(mensaje.asunto).toBe("Vencimiento de SOAT — ABC123");
    expect(mensaje.html).toContain("Ana &lt;b&gt;Pérez&lt;/b&gt;");
    expect(mensaje.html).not.toContain("<b>Pérez</b>");
  });
});
```

(Si `Intl` del entorno de test formatea `dateStyle: "medium"` distinto — p. ej. "30 oct. 2026" —, ajustar la aserción al formato real que produce `formatoFechaVencimiento`; lo importante es el día 30, no el 29.)

Run: `npx vitest run --project unit src/lib/vencimientos/plantilla.test.ts` → FAIL.

- [ ] **Step 6: Implementar plantilla**

`src/lib/vencimientos/plantilla.ts`:

```ts
import type { MensajeEmail } from "@/lib/email/enviar-email";
import { escaparHtml } from "@/lib/recordatorios/plantilla";
import {
  diasHastaVencimiento,
  formatoFechaVencimiento,
  NOMBRE_DOCUMENTO,
  type TipoDocumento,
} from "./estado-vencimiento";

export interface DatosAvisoVencimiento {
  clienteNombre: string;
  placa: string;
  tipo: TipoDocumento;
  fechaVencimiento: Date;
  tallerNombre: string;
  ahora: Date;
}

function frase(datos: DatosAvisoVencimiento): string {
  const documento = NOMBRE_DOCUMENTO[datos.tipo];
  const fecha = formatoFechaVencimiento.format(datos.fechaVencimiento);
  const verbo = diasHastaVencimiento(datos.fechaVencimiento, datos.ahora) < 0 ? "venció" : "vence";
  return `el ${documento} de tu vehículo ${datos.placa} ${verbo} el ${fecha}`;
}

/** Texto plano: cuerpo del email y mensaje de WhatsApp. */
export function textoAvisoVencimiento(datos: DatosAvisoVencimiento): string {
  return [
    `Hola ${datos.clienteNombre},`,
    "",
    `Te recordamos que ${frase(datos)}.`,
    "Circular con este documento vencido puede generar multas e inmovilización del vehículo.",
    "",
    `— ${datos.tallerNombre}`,
  ].join("\n");
}

export function construirMensajeAvisoVencimiento(para: string, datos: DatosAvisoVencimiento): MensajeEmail {
  const html = [
    `<p>Hola ${escaparHtml(datos.clienteNombre)},</p>`,
    `<p>Te recordamos que ${escaparHtml(frase(datos))}.</p>`,
    "<p>Circular con este documento vencido puede generar multas e inmovilización del vehículo.</p>",
    `<p>— ${escaparHtml(datos.tallerNombre)}</p>`,
  ].join("");

  return {
    para,
    asunto: `Vencimiento de ${NOMBRE_DOCUMENTO[datos.tipo]} — ${datos.placa}`,
    texto: textoAvisoVencimiento(datos),
    html,
  };
}
```

Nota: el test del asunto usa SOAT; para TECNOMECANICA el asunto será "Vencimiento de revisión técnico-mecánica — ABC123".

Run: tests → PASS.

- [ ] **Step 7: Verificar y commit**

Run: `npx tsc --noEmit && npm test` → todo PASS.

```bash
git add src/lib/vencimientos src/lib/whatsapp src/lib/pedido-compra src/lib/recordatorios/plantilla.ts src/app/actions/pedido-compra-actions.ts
git commit -m "fase15-task 2: lógica de vencimientos, plantilla de aviso y urlWhatsapp compartido"
git push
```

---

### Task 3: Formulario y detalle del vehículo

**Files:**
- Modify: `src/app/(dashboard)/clientes/[id]/vehiculo-form-fields.tsx`
- Modify: `src/app/(dashboard)/clientes/[id]/nuevo-vehiculo-form.tsx`, `editar-vehiculo-form.tsx` (defaults + `formData.set` del select de tipo)
- Create: `src/components/vencimiento-badge.tsx`, `src/components/vencimiento-badge.test.tsx`
- Modify: `src/app/(dashboard)/vehiculos/[id]/page.tsx`
- Test: `src/app/(dashboard)/clientes/[id]/nuevo-vehiculo-form.test.tsx`, `editar-vehiculo-form.test.tsx`

**Interfaces:**
- Consumes: `tipoVehiculoSchema`, `placaFormatoHabitual`, `TipoVehiculoValor` (Task 1); `estadoVencimiento`, `formatoFechaVencimiento`, `EstadoVencimiento`, `DIAS_AVISO_POR_DEFECTO` (Task 2).
- Produces: `<VencimientoBadge estado={EstadoVencimiento} fecha={Date | null} />` en `@/components/vencimiento-badge`; `ETIQUETA_TIPO_VEHICULO: Record<TipoVehiculoValor, string>` exportado desde `src/lib/validation/vehiculo.ts`.

- [ ] **Step 1: Etiquetas de tipo**

En `src/lib/validation/vehiculo.ts`:

```ts
export const ETIQUETA_TIPO_VEHICULO: Record<TipoVehiculoValor, string> = {
  CARRO: "Carro",
  MOTO: "Moto",
  CAMIONETA: "Camioneta",
  CAMION: "Camión",
};
```

- [ ] **Step 2: Test de la insignia (falla)**

`src/components/vencimiento-badge.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VencimientoBadge } from "./vencimiento-badge";

describe("VencimientoBadge", () => {
  it("muestra 'Sin registrar' sin fecha", () => {
    render(<VencimientoBadge estado="SIN_DATO" fecha={null} />);
    expect(screen.getByText("Sin registrar")).toBeInTheDocument();
  });

  it("muestra estado y fecha sin correrla de día", () => {
    render(<VencimientoBadge estado="VENCIDO" fecha={new Date("2026-09-12T00:00:00Z")} />);
    expect(screen.getByText(/Vencido/)).toBeInTheDocument();
    expect(screen.getByText(/12 sept? 2026/)).toBeInTheDocument();
  });
});
```

Run: `npx vitest run --project unit src/components/vencimiento-badge.test.tsx` → FAIL.

- [ ] **Step 3: Implementar la insignia**

`src/components/vencimiento-badge.tsx` (mismo patrón "dot-in-pill" que `vehiculos/[id]/page.tsx`):

```tsx
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatoFechaVencimiento, type EstadoVencimiento } from "@/lib/vencimientos/estado-vencimiento";

const ETIQUETA: Record<EstadoVencimiento, string> = {
  SIN_DATO: "Sin registrar",
  VIGENTE: "Vigente",
  POR_VENCER: "Por vencer",
  PROXIMO: "Vence pronto",
  VENCIDO: "Vencido",
};

const DOT: Record<EstadoVencimiento, string> = {
  SIN_DATO: "oklch(0.7 0 0)",
  VIGENTE: "oklch(0.4 0.1 150)",
  POR_VENCER: "oklch(0.7 0.15 85)",
  PROXIMO: "oklch(0.55 0.15 60)",
  VENCIDO: "oklch(0.5 0.2 27)",
};

const CLASE: Record<EstadoVencimiento, string> = {
  SIN_DATO: "",
  VIGENTE: "border-transparent bg-[oklch(0.4_0.1_150/0.1)] text-[oklch(0.4_0.1_150)]",
  POR_VENCER: "border-transparent bg-[oklch(0.7_0.15_85/0.15)] text-[oklch(0.5_0.12_85)]",
  PROXIMO: "border-transparent bg-[oklch(0.7_0.15_60/0.15)] text-[oklch(0.55_0.15_60)]",
  VENCIDO: "border-transparent bg-[oklch(0.5_0.2_27/0.1)] text-[oklch(0.5_0.2_27)]",
};

export function VencimientoBadge({ estado, fecha }: { estado: EstadoVencimiento; fecha: Date | null }) {
  return (
    <Badge variant={estado === "SIN_DATO" ? "outline" : "default"} className={cn("gap-1.5", CLASE[estado])}>
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: DOT[estado] }} />
      {ETIQUETA[estado]}
      {fecha ? <span className="font-mono">· {formatoFechaVencimiento.format(fecha)}</span> : null}
    </Badge>
  );
}
```

Run: test → PASS.

- [ ] **Step 4: Campos del formulario**

En `vehiculo-form-fields.tsx`:
1. Extender `vehiculoFormSchema` con `blankToUndefined` para `vin`, `soatVence`, `tecnomecanicaVence` (igual que `proximoMantenimiento`).
2. `const { field: tipoField } = useController({ name: "tipo", control });` y leer la placa con `useWatch({ control, name: "placa" })` (importar `useWatch` de `react-hook-form`).
3. Grupo **Identificación**: a la par de Placa (`sm:col-span-2`), agregar **Tipo** (`SelectField`, `sm:col-span-2`, items desde `ETIQUETA_TIPO_VEHICULO`, sin opción vacía) y **VIN** (`Input`, `sm:col-span-2`, `className="font-mono uppercase"`, `maxLength={17}`, error en `errors.vin`).
4. Debajo de la placa, el aviso no bloqueante:

```tsx
{placa && !placaFormatoHabitual(placa, (tipoField.value as TipoVehiculoValor | undefined) ?? "CARRO") ? (
  <p className="text-xs text-[oklch(0.55_0.15_60)]">El formato de placa no es el habitual para este tipo de vehículo.</p>
) : null}
```

5. Grupo nuevo **Vencimientos** (antes de "Notas"), dos `Input type="date"`: `soatVence` ("SOAT vence") y `tecnomecanicaVence` ("Tecnomecánica vence"), con el mismo patrón de error/aria que `proximoMantenimiento`.

En `nuevo-vehiculo-form.tsx`: defaults `tipo: "CARRO", vin: "", soatVence: "", tecnomecanicaVence: ""` y `formData.set("tipo", (data.tipo as string | undefined) ?? "CARRO");` junto a los demás `formData.set` de SelectFields.

En `editar-vehiculo-form.tsx`: defaults `tipo: vehiculo.tipo, vin: vehiculo.vin ?? "", soatVence: toDateInputValue(vehiculo.soatVence), tecnomecanicaVence: toDateInputValue(vehiculo.tecnomecanicaVence)` (el `toDateInputValue` existente usa `toISOString().slice(0, 10)`, correcto para `@db.Date`) y el mismo `formData.set("tipo", ...)`.

Actualizar el comentario "same exact 9-field, 4-group layout" del archivo con el nuevo conteo.

- [ ] **Step 5: Tests de formulario**

En `nuevo-vehiculo-form.test.tsx` agregar (adaptando al helper de render que ya use el archivo):

```tsx
it("muestra aviso no bloqueante si la placa no tiene el formato del tipo", async () => {
  // render del formulario como en los tests existentes
  await user.type(screen.getByLabelText("Placa"), "ABC12D");
  expect(screen.getByText("El formato de placa no es el habitual para este tipo de vehículo.")).toBeInTheDocument();
});

it("envía tipo, VIN y vencimientos", async () => {
  // llenar placa/marca/modelo como en los tests existentes, luego:
  await user.type(screen.getByLabelText("VIN"), "9BWZZZ377VT004251");
  await user.type(screen.getByLabelText("SOAT vence"), "2026-11-30");
  // submit y comprobar que el FormData enviado a createVehiculoAction trae
  // tipo=CARRO, vin=9BWZZZ377VT004251 y soatVence=2026-11-30
});
```

En `editar-vehiculo-form.test.tsx`: un test que renderiza con `soatVence: new Date("2026-11-30T00:00:00Z")` y verifica que el input muestra `2026-11-30`. Agregar `tipo/vin/soatVence/tecnomecanicaVence` a los fixtures de `Vehiculo` que lo requieran por tipos.

- [ ] **Step 6: Detalle del vehículo**

En `src/app/(dashboard)/vehiculos/[id]/page.tsx`, en la tarjeta de datos del vehículo:
- Filas "Tipo" (`ETIQUETA_TIPO_VEHICULO[vehiculo.tipo]`) y "VIN" (`vehiculo.vin ?? "—"`, `font-mono`).
- Bloque "Vencimientos" con dos filas: "SOAT" → `<VencimientoBadge estado={estadoVencimiento(vehiculo.soatVence, ahora, diasAviso)} fecha={vehiculo.soatVence} />` y "Tecnomecánica" igual con `tecnomecanicaVence`.
- `const ahora = new Date();` y `diasAviso` = `DIAS_AVISO_POR_DEFECTO` en esta tarea (Task 4 lo cambia por la configuración real).

- [ ] **Step 7: Verificar y commit**

Run: `npx tsc --noEmit && npm test` → PASS.

```bash
git add src/components/vencimiento-badge.tsx src/components/vencimiento-badge.test.tsx "src/app/(dashboard)/clientes/[id]" "src/app/(dashboard)/vehiculos/[id]/page.tsx" src/lib/validation/vehiculo.ts
git commit -m "fase15-task 3: tipo, VIN y vencimientos en formulario y detalle del vehículo"
git push
```

---

### Task 4: Configuración de días de aviso

**Files:**
- Create: `src/lib/vencimientos/configuracion.ts`, `src/lib/vencimientos/configuracion.test.ts`
- Create: `src/app/actions/configuracion-taller-actions.ts`, `src/app/actions/configuracion-taller-actions.test.ts`
- Create: `src/app/(dashboard)/configuracion-smtp/recordatorios-form.tsx`, `recordatorios-form.test.tsx`
- Modify: `src/app/(dashboard)/configuracion-smtp/page.tsx`
- Modify: `src/app/(dashboard)/vehiculos/[id]/page.tsx` (usar días reales)

**Interfaces:**
- Consumes: `DIAS_AVISO_POR_DEFECTO` (Task 2), `tenantDb.configuracionTaller` (Task 1).
- Produces:
  - `CONFIGURACION_TALLER_ID = "singleton"`, `DIAS_AVISO_MIN = 1`, `DIAS_AVISO_MAX = 90`
  - `leerDiasAviso(tenantDb: { configuracionTaller: { findUnique: (args: { where: { id: string }; select: { diasAvisoVencimiento: true } }) => Promise<{ diasAvisoVencimiento: number } | null> } }): Promise<number>`
  - `getDiasAvisoVencimiento(): Promise<number>` (cualquier sesión) en `configuracion-taller-actions.ts`
  - `guardarDiasAvisoAction(prev: ConfiguracionTallerFormState, formData: FormData): Promise<ConfiguracionTallerFormState>` con `interface ConfiguracionTallerFormState { error: string | null; success: boolean }`

- [ ] **Step 1: Tests (fallan)**

`src/lib/vencimientos/configuracion.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { leerDiasAviso } from "./configuracion";

describe("leerDiasAviso", () => {
  it("usa 30 si no existe la fila", async () => {
    const tenantDb = { configuracionTaller: { findUnique: vi.fn().mockResolvedValue(null) } };
    expect(await leerDiasAviso(tenantDb)).toBe(30);
  });

  it("usa el valor guardado", async () => {
    const tenantDb = { configuracionTaller: { findUnique: vi.fn().mockResolvedValue({ diasAvisoVencimiento: 45 }) } };
    expect(await leerDiasAviso(tenantDb)).toBe(45);
  });
});
```

`src/app/actions/configuracion-taller-actions.test.ts` (mismo patrón de mocks que `vehiculo-actions.test.ts`):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: vi.fn(),
}));
const mockUpsert = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({ configuracionTaller: { upsert: mockUpsert, findUnique: vi.fn() } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { guardarDiasAvisoAction } from "./configuracion-taller-actions";

const inicial = { error: null, success: false };

describe("guardarDiasAvisoAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockUpsert.mockReset().mockResolvedValue({});
  });

  it("exige ADMIN", async () => {
    const fd = new FormData();
    fd.set("diasAvisoVencimiento", "15");
    await guardarDiasAvisoAction(inicial, fd);
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
  });

  it("guarda con upsert sobre el singleton", async () => {
    const fd = new FormData();
    fd.set("diasAvisoVencimiento", "15");
    const r = await guardarDiasAvisoAction(inicial, fd);
    expect(r).toEqual({ error: null, success: true });
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { id: "singleton" },
      create: { id: "singleton", diasAvisoVencimiento: 15 },
      update: { diasAvisoVencimiento: 15 },
    });
  });

  it.each(["0", "91", "abc", ""])("rechaza %s", async (valor) => {
    const fd = new FormData();
    fd.set("diasAvisoVencimiento", valor);
    const r = await guardarDiasAvisoAction(inicial, fd);
    expect(r.success).toBe(false);
    expect(r.error).toBe("Ingresa un número de días entre 1 y 90");
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
```

Run: `npx vitest run --project unit src/lib/vencimientos/configuracion.test.ts src/app/actions/configuracion-taller-actions.test.ts` → FAIL.

- [ ] **Step 2: Implementar**

`src/lib/vencimientos/configuracion.ts`:

```ts
import { DIAS_AVISO_POR_DEFECTO } from "./estado-vencimiento";

export const CONFIGURACION_TALLER_ID = "singleton";
export const DIAS_AVISO_MIN = 1;
export const DIAS_AVISO_MAX = 90;

interface LectorConfiguracion {
  configuracionTaller: {
    findUnique(args: {
      where: { id: string };
      select: { diasAvisoVencimiento: true };
    }): Promise<{ diasAvisoVencimiento: number } | null>;
  };
}

/** Sin fila (taller que nunca guardó la configuración) se usa el valor por defecto. */
export async function leerDiasAviso(tenantDb: LectorConfiguracion): Promise<number> {
  const fila = await tenantDb.configuracionTaller.findUnique({
    where: { id: CONFIGURACION_TALLER_ID },
    select: { diasAvisoVencimiento: true },
  });
  return fila?.diasAvisoVencimiento ?? DIAS_AVISO_POR_DEFECTO;
}
```

`src/app/actions/configuracion-taller-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import {
  CONFIGURACION_TALLER_ID,
  DIAS_AVISO_MAX,
  DIAS_AVISO_MIN,
  leerDiasAviso,
} from "@/lib/vencimientos/configuracion";

export interface ConfiguracionTallerFormState {
  error: string | null;
  success: boolean;
}

const MENSAJE_RANGO = `Ingresa un número de días entre ${DIAS_AVISO_MIN} y ${DIAS_AVISO_MAX}`;

const diasSchema = z.coerce
  .number({ error: MENSAJE_RANGO })
  .int(MENSAJE_RANGO)
  .min(DIAS_AVISO_MIN, MENSAJE_RANGO)
  .max(DIAS_AVISO_MAX, MENSAJE_RANGO);

export async function getDiasAvisoVencimiento(): Promise<number> {
  const session = await requireSession();
  return leerDiasAviso(getTenantDb(session.user.tenantSchema));
}

export async function guardarDiasAvisoAction(
  prevState: ConfiguracionTallerFormState,
  formData: FormData,
): Promise<ConfiguracionTallerFormState> {
  const session = await requireRole(["ADMIN"]);
  const crudo = formData.get("diasAvisoVencimiento");
  // z.coerce.number turns "" into 0, which the min() check rejects -- but be
  // explicit so an empty field never reads as "0 días".
  const parsed = crudo === null || crudo === "" ? null : diasSchema.safeParse(crudo);
  if (!parsed || !parsed.success) return { error: MENSAJE_RANGO, success: false };

  const tenantDb = getTenantDb(session.user.tenantSchema);
  await tenantDb.configuracionTaller.upsert({
    where: { id: CONFIGURACION_TALLER_ID },
    create: { id: CONFIGURACION_TALLER_ID, diasAvisoVencimiento: parsed.data },
    update: { diasAvisoVencimiento: parsed.data },
  });

  revalidatePath("/configuracion-smtp");
  revalidatePath("/vencimientos");
  return { error: null, success: true };
}
```

Run tests → PASS.

- [ ] **Step 3: Formulario en `/configuracion-smtp`**

`recordatorios-form.tsx` (client component con `useActionState(guardarDiasAvisoAction, { error: null, success: false })`, igual de estilo que `configuracion-smtp-form.tsx`): un `Input type="number" min=1 max=90 name="diasAvisoVencimiento" defaultValue={diasAviso}` con label "Días de anticipación para avisos de vencimiento", texto de ayuda "Se avisa al cliente cuando su SOAT o tecnomecánica vence dentro de este plazo.", botón "Guardar", `toast.success("Configuración guardada")` al éxito y el error en `<p className="text-xs text-destructive">`.

Test `recordatorios-form.test.tsx`: muestra el valor inicial recibido por prop y el mensaje de error devuelto por la action (mockear `@/app/actions/configuracion-taller-actions`).

En `page.tsx`: agregar `getDiasAvisoVencimiento()` al `Promise.all` y, debajo de la tarjeta "Servidor", una `Card` "Recordatorios" con `<RecordatoriosForm diasAviso={diasAviso} />`. Actualizar el párrafo descriptivo de la página: "...envía los recordatorios de mantenimiento y los avisos de vencimiento de SOAT y tecnomecánica usando...".

- [ ] **Step 4: Detalle del vehículo usa la configuración**

En `vehiculos/[id]/page.tsx` reemplazar `DIAS_AVISO_POR_DEFECTO` por `await getDiasAvisoVencimiento()` (dentro del `Promise.all` existente si lo hay).

- [ ] **Step 5: Verificar y commit**

Run: `npx tsc --noEmit && npm test` → PASS.

```bash
git add src/lib/vencimientos/configuracion* src/app/actions/configuracion-taller-actions* "src/app/(dashboard)/configuracion-smtp" "src/app/(dashboard)/vehiculos/[id]/page.tsx"
git commit -m "fase15-task 4: configuración de días de aviso de vencimientos"
git push
```

---

### Task 5: Barrido de email de vencimientos en el cron

**Files:**
- Create: `src/lib/vencimientos/ejecutar-avisos.ts`, `src/lib/vencimientos/ejecutar-avisos.test.ts`
- Create: `src/lib/vencimientos/gateway-prisma.ts`
- Modify: `src/lib/recordatorios/ejecutar-recordatorios.ts` (exportar `describirError`)
- Modify: `src/app/api/cron/recordatorios/route.ts` (+ su test)

**Interfaces:**
- Consumes: `estadoVencimiento`, `requiereAviso`, `diasHastaVencimiento`, `fechaLimiteAviso`, `fechaInicioVencidosEmail`, `VENTANA_VENCIDOS_EMAIL_DIAS`, `TipoDocumento` (Task 2); `construirMensajeAvisoVencimiento` (Task 2); `leerDiasAviso` (Task 4); `TenantRef` y `describirError` de `ejecutar-recordatorios.ts`.
- Produces:

```ts
export interface DocumentoParaAviso {
  vehiculoId: string;
  placa: string;
  clienteNombre: string;
  clienteEmail: string | null;
  tipo: TipoDocumento;
  fechaVencimiento: Date;
  yaAvisadoPorEmail: boolean;
}
export interface RegistroAviso {
  vehiculoId: string;
  tipo: TipoDocumento;
  fechaVencimiento: Date;
  canal: "EMAIL" | "WHATSAPP";
  destino: string;
  enviadoPorId: string | null;
  enviadoAt: Date;
}
export interface AvisosGateway {
  obtenerConfiguracionSmtp(schemaName: string): Promise<ConfiguracionSmtpAlmacenada | null>;
  obtenerDiasAviso(schemaName: string): Promise<number>;
  listarDocumentosParaAviso(schemaName: string, desde: Date, hasta: Date): Promise<DocumentoParaAviso[]>;
  registrarAviso(schemaName: string, registro: RegistroAviso): Promise<void>;
}
export interface EjecutarAvisosDeps { listarTenants(): Promise<TenantRef[]>; gateway: AvisosGateway; descifrarConfiguracion(fila: ConfiguracionSmtpAlmacenada): SmtpConfigDescifrada; enviarEmail(config: SmtpConfigDescifrada, mensaje: MensajeEmail): Promise<void>; ahora: Date; }
export interface ResumenAvisos { tenantsProcesados: number; tenantsSinSmtp: number; documentosEvaluados: number; enviados: number; enviadosNoRegistrados: number; omitidosYaAvisados: number; omitidosSinEmail: number; fallidos: number; errores: string[]; }
export function ejecutarAvisosVencimiento(deps: EjecutarAvisosDeps): Promise<ResumenAvisos>;
export const prismaAvisosGateway: AvisosGateway; // gateway-prisma.ts
```

- [ ] **Step 1: Tests del barrido (fallan)**

`src/lib/vencimientos/ejecutar-avisos.test.ts` (fixtures SMTP iguales a `ejecutar-recordatorios.test.ts`):

```ts
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  ejecutarAvisosVencimiento,
  type AvisosGateway,
  type DocumentoParaAviso,
  type EjecutarAvisosDeps,
} from "./ejecutar-avisos";
import type { ConfiguracionSmtpAlmacenada, SmtpConfigDescifrada } from "@/lib/email/smtp-config";

const AHORA = new Date("2026-10-10T15:00:00Z");
const CONFIG: ConfiguracionSmtpAlmacenada = {
  host: "smtp.taller.test", puerto: 587, usuario: "avisos@taller.test", passwordCifrado: "v1:iv:tag:cipher",
  fromEmail: "avisos@taller.test", fromNombre: "Taller Pérez", activo: true,
};
const DESCIFRADA: SmtpConfigDescifrada = {
  host: "smtp.taller.test", puerto: 587, usuario: "avisos@taller.test", password: "clave",
  fromEmail: "avisos@taller.test", fromNombre: "Taller Pérez",
};

function documento(overrides: Partial<DocumentoParaAviso> = {}): DocumentoParaAviso {
  return {
    vehiculoId: "veh-1", placa: "ABC123", clienteNombre: "Ana", clienteEmail: "ana@cliente.test",
    tipo: "SOAT", fechaVencimiento: new Date("2026-10-20T00:00:00Z"), yaAvisadoPorEmail: false, ...overrides,
  };
}

let gateway: { [K in keyof AvisosGateway]: Mock };
let deps: EjecutarAvisosDeps;

beforeEach(() => {
  gateway = {
    obtenerConfiguracionSmtp: vi.fn().mockResolvedValue(CONFIG),
    obtenerDiasAviso: vi.fn().mockResolvedValue(30),
    listarDocumentosParaAviso: vi.fn().mockResolvedValue([documento()]),
    registrarAviso: vi.fn().mockResolvedValue(undefined),
  };
  deps = {
    listarTenants: vi.fn().mockResolvedValue([{ schemaName: "taller_perez" }]),
    gateway: gateway as unknown as AvisosGateway,
    descifrarConfiguracion: vi.fn().mockReturnValue(DESCIFRADA),
    enviarEmail: vi.fn().mockResolvedValue(undefined),
    ahora: AHORA,
  };
});

describe("ejecutarAvisosVencimiento", () => {
  it("envía y registra un aviso EMAIL por documento por vencer", async () => {
    const r = await ejecutarAvisosVencimiento(deps);
    expect(r.enviados).toBe(1);
    expect(deps.enviarEmail).toHaveBeenCalledTimes(1);
    expect(gateway.registrarAviso).toHaveBeenCalledWith("taller_perez", {
      vehiculoId: "veh-1", tipo: "SOAT", fechaVencimiento: new Date("2026-10-20T00:00:00Z"),
      canal: "EMAIL", destino: "ana@cliente.test", enviadoPorId: null, enviadoAt: AHORA,
    });
  });

  it("consulta la ventana [hoy-30, hoy+diasAviso]", async () => {
    gateway.obtenerDiasAviso.mockResolvedValue(15);
    await ejecutarAvisosVencimiento(deps);
    expect(gateway.listarDocumentosParaAviso).toHaveBeenCalledWith(
      "taller_perez", new Date("2026-09-10T00:00:00Z"), new Date("2026-10-25T00:00:00Z"),
    );
  });

  it("salta tenants sin SMTP o con SMTP inactivo", async () => {
    gateway.obtenerConfiguracionSmtp.mockResolvedValue({ ...CONFIG, activo: false });
    const r = await ejecutarAvisosVencimiento(deps);
    expect(r.tenantsSinSmtp).toBe(1);
    expect(deps.enviarEmail).not.toHaveBeenCalled();
  });

  it("omite documentos ya avisados por email y clientes sin email", async () => {
    gateway.listarDocumentosParaAviso.mockResolvedValue([
      documento({ yaAvisadoPorEmail: true }),
      documento({ vehiculoId: "veh-2", clienteEmail: null }),
    ]);
    const r = await ejecutarAvisosVencimiento(deps);
    expect(r.omitidosYaAvisados).toBe(1);
    expect(r.omitidosSinEmail).toBe(1);
    expect(deps.enviarEmail).not.toHaveBeenCalled();
  });

  it("ignora documentos fuera de la ventana aunque el gateway los devuelva", async () => {
    gateway.listarDocumentosParaAviso.mockResolvedValue([
      documento({ fechaVencimiento: new Date("2026-12-31T00:00:00Z") }),
      documento({ vehiculoId: "veh-3", fechaVencimiento: new Date("2026-08-01T00:00:00Z") }),
    ]);
    const r = await ejecutarAvisosVencimiento(deps);
    expect(r.enviados).toBe(0);
  });

  it("un envío fallido no se registra y cuenta como fallido", async () => {
    (deps.enviarEmail as Mock).mockRejectedValue(new TypeError("smtp caído"));
    const r = await ejecutarAvisosVencimiento(deps);
    expect(r.fallidos).toBe(1);
    expect(gateway.registrarAviso).not.toHaveBeenCalled();
    expect(r.errores[0]).toContain("TypeError");
    expect(r.errores[0]).not.toContain("smtp caído");
  });

  it("enviado pero no registrado tras reintento => enviadosNoRegistrados", async () => {
    gateway.registrarAviso.mockRejectedValue(new Error("db"));
    const r = await ejecutarAvisosVencimiento(deps);
    expect(gateway.registrarAviso).toHaveBeenCalledTimes(2);
    expect(r.enviados).toBe(1);
    expect(r.enviadosNoRegistrados).toBe(1);
    expect(r.fallidos).toBe(0);
  });

  it("un tenant que falla no aborta los demás", async () => {
    (deps.listarTenants as Mock).mockResolvedValue([{ schemaName: "roto" }, { schemaName: "taller_perez" }]);
    gateway.obtenerConfiguracionSmtp.mockImplementation(async (schema: string) => {
      if (schema === "roto") throw new Error("x");
      return CONFIG;
    });
    const r = await ejecutarAvisosVencimiento(deps);
    expect(r.fallidos).toBe(1);
    expect(r.enviados).toBe(1);
  });
});
```

Run: `npx vitest run --project unit src/lib/vencimientos/ejecutar-avisos.test.ts` → FAIL.

- [ ] **Step 2: Implementar el barrido**

En `ejecutar-recordatorios.ts` cambiar `function describirError` por `export function describirError` (sin tocar el cuerpo).

`src/lib/vencimientos/ejecutar-avisos.ts`:

```ts
import type { ConfiguracionSmtpAlmacenada, SmtpConfigDescifrada } from "@/lib/email/smtp-config";
import type { MensajeEmail } from "@/lib/email/enviar-email";
import { describirError, type TenantRef } from "@/lib/recordatorios/ejecutar-recordatorios";
import {
  diasHastaVencimiento,
  estadoVencimiento,
  fechaInicioVencidosEmail,
  fechaLimiteAviso,
  requiereAviso,
  VENTANA_VENCIDOS_EMAIL_DIAS,
  type TipoDocumento,
} from "./estado-vencimiento";
import { construirMensajeAvisoVencimiento } from "./plantilla";

/**
 * Barrido de avisos de vencimiento (SOAT / RTM) por email. Mismo diseño y
 * misma política de fallos que ejecutar-recordatorios.ts: sin Prisma, todo
 * llega por `deps`; un tenant o un email fallido nunca aborta el resto; un
 * envío fallido NO se registra (se reintenta en la próxima corrida).
 */
export interface DocumentoParaAviso {
  vehiculoId: string;
  placa: string;
  clienteNombre: string;
  clienteEmail: string | null;
  tipo: TipoDocumento;
  fechaVencimiento: Date;
  yaAvisadoPorEmail: boolean;
}

export interface RegistroAviso {
  vehiculoId: string;
  tipo: TipoDocumento;
  fechaVencimiento: Date;
  canal: "EMAIL" | "WHATSAPP";
  destino: string;
  enviadoPorId: string | null;
  enviadoAt: Date;
}

export interface AvisosGateway {
  obtenerConfiguracionSmtp(schemaName: string): Promise<ConfiguracionSmtpAlmacenada | null>;
  obtenerDiasAviso(schemaName: string): Promise<number>;
  listarDocumentosParaAviso(schemaName: string, desde: Date, hasta: Date): Promise<DocumentoParaAviso[]>;
  registrarAviso(schemaName: string, registro: RegistroAviso): Promise<void>;
}

export interface EjecutarAvisosDeps {
  listarTenants(): Promise<TenantRef[]>;
  gateway: AvisosGateway;
  descifrarConfiguracion(fila: ConfiguracionSmtpAlmacenada): SmtpConfigDescifrada;
  enviarEmail(config: SmtpConfigDescifrada, mensaje: MensajeEmail): Promise<void>;
  ahora: Date;
}

export interface ResumenAvisos {
  tenantsProcesados: number;
  tenantsSinSmtp: number;
  documentosEvaluados: number;
  enviados: number;
  enviadosNoRegistrados: number;
  omitidosYaAvisados: number;
  omitidosSinEmail: number;
  fallidos: number;
  errores: string[];
}

const MAX_ERRORES_REPORTADOS = 50;

export async function ejecutarAvisosVencimiento(deps: EjecutarAvisosDeps): Promise<ResumenAvisos> {
  const resumen: ResumenAvisos = {
    tenantsProcesados: 0,
    tenantsSinSmtp: 0,
    documentosEvaluados: 0,
    enviados: 0,
    enviadosNoRegistrados: 0,
    omitidosYaAvisados: 0,
    omitidosSinEmail: 0,
    fallidos: 0,
    errores: [],
  };

  function registrarError(descripcion: string): void {
    console.error(`[avisos-vencimiento] ${descripcion}`);
    if (resumen.errores.length < MAX_ERRORES_REPORTADOS) resumen.errores.push(descripcion);
  }

  function anotarError(descripcion: string): void {
    resumen.fallidos += 1;
    registrarError(descripcion);
  }

  const tenants = await deps.listarTenants();

  for (const tenant of tenants) {
    try {
      const fila = await deps.gateway.obtenerConfiguracionSmtp(tenant.schemaName);
      if (!fila || !fila.activo) {
        resumen.tenantsSinSmtp += 1;
        continue;
      }

      const smtp = deps.descifrarConfiguracion(fila);
      const diasAviso = await deps.gateway.obtenerDiasAviso(tenant.schemaName);
      const documentos = await deps.gateway.listarDocumentosParaAviso(
        tenant.schemaName,
        fechaInicioVencidosEmail(deps.ahora),
        fechaLimiteAviso(deps.ahora, diasAviso),
      );
      resumen.tenantsProcesados += 1;

      for (const doc of documentos) {
        resumen.documentosEvaluados += 1;

        // The gateway pre-filters by date range; the real rule still decides here.
        const estado = estadoVencimiento(doc.fechaVencimiento, deps.ahora, diasAviso);
        if (!requiereAviso(estado)) continue;
        if (diasHastaVencimiento(doc.fechaVencimiento, deps.ahora) < -VENTANA_VENCIDOS_EMAIL_DIAS) continue;
        if (doc.yaAvisadoPorEmail) {
          resumen.omitidosYaAvisados += 1;
          continue;
        }
        if (!doc.clienteEmail) {
          resumen.omitidosSinEmail += 1;
          continue;
        }

        let mensajeEnviado = false;
        try {
          const mensaje = construirMensajeAvisoVencimiento(doc.clienteEmail, {
            clienteNombre: doc.clienteNombre,
            placa: doc.placa,
            tipo: doc.tipo,
            fechaVencimiento: doc.fechaVencimiento,
            tallerNombre: smtp.fromNombre,
            ahora: deps.ahora,
          });
          await deps.enviarEmail(smtp, mensaje);
          mensajeEnviado = true;

          const registro: RegistroAviso = {
            vehiculoId: doc.vehiculoId,
            tipo: doc.tipo,
            fechaVencimiento: doc.fechaVencimiento,
            canal: "EMAIL",
            destino: doc.clienteEmail,
            enviadoPorId: null,
            enviadoAt: deps.ahora,
          };
          // Same bounded retry as the maintenance sweep: one immediate retry,
          // then the distinguishable "sent but not recorded" case below.
          try {
            await deps.gateway.registrarAviso(tenant.schemaName, registro);
          } catch {
            await deps.gateway.registrarAviso(tenant.schemaName, registro);
          }
          resumen.enviados += 1;
        } catch (err) {
          if (mensajeEnviado) {
            resumen.enviados += 1;
            resumen.enviadosNoRegistrados += 1;
            registrarError(
              `[${tenant.schemaName}] ${doc.placa} ${doc.tipo}: RIESGO_DUPLICADO — enviado pero no registrado (${describirError(err)})`,
            );
          } else {
            anotarError(`[${tenant.schemaName}] ${doc.placa} ${doc.tipo}: ${describirError(err)}`);
          }
        }
      }
    } catch (err) {
      anotarError(`[${tenant.schemaName}] ${describirError(err)}`);
    }
  }

  return resumen;
}
```

Run tests → PASS.

- [ ] **Step 3: Gateway Prisma**

`src/lib/vencimientos/gateway-prisma.ts`:

```ts
import { getTenantDb } from "@/lib/db/tenant-client";
import { prismaRecordatoriosGateway } from "@/lib/recordatorios/gateway-prisma";
import { leerDiasAviso } from "./configuracion";
import type { AvisosGateway, DocumentoParaAviso } from "./ejecutar-avisos";
import type { TipoDocumento } from "./estado-vencimiento";

/**
 * Única pieza con Prisma del barrido de vencimientos. Lecturas a nivel de
 * tenant, sin sede ni sesión (mismo razonamiento que el gateway de
 * recordatorios de mantenimiento).
 */
export const prismaAvisosGateway: AvisosGateway = {
  obtenerConfiguracionSmtp: prismaRecordatoriosGateway.obtenerConfiguracionSmtp,

  async obtenerDiasAviso(schemaName) {
    return leerDiasAviso(getTenantDb(schemaName));
  },

  async listarDocumentosParaAviso(schemaName, desde, hasta) {
    const tenantDb = getTenantDb(schemaName);
    const rango = { gte: desde, lte: hasta };
    const vehiculos = await tenantDb.vehiculo.findMany({
      where: { OR: [{ soatVence: rango }, { tecnomecanicaVence: rango }] },
      select: {
        id: true,
        placa: true,
        soatVence: true,
        tecnomecanicaVence: true,
        cliente: { select: { nombre: true, email: true } },
        avisosVencimiento: {
          where: { canal: "EMAIL" },
          select: { tipo: true, fechaVencimiento: true },
        },
      },
    });

    const documentos: DocumentoParaAviso[] = [];
    for (const vehiculo of vehiculos) {
      const fechas: [TipoDocumento, Date | null][] = [
        ["SOAT", vehiculo.soatVence],
        ["TECNOMECANICA", vehiculo.tecnomecanicaVence],
      ];
      for (const [tipo, fecha] of fechas) {
        if (!fecha || fecha < desde || fecha > hasta) continue;
        documentos.push({
          vehiculoId: vehiculo.id,
          placa: vehiculo.placa,
          clienteNombre: vehiculo.cliente.nombre,
          clienteEmail: vehiculo.cliente.email,
          tipo,
          fechaVencimiento: fecha,
          yaAvisadoPorEmail: vehiculo.avisosVencimiento.some(
            (aviso) => aviso.tipo === tipo && aviso.fechaVencimiento.getTime() === fecha.getTime(),
          ),
        });
      }
    }
    return documentos;
  },

  async registrarAviso(schemaName, registro) {
    const tenantDb = getTenantDb(schemaName);
    const clave = {
      vehiculoId: registro.vehiculoId,
      tipo: registro.tipo,
      fechaVencimiento: registro.fechaVencimiento,
      canal: registro.canal,
    };
    await tenantDb.avisoVencimiento.upsert({
      where: { vehiculoId_tipo_fechaVencimiento_canal: clave },
      create: { ...clave, destino: registro.destino, enviadoPorId: registro.enviadoPorId, enviadoAt: registro.enviadoAt },
      update: { destino: registro.destino, enviadoPorId: registro.enviadoPorId, enviadoAt: registro.enviadoAt },
    });
  },
};
```

(Si TypeScript no infiere los parámetros de los métodos desde `AvisosGateway`, anotarlos explícitamente con los tipos de la interfaz.)

- [ ] **Step 4: Route del cron**

Primero el test (en el test existente del route, que mockea `ejecutarRecordatorios`): mockear también `@/lib/vencimientos/ejecutar-avisos` y `@/lib/vencimientos/gateway-prisma`, y agregar:

```ts
it("devuelve ambos resúmenes", async () => {
  // ejecutarRecordatorios -> { enviados: 1, ... }, ejecutarAvisosVencimiento -> { enviados: 2, ... }
  const res = await GET(requestConSecreto());
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.mantenimiento.enviados).toBe(1);
  expect(body.vencimientos.enviados).toBe(2);
});

it("si un barrido no puede iniciar, el otro igual corre (200 con error en su slot)", async () => {
  // ejecutarRecordatorios rechaza, ejecutarAvisosVencimiento resuelve
  const body = await (await GET(requestConSecreto())).json();
  expect(body.mantenimiento).toEqual({ error: "Error al ejecutar los recordatorios" });
  expect(body.vencimientos.enviados).toBe(2);
});

it("500 solo si ambos barridos fallan al iniciar", async () => {
  // ambos rechazan
  const res = await GET(requestConSecreto());
  expect(res.status).toBe(500);
});
```

(Usar el helper de request autorizado que ya tenga el archivo de test; actualizar los tests existentes que esperan el resumen de mantenimiento en la raíz del body para leerlo en `body.mantenimiento`.)

Luego, en `route.ts`, reemplazar el cuerpo del `try/catch` del `GET` por:

```ts
  const listarTenants = () =>
    publicDb.tenant.findMany({ where: { estado: "ACTIVO" }, select: { schemaName: true } });
  const ahora = new Date();

  // Each sweep in its own try/catch: if one cannot start, the other still runs.
  const [mantenimiento, vencimientos] = await Promise.all([
    ejecutarRecordatorios({
      listarTenants,
      gateway: prismaRecordatoriosGateway,
      descifrarConfiguracion: descifrarConfiguracionSmtp,
      enviarEmail,
      ahora,
    }).catch((err: unknown) => fallo("recordatorios", err)),
    ejecutarAvisosVencimiento({
      listarTenants,
      gateway: prismaAvisosGateway,
      descifrarConfiguracion: descifrarConfiguracionSmtp,
      enviarEmail,
      ahora,
    }).catch((err: unknown) => fallo("vencimientos", err)),
  ]);

  const status = "error" in mantenimiento && "error" in vencimientos ? 500 : 200;
  return NextResponse.json({ mantenimiento, vencimientos }, { status, headers: { "Cache-Control": "no-store" } });
```

con, a nivel de módulo:

```ts
const MENSAJE_FALLO = {
  recordatorios: "Error al ejecutar los recordatorios",
  vencimientos: "Error al ejecutar los avisos de vencimiento",
} as const;

/** Only the constructor name is logged -- see the comment this replaces. */
function fallo(barrido: keyof typeof MENSAJE_FALLO, err: unknown): { error: string } {
  const nombreError = err instanceof Error ? err.constructor.name : "Error desconocido";
  console.error(`[cron/recordatorios] El barrido de ${barrido} no pudo iniciar: ${nombreError}`);
  return { error: MENSAJE_FALLO[barrido] };
}
```

Conservar (adaptado) el comentario existente sobre por qué solo se registra el nombre de la clase del error. Agregar los imports de `ejecutarAvisosVencimiento` y `prismaAvisosGateway`, y actualizar el comentario de cabecera del route ("...the preventive-maintenance reminder sweep and the SOAT/RTM expiry sweep...").

Run: `npx vitest run --project unit src/app/api/cron/recordatorios` → PASS.

- [ ] **Step 5: Verificar y commit**

Run: `npx tsc --noEmit && npm test` → PASS.

```bash
git add src/lib/vencimientos src/lib/recordatorios/ejecutar-recordatorios.ts src/app/api/cron/recordatorios
git commit -m "fase15-task 5: barrido de email de avisos de vencimiento en el cron"
git push
```

---

### Task 6: Vista `/vencimientos` con aviso por WhatsApp

**Files:**
- Create: `src/app/actions/vencimiento-actions.ts`, `src/app/actions/vencimiento-actions.test.ts`
- Create: `src/app/(dashboard)/vencimientos/page.tsx`, `loading.tsx`, `vencimientos-table.tsx`, `avisar-whatsapp-button.tsx`, `avisar-whatsapp-button.test.tsx`
- Modify: `src/app/(dashboard)/dashboard-sidebar.tsx` (ítem de menú) + su test si enumera ítems

**Interfaces:**
- Consumes: `estadoVencimiento`, `requiereAviso`, `diasHastaVencimiento`, `fechaLimiteAviso`, `TipoDocumento`, `EstadoVencimiento` (Task 2); `textoAvisoVencimiento` (Task 2); `urlWhatsapp` (Task 2); `leerDiasAviso` (Task 4); `VencimientoBadge` (Task 3); `ETIQUETA_TIPO_VEHICULO`, `TipoVehiculoValor` (Tasks 1/3).
- Produces:

```ts
export interface FilaVencimiento {
  id: string; // `${vehiculoId}-${tipo}`
  vehiculoId: string;
  placa: string;
  tipoVehiculo: TipoVehiculoValor;
  clienteNombre: string;
  tipo: TipoDocumento;
  fechaVencimiento: Date;
  diasRestantes: number;
  estado: EstadoVencimiento; // siempre PROXIMO | POR_VENCER | VENCIDO
  ultimoAviso: { canal: "EMAIL" | "WHATSAPP"; enviadoAt: Date } | null;
  urlWhatsapp: string | null;
}
export function listVencimientos(): Promise<FilaVencimiento[]>; // ordenadas por diasRestantes asc
export function registrarAvisoWhatsappAction(vehiculoId: string, tipo: TipoDocumento): Promise<{ error: string | null }>;
```

- [ ] **Step 1: Tests de actions (fallan)**

`src/app/actions/vencimiento-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireRole = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: () => mockRequireSession(),
}));
const mockVehiculoFindMany = vi.fn();
const mockVehiculoFindUnique = vi.fn();
const mockAvisoUpsert = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    vehiculo: { findMany: mockVehiculoFindMany, findUnique: mockVehiculoFindUnique },
    avisoVencimiento: { upsert: mockAvisoUpsert },
    configuracionTaller: { findUnique: vi.fn().mockResolvedValue(null) },
  }),
}));
vi.mock("@/lib/db/public-client", () => ({
  publicDb: { tenant: { findUnique: vi.fn().mockResolvedValue({ nombre: "Taller Pérez", slug: "taller-perez" }) } },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { listVencimientos, registrarAvisoWhatsappAction } from "./vencimiento-actions";

const SESION = { user: { id: "u1", role: "RECEPCION", tenantSchema: "taller_perez" } };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-10T15:00:00Z"));
  mockRequireSession.mockReset().mockResolvedValue(SESION);
  mockRequireRole.mockReset().mockResolvedValue(SESION);
  mockVehiculoFindMany.mockReset();
  mockVehiculoFindUnique.mockReset();
  mockAvisoUpsert.mockReset().mockResolvedValue({});
});

describe("listVencimientos", () => {
  it("una fila por documento que requiere aviso, ordenadas por días restantes", async () => {
    mockVehiculoFindMany.mockResolvedValue([
      {
        id: "v1", placa: "ABC123", tipo: "CARRO",
        soatVence: new Date("2026-10-20T00:00:00Z"), tecnomecanicaVence: new Date("2026-09-01T00:00:00Z"),
        cliente: { nombre: "Ana", telefono: "3105550142" },
        avisosVencimiento: [
          { tipo: "SOAT", fechaVencimiento: new Date("2026-10-20T00:00:00Z"), canal: "EMAIL", enviadoAt: new Date("2026-10-01T10:00:00Z") },
        ],
      },
      {
        id: "v2", placa: "XYZ987", tipo: "MOTO",
        soatVence: new Date("2027-05-01T00:00:00Z"), tecnomecanicaVence: null,
        cliente: { nombre: "Luis", telefono: null }, avisosVencimiento: [],
      },
    ]);

    const filas = await listVencimientos();

    expect(filas.map((f) => [f.placa, f.tipo, f.estado])).toEqual([
      ["ABC123", "TECNOMECANICA", "VENCIDO"],
      ["ABC123", "SOAT", "POR_VENCER"],
    ]);
    expect(filas[1].ultimoAviso).toEqual({ canal: "EMAIL", enviadoAt: new Date("2026-10-01T10:00:00Z") });
    expect(filas[0].ultimoAviso).toBeNull();
    expect(filas[0].urlWhatsapp).toMatch(/^https:\/\/wa\.me\/573105550142\?text=/);
  });
});

describe("registrarAvisoWhatsappAction", () => {
  it("exige ADMIN o RECEPCION", async () => {
    mockVehiculoFindUnique.mockResolvedValue(null);
    await registrarAvisoWhatsappAction("v1", "SOAT");
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
  });

  it("registra el aviso WHATSAPP con el usuario que lo envió", async () => {
    mockVehiculoFindUnique.mockResolvedValue({
      soatVence: new Date("2026-10-20T00:00:00Z"), tecnomecanicaVence: null, cliente: { telefono: "3105550142" },
    });
    const r = await registrarAvisoWhatsappAction("v1", "SOAT");
    expect(r).toEqual({ error: null });
    expect(mockAvisoUpsert).toHaveBeenCalledWith({
      where: {
        vehiculoId_tipo_fechaVencimiento_canal: {
          vehiculoId: "v1", tipo: "SOAT", fechaVencimiento: new Date("2026-10-20T00:00:00Z"), canal: "WHATSAPP",
        },
      },
      create: {
        vehiculoId: "v1", tipo: "SOAT", fechaVencimiento: new Date("2026-10-20T00:00:00Z"), canal: "WHATSAPP",
        destino: "3105550142", enviadoPorId: "u1",
      },
      update: { destino: "3105550142", enviadoPorId: "u1", enviadoAt: expect.any(Date) },
    });
  });

  it("error si el vehículo no existe, no tiene la fecha o el cliente no tiene teléfono", async () => {
    mockVehiculoFindUnique.mockResolvedValueOnce(null);
    expect((await registrarAvisoWhatsappAction("x", "SOAT")).error).toBe("Vehículo no encontrado");
    mockVehiculoFindUnique.mockResolvedValueOnce({ soatVence: null, tecnomecanicaVence: null, cliente: { telefono: "3105550142" } });
    expect((await registrarAvisoWhatsappAction("v1", "SOAT")).error).toBe("El vehículo no tiene fecha de vencimiento registrada");
    mockVehiculoFindUnique.mockResolvedValueOnce({ soatVence: new Date("2026-10-20T00:00:00Z"), tecnomecanicaVence: null, cliente: { telefono: null } });
    expect((await registrarAvisoWhatsappAction("v1", "SOAT")).error).toBe("El cliente no tiene teléfono registrado");
    expect(mockAvisoUpsert).not.toHaveBeenCalled();
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implementar actions**

`src/app/actions/vencimiento-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { publicDb } from "@/lib/db/public-client";
import type { TipoVehiculoValor } from "@/lib/validation/vehiculo";
import { leerDiasAviso } from "@/lib/vencimientos/configuracion";
import {
  diasHastaVencimiento,
  estadoVencimiento,
  fechaLimiteAviso,
  requiereAviso,
  type EstadoVencimiento,
  type TipoDocumento,
} from "@/lib/vencimientos/estado-vencimiento";
import { textoAvisoVencimiento } from "@/lib/vencimientos/plantilla";
import { urlWhatsapp } from "@/lib/whatsapp/url";

export interface FilaVencimiento {
  id: string;
  vehiculoId: string;
  placa: string;
  tipoVehiculo: TipoVehiculoValor;
  clienteNombre: string;
  tipo: TipoDocumento;
  fechaVencimiento: Date;
  diasRestantes: number;
  estado: EstadoVencimiento;
  ultimoAviso: { canal: "EMAIL" | "WHATSAPP"; enviadoAt: Date } | null;
  urlWhatsapp: string | null;
}

async function nombreTaller(tenantSchema: string): Promise<string> {
  const tenant = await publicDb.tenant.findUnique({ where: { schemaName: tenantSchema }, select: { nombre: true, slug: true } });
  return tenant?.nombre || tenant?.slug || "Nuestro taller";
}

/**
 * Documentos (SOAT/RTM) por vencer o vencidos de todo el taller -- tenant-wide,
 * como /clientes. Sin límite inferior: a diferencia del barrido de email, la
 * vista sí muestra vencidos de hace meses (recepción decide si insistir).
 */
export async function listVencimientos(): Promise<FilaVencimiento[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const ahora = new Date();
  const [diasAviso, tallerNombre] = await Promise.all([
    leerDiasAviso(tenantDb),
    nombreTaller(session.user.tenantSchema),
  ]);
  const hasta = fechaLimiteAviso(ahora, diasAviso);

  const vehiculos = await tenantDb.vehiculo.findMany({
    where: { OR: [{ soatVence: { lte: hasta } }, { tecnomecanicaVence: { lte: hasta } }] },
    select: {
      id: true,
      placa: true,
      tipo: true,
      soatVence: true,
      tecnomecanicaVence: true,
      cliente: { select: { nombre: true, telefono: true } },
      avisosVencimiento: {
        orderBy: { enviadoAt: "desc" },
        select: { tipo: true, fechaVencimiento: true, canal: true, enviadoAt: true },
      },
    },
  });

  const filas: FilaVencimiento[] = [];
  for (const vehiculo of vehiculos) {
    const fechas: [TipoDocumento, Date | null][] = [
      ["SOAT", vehiculo.soatVence],
      ["TECNOMECANICA", vehiculo.tecnomecanicaVence],
    ];
    for (const [tipo, fecha] of fechas) {
      if (!fecha) continue;
      const estado = estadoVencimiento(fecha, ahora, diasAviso);
      if (!requiereAviso(estado)) continue;

      const ultimo = vehiculo.avisosVencimiento.find(
        (aviso) => aviso.tipo === tipo && aviso.fechaVencimiento.getTime() === fecha.getTime(),
      );
      filas.push({
        id: `${vehiculo.id}-${tipo}`,
        vehiculoId: vehiculo.id,
        placa: vehiculo.placa,
        tipoVehiculo: vehiculo.tipo,
        clienteNombre: vehiculo.cliente.nombre,
        tipo,
        fechaVencimiento: fecha,
        diasRestantes: diasHastaVencimiento(fecha, ahora),
        estado,
        ultimoAviso: ultimo ? { canal: ultimo.canal, enviadoAt: ultimo.enviadoAt } : null,
        urlWhatsapp: urlWhatsapp(
          vehiculo.cliente.telefono,
          textoAvisoVencimiento({
            clienteNombre: vehiculo.cliente.nombre,
            placa: vehiculo.placa,
            tipo,
            fechaVencimiento: fecha,
            tallerNombre,
            ahora,
          }),
        ),
      });
    }
  }

  return filas.sort((a, b) => a.diasRestantes - b.diasRestantes);
}

/**
 * Registra que recepción abrió el wa.me de un aviso. El navegador ya abrió el
 * enlace de forma síncrona en el clic (los bloqueadores de popups se tragan un
 * window.open después de un await), así que aquí solo se deja constancia.
 * Upsert por la clave única: un segundo clic sobre la misma fecha no duplica.
 */
export async function registrarAvisoWhatsappAction(
  vehiculoId: string,
  tipo: TipoDocumento,
): Promise<{ error: string | null }> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const vehiculo = await tenantDb.vehiculo.findUnique({
    where: { id: vehiculoId },
    select: { soatVence: true, tecnomecanicaVence: true, cliente: { select: { telefono: true } } },
  });
  if (!vehiculo) return { error: "Vehículo no encontrado" };

  const fechaVencimiento = tipo === "SOAT" ? vehiculo.soatVence : vehiculo.tecnomecanicaVence;
  if (!fechaVencimiento) return { error: "El vehículo no tiene fecha de vencimiento registrada" };
  const telefono = vehiculo.cliente.telefono;
  if (!telefono) return { error: "El cliente no tiene teléfono registrado" };

  const clave = { vehiculoId, tipo, fechaVencimiento, canal: "WHATSAPP" as const };
  await tenantDb.avisoVencimiento.upsert({
    where: { vehiculoId_tipo_fechaVencimiento_canal: clave },
    create: { ...clave, destino: telefono, enviadoPorId: session.user.id },
    update: { destino: telefono, enviadoPorId: session.user.id, enviadoAt: new Date() },
  });

  revalidatePath("/vencimientos");
  return { error: null };
}
```

(Verificar que `session.user.id` existe en el tipo de sesión — `src/types/next-auth.d.ts`; si el id vive en otro campo, usar ese.)

Run tests → PASS.

- [ ] **Step 3: Botón de WhatsApp (test primero)**

`avisar-whatsapp-button.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRegistrar = vi.fn();
vi.mock("@/app/actions/vencimiento-actions", () => ({
  registrarAvisoWhatsappAction: (...args: unknown[]) => mockRegistrar(...args),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AvisarWhatsappButton } from "./avisar-whatsapp-button";

describe("AvisarWhatsappButton", () => {
  beforeEach(() => {
    mockRegistrar.mockReset().mockResolvedValue({ error: null });
    vi.spyOn(window, "open").mockReturnValue(null);
  });

  it("deshabilitado sin teléfono", () => {
    render(<AvisarWhatsappButton vehiculoId="v1" tipo="SOAT" urlWhatsapp={null} />);
    expect(screen.getByRole("button", { name: /Avisar por WhatsApp/ })).toBeDisabled();
  });

  it("abre wa.me y registra el aviso", async () => {
    render(<AvisarWhatsappButton vehiculoId="v1" tipo="SOAT" urlWhatsapp="https://wa.me/573105550142?text=x" />);
    await userEvent.click(screen.getByRole("button", { name: /Avisar por WhatsApp/ }));
    expect(window.open).toHaveBeenCalledWith("https://wa.me/573105550142?text=x", "_blank", "noopener");
    expect(mockRegistrar).toHaveBeenCalledWith("v1", "SOAT");
  });
});
```

(Si el proyecto usa otro paquete de toasts, mockear ese — revisar el import en `pedidos-compra/[id]/acciones-pedido.tsx`.)

`avisar-whatsapp-button.tsx` — mismo patrón que `enviarWhatsapp()` en `pedidos-compra/[id]/acciones-pedido.tsx:64-75`:

```tsx
"use client";

import { useTransition } from "react";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { registrarAvisoWhatsappAction } from "@/app/actions/vencimiento-actions";
import { Button } from "@/components/ui/button";
import type { TipoDocumento } from "@/lib/vencimientos/estado-vencimiento";

export function AvisarWhatsappButton({
  vehiculoId,
  tipo,
  urlWhatsapp,
}: {
  vehiculoId: string;
  tipo: TipoDocumento;
  urlWhatsapp: string | null;
}) {
  const [pendiente, startTransition] = useTransition();

  function avisar() {
    if (!urlWhatsapp) return;
    // Must run synchronously in the click handler: popup blockers swallow
    // window.open calls made after an await.
    window.open(urlWhatsapp, "_blank", "noopener");
    startTransition(async () => {
      const resultado = await registrarAvisoWhatsappAction(vehiculoId, tipo);
      if (resultado.error) toast.error(resultado.error);
      else toast.success("Aviso registrado");
    });
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={avisar}
      disabled={pendiente || !urlWhatsapp}
      title={urlWhatsapp ? undefined : "El cliente no tiene teléfono registrado"}
    >
      <MessageCircle className="size-4" />
      Avisar por WhatsApp
    </Button>
  );
}
```

Run test → PASS.

- [ ] **Step 4: Página y tabla**

`page.tsx` (server): `const [session, filas] = await Promise.all([requireSession(), listVencimientos()]);` `const puedeAvisar = session.user.role !== "TECNICO";`. Encabezado "Vencimientos" + subtítulo "SOAT y revisión técnico-mecánica por vencer o vencidos". Fila de 3 `KpiCard` (mismo estilo que las demás páginas de lista): "Vencidos" (danger), "Vencen en 7 días" (warning, estado PROXIMO), "Por vencer" (info, estado POR_VENCER). Luego `<VencimientosTable filas={filas} puedeAvisar={puedeAvisar} />`.

`vencimientos-table.tsx` (client): usar el `DataTable`/`DataTableInteractive` existente de `src/components/` (seguir cómo lo usa una página de lista con filtros, p. ej. `/citas` o `/proveedores`). Columnas: Placa (link `font-mono` a `/vehiculos/{vehiculoId}`), Tipo (`ETIQUETA_TIPO_VEHICULO`), Cliente, Documento ("SOAT"/"Tecnomecánica"), Vence (`<VencimientoBadge estado fecha />`), Días (`diasRestantes < 0 ? "Hace N días" : diasRestantes === 0 ? "Hoy" : "En N días"`), Último aviso (`"Email · " | "WhatsApp · "` + `formatoFechaRelativa(enviadoAt, ahora)` o "—"), Acciones (`<AvisarWhatsappButton>` solo si `puedeAvisar`). Búsqueda por placa o cliente. Filtros (estado local): Documento (Todos/SOAT/Tecnomecánica), Estado (Todos/Vencidos/Por vencer = PROXIMO+POR_VENCER), checkbox "Solo sin avisar" (`ultimoAviso === null`). Estado vacío: "No hay vencimientos en los próximos días."

`loading.tsx`: igual que el `loading.tsx` de otra página de lista (skeleton de tabla).

- [ ] **Step 5: Menú**

En `dashboard-sidebar.tsx`, grupo `OPERACION`, después de Citas: `{ href: "/vencimientos", label: "Vencimientos", icon: ShieldAlert }` (importar `ShieldAlert` de `lucide-react`). Si el test del sidebar enumera los ítems, agregarlo.

- [ ] **Step 6: Verificar y commit**

Run: `npx tsc --noEmit && npm test` → PASS.

```bash
git add src/app/actions/vencimiento-actions* "src/app/(dashboard)/vencimientos" "src/app/(dashboard)/dashboard-sidebar.tsx" "src/app/(dashboard)/dashboard-sidebar.test.tsx"
git commit -m "fase15-task 6: vista de vencimientos con aviso por WhatsApp"
git push
```

---

### Task 7: Aviso en nueva orden y KPI en el dashboard

**Files:**
- Create: `src/components/aviso-vencimientos-orden.tsx`, `src/components/aviso-vencimientos-orden.test.tsx`
- Modify: `src/app/actions/cliente-actions.ts` (`ClienteParaOrden` + `listClientesParaOrden`)
- Modify: `src/app/(dashboard)/ordenes/nueva-orden-desde-cero-form.tsx` (+ `client-vehicle-selector.tsx` en el `onCreated` del vehículo nuevo)
- Modify: `src/app/(dashboard)/vehiculos/[id]/nueva-orden-form.tsx`, `src/app/(dashboard)/clientes/[id]/nueva-orden-dialog.tsx`, `src/app/(dashboard)/vehiculos/[id]/page.tsx`
- Modify: `src/app/(dashboard)/page.tsx` (KPI)

**Interfaces:**
- Consumes: `estadoVencimiento`, `requiereAviso`, `diasHastaVencimiento`, `formatoFechaVencimiento`, `NOMBRE_DOCUMENTO`, `DIAS_AVISO_POR_DEFECTO` (Task 2); `getDiasAvisoVencimiento` (Task 4); `listVencimientos` (Task 6).
- Produces: `<AvisoVencimientosOrden soatVence={Date | null} tecnomecanicaVence={Date | null} diasAviso={number} />`; `ClienteParaOrden.vehiculos[].soatVence/tecnomecanicaVence: Date | null`.

- [ ] **Step 1: Test del aviso (falla)**

`src/components/aviso-vencimientos-orden.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AvisoVencimientosOrden } from "./aviso-vencimientos-orden";

describe("AvisoVencimientosOrden", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T15:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("no muestra nada si todo está vigente o sin dato", () => {
    const { container } = render(
      <AvisoVencimientosOrden soatVence={new Date("2027-05-01T00:00:00Z")} tecnomecanicaVence={null} diasAviso={30} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("avisa vencidos y por vencer", () => {
    render(
      <AvisoVencimientosOrden
        soatVence={new Date("2026-09-12T00:00:00Z")}
        tecnomecanicaVence={new Date("2026-10-20T00:00:00Z")}
        diasAviso={30}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/SOAT vencido el 12 sept?\.? 2026/);
    expect(screen.getByRole("status")).toHaveTextContent(/revisión técnico-mecánica vence el 20 oct\.? 2026/);
    expect(screen.getByRole("status")).toHaveTextContent("recuérdaselo al cliente");
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implementar el aviso**

`src/components/aviso-vencimientos-orden.tsx`:

```tsx
import { AlertTriangle } from "lucide-react";
import {
  diasHastaVencimiento,
  estadoVencimiento,
  formatoFechaVencimiento,
  NOMBRE_DOCUMENTO,
  requiereAviso,
  type TipoDocumento,
} from "@/lib/vencimientos/estado-vencimiento";

/** Informativo, nunca bloquea la creación de la orden. */
export function AvisoVencimientosOrden({
  soatVence,
  tecnomecanicaVence,
  diasAviso,
}: {
  soatVence: Date | null;
  tecnomecanicaVence: Date | null;
  diasAviso: number;
}) {
  const ahora = new Date();
  const documentos: [TipoDocumento, Date | null][] = [
    ["SOAT", soatVence],
    ["TECNOMECANICA", tecnomecanicaVence],
  ];
  const lineas = documentos.flatMap(([tipo, fecha]) => {
    if (!fecha || !requiereAviso(estadoVencimiento(fecha, ahora, diasAviso))) return [];
    const vencido = diasHastaVencimiento(fecha, ahora) < 0;
    return [`${NOMBRE_DOCUMENTO[tipo]} ${vencido ? "vencido el" : "vence el"} ${formatoFechaVencimiento.format(fecha)}`];
  });
  if (lineas.length === 0) return null;

  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-md border border-[oklch(0.7_0.15_60/0.4)] bg-[oklch(0.7_0.15_60/0.1)] px-3 py-2 text-xs text-[oklch(0.45_0.12_60)]"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <p>
        {lineas.join(" · ")} — recuérdaselo al cliente.
      </p>
    </div>
  );
}
```

Run test → PASS.

- [ ] **Step 3: Datos para la nueva orden**

En `cliente-actions.ts`: agregar `soatVence: Date | null; tecnomecanicaVence: Date | null;` al tipo de vehículo de `ClienteParaOrden` y `soatVence: true, tecnomecanicaVence: true` al `select` de `listClientesParaOrden` (pasan por el spread `...vehiculo`). En `client-vehicle-selector.tsx`, en el `onCreated` del vehículo recién creado, agregar `soatVence: vehiculo.soatVence, tecnomecanicaVence: vehiculo.tecnomecanicaVence`. Actualizar fixtures de tests que construyan `ClienteParaOrden` (agregar ambos campos en `null`).

- [ ] **Step 4: Mostrar el aviso en ambos flujos**

- `nueva-orden-desde-cero-form.tsx`: prop nueva `diasAviso: number`; tomar el vehículo seleccionado (igual que se obtiene `kilometrajeActual`) y renderizar `<AvisoVencimientosOrden soatVence={...} tecnomecanicaVence={...} diasAviso={diasAviso} />` debajo del selector de vehículo. La página que renderiza este formulario (`/ordenes`) obtiene `diasAviso` con `getDiasAvisoVencimiento()` y lo pasa.
- `nueva-orden-form.tsx` (vehículo ya conocido): props opcionales `vencimientos?: { soatVence: Date | null; tecnomecanicaVence: Date | null; diasAviso: number }`; si viene, renderizar el aviso al inicio del formulario. `nueva-orden-dialog.tsx` reenvía la prop opcional. `vehiculos/[id]/page.tsx` la pasa con los datos del vehículo y el `diasAviso` que ya obtiene (Task 4). En `clientes/[id]` no se pasa (queda opcional).

Agregar a los tests existentes de `nueva-orden-desde-cero-form.test.tsx` y `nueva-orden-form.test.tsx` un caso que verifica que aparece `role="status"` con un SOAT vencido y la prop `diasAviso` en los renders existentes.

- [ ] **Step 5: KPI del dashboard**

En `src/app/(dashboard)/page.tsx`: agregar `listVencimientos()` al `Promise.all` inicial (`const [session, overview, alertasInventario, vencimientos] = ...`), y una sexta `KpiCard` después de "Stock bajo", envuelta en `<Link href="/vencimientos" className="rounded-xl focus-visible:outline-2">`:

```tsx
<KpiCard
  title="Vencimientos"
  value={vencimientos.length}
  valueColor="warning"
  subtitle={
    vencimientos.some((fila) => fila.estado === "VENCIDO")
      ? `${vencimientos.filter((fila) => fila.estado === "VENCIDO").length} vencidos`
      : undefined
  }
  subtitleColor="warning"
  highlight={vencimientos.length > 0}
  icon={<ShieldAlert className={cn("size-5", KPI_TONE.warning.icon)} />}
  iconBgColor={KPI_TONE.warning.iconBg}
  className={KPI_TONE.warning.cardBg}
/>
```

Cambiar la grilla de `xl:grid-cols-5` a `xl:grid-cols-6`. Importar `ShieldAlert`. Si el test del dashboard mockea las actions, agregar el mock de `@/app/actions/vencimiento-actions` (`listVencimientos` → `[]`).

- [ ] **Step 6: Verificar y commit**

Run: `npx tsc --noEmit && npm test` → PASS.

```bash
git add src/components/aviso-vencimientos-orden* src/app/actions/cliente-actions.ts "src/app/(dashboard)"
git commit -m "fase15-task 7: aviso de vencimientos en nueva orden y KPI en el dashboard"
git push
```

---

### Cierre de fase

- [ ] Revisión final de toda la rama (`git diff main...fase15-vehiculo-vencimientos`) contra el spec; fix round si hay hallazgos (`fase15-fix: ...`).
- [ ] `npx tsc --noEmit && npm test && npm run lint` sobre la rama.
- [ ] Verificación manual en navegador (con el usuario): crear/editar vehículo con tipo/VIN/vencimientos, `/vencimientos`, botón WhatsApp, aviso en nueva orden, KPI, sección Recordatorios.
- [ ] Merge: `git checkout main && git pull && git merge --no-ff fase15-vehiculo-vencimientos -m "Merge fase15: vehículo y vencimientos"` y `git push`.
- [ ] Deploy (lo ejecuta el usuario): migrar **cada** tenant (`docs/DEPLOY.md` §5) — la migración agrega columnas con default, no requiere backfill.
