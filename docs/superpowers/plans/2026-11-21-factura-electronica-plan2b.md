# Factura electrónica — Plan 2b: pantallas para emitir, reenviar y configurar

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el taller configure la facturación electrónica, vea el estado DIAN de cada factura, la envíe o reenvíe con un botón, complete los datos DIAN del cliente y vea en Inicio cuántas facturas faltan por enviar — usando el servicio del Plan 2a sin cambiar su lógica.

**Architecture:** Server actions nuevas (`src/app/actions/factura-electronica-*.ts`, `cliente-fe-actions.ts`) envuelven el servicio del Plan 2a (`emitirDocumentoFactura`, `reintentarDocumento`) y la configuración (`crearProveedorDesdeConfig`). Las pantallas son componentes de servidor con formularios cliente pequeños (`useActionState` + `FormData` nativo, como la configuración de correo). Los textos y reglas que comparten varias pantallas (estado DIAN en lenguaje sencillo, "necesita atención", avisos de la resolución) viven en funciones puras de `src/lib/factura-electronica/` con pruebas unitarias. La migración `20261120130000_factura_electronica` **todavía no está aplicada en ninguna base**, así que se corrige en sitio (no se crea otra).

**Tech Stack:** Next 16.4.5 (App Router, server actions), React 19 (`useActionState`), Prisma 6.19 (cliente del taller), Zod, Vitest 4 + Testing Library (proyecto `unit`; `db` solo en la tarea 10), Tailwind.

**Spec:** `docs/superpowers/specs/2026-11-20-factura-electronica-design.md` (§11 manda sobre lo anterior; §11.9–§11.12 son las decisiones de este plan). Plan anterior: `docs/superpowers/plans/2026-11-20-factura-electronica-plan2a.md`. Pendientes: `docs/superpowers/plans/2026-11-20-factura-electronica-plan2a-pendientes.md`.

## Global Constraints

- Rama: `fase-fe-factura-electronica`. Commit y push al terminar **cada** tarea con el mensaje `fase-fe-task N: descripción breve` y la línea final `Co-Authored-By: <modelo real> <noreply@anthropic.com>`. Sin merge a `main`.
- Frontera del núcleo intacta: nada dentro de `src/modulos/factura-electronica/` cambia en este plan. El lado TorqueFlow importa el núcleo **solo** desde `@/modulos/factura-electronica`.
- El servicio del Plan 2a (`src/lib/factura-electronica/servicio.ts`) **no cambia** su lógica; las acciones solo lo llaman. Contexto: `{ db: tenantDb, tenantSchema: session.user.tenantSchema, usuarioId: session.user.id }`.
- Permisos: enviar y reenviar usan `facturas.facturar`; ver usa `facturas.ver`; configurar usa el permiso nuevo `facturaElectronica.configurar` (requisito `facturas.facturar`); datos DIAN del cliente usan `clientes.editar`.
- Las facturas siempre se buscan con `scopeFactura(session.user.sedeActivaId)` (sede activa), igual que `getFactura`.
- El token nunca viaja al navegador: la vista de la configuración solo dice `tokenConfigurado: boolean`.
- Fechas `@db.Date` (vigencia de la resolución) = medianoche UTC: se guardan con `new Date(\`${dia}T00:00:00.000Z\`)` y se leen con `diaIso` de `@/lib/factura-electronica/configuracion` (**no** con `formatoDiaBogota`).
- Talleres sin facturación electrónica activa no ven nada nuevo en la ficha de la factura, la lista, el cliente ni Inicio.
- Textos en español de Colombia y en lenguaje sencillo (sin "CUFE" suelto: "Código único (CUFE)"). Acciones difíciles de deshacer (pasar a producción) con `ConfirmacionEnLinea`, nunca `window.confirm`.
- **Migración:** se edita `prisma/tenant/migrations/20261120130000_factura_electronica/migration.sql` en sitio (no está aplicada en ninguna base). **No** se corre `prisma migrate deploy/dev` ni `db push` contra `taller_dev` ni producción. Las pruebas `db` (talleres temporales) están autorizadas solo en la tarea 10.
- Antes de `npx prisma generate --schema=prisma/tenant/schema.prisma` detener `npm run dev` si está corriendo (en Windows bloquea el motor).
- Verificación por tarea (RULES.md §4): `npx tsc --noEmit`, `npx vitest run --project unit <archivos tocados>`, `npx eslint <archivos tocados>`.
- RULES.md §1: si un comando falla, máximo un intento de corrección; si vuelve a fallar, parar y reportar. RULES.md §7: no tocar el backlog de fases anteriores.

## Mapa de archivos

```
prisma/tenant/schema.prisma                                   (modificar) activadaDesde; único con ambiente
prisma/tenant/migrations/20261120130000_factura_electronica/migration.sql   (modificar en sitio)
src/lib/factura-electronica/migracion-db.test.ts              (modificar) único por ambiente, activadaDesde

src/lib/auth/permisos.ts (+ .test.ts)                         (modificar) facturaElectronica.configurar
src/app/(dashboard)/dashboard-sidebar.tsx (+ .test.tsx)       (modificar) ítem "Facturación electrónica"

src/lib/validation/factura-electronica.ts (+ .test.ts)        (crear) esquemas de configuración y datos del cliente
src/app/actions/factura-electronica-config-actions.ts (+ .test.ts)  (crear) leer, guardar, probar conexión

src/lib/factura-electronica/avisos-resolucion.ts (+ .test.ts) (crear) rango o vigencia por agotarse
src/components/campo-municipio.tsx (+ .test.tsx)              (crear) buscador de municipio (Combobox)
src/app/(dashboard)/pestanas-configuracion.tsx (+ .test.tsx)  (modificar) pestaña y filtro por permisos
src/app/(dashboard)/configuracion-factura-electronica/page.tsx                 (crear)
src/app/(dashboard)/configuracion-factura-electronica/configuracion-fe-form.tsx (+ .test.tsx)  (crear)

src/lib/factura-electronica/textos.ts (+ .test.ts)            (crear) estado DIAN en lenguaje sencillo, necesitaAtencionDian
src/app/actions/factura-electronica-actions.ts (+ .test.ts)   (crear) vista de la ficha, enviar, reenviar, contar pendientes
src/app/(dashboard)/facturas/[id]/factura-electronica-card.tsx (+ .test.tsx)   (crear)
src/app/(dashboard)/facturas/[id]/page.tsx                    (modificar) tarjeta
src/app/actions/factura-actions.ts                            (modificar) include del documento en la lista
src/app/(dashboard)/facturas/page.tsx                         (modificar) insignia y filtro "Sin enviar o rechazadas"

src/app/actions/cliente-fe-actions.ts (+ .test.ts)            (crear) guardar datos DIAN del cliente
src/app/(dashboard)/clientes/[id]/datos-fe-cliente.tsx (+ .test.tsx)  (crear) sección plegable
src/app/(dashboard)/clientes/[id]/page.tsx                    (modificar)

src/app/(dashboard)/aviso-facturas-dian.tsx (+ .test.tsx)     (crear) aviso de Inicio
src/app/(dashboard)/page.tsx                                  (modificar)
```

---

### Task 10: Numeración por ambiente y fecha de activación (migración en sitio)

**Files:**
- Modify: `prisma/tenant/schema.prisma`
- Modify: `prisma/tenant/migrations/20261120130000_factura_electronica/migration.sql`
- Modify: `src/lib/factura-electronica/migracion-db.test.ts`

**Interfaces:**
- Produces: `ConfiguracionFacturaElectronica.activadaDesde: Date | null` (Tasks 12, 16, 18); índice único `@@unique([tipo, ambiente, prefijo, numero])` (Prisma lo nombra `tipo_ambiente_prefijo_numero`).

- [ ] **Step 1: Escribir la prueba que falla**

En `src/lib/factura-electronica/migracion-db.test.ts`:

1. En la prueba de valores por defecto de la configuración, junto a la línea `ambienteProveedor: null,` agrega:

```ts
      activadaDesde: null,
```

2. Reemplaza la prueba `it("no deja repetir tipo + prefijo + número; otro tipo con el mismo número sí", ...)` completa por:

```ts
  it("no deja repetir tipo + ambiente + prefijo + número; otro tipo u otro ambiente con el mismo número sí", async () => {
    const db = getTenantDb(SCHEMA);
    const { facturaId, usuarioId } = await crearFacturaDePrueba(db, "FEM001");
    const datos = {
      tipo: "FACTURA" as const,
      facturaId,
      prefijo: "SETP",
      numero: 990000001,
      payload: {},
      ambiente: "SIMULADO" as const,
      creadoPorId: usuarioId,
    };
    const doc = await db.documentoElectronico.create({ data: datos });
    expect(doc).toMatchObject({ estado: "PENDIENTE", intentos: 0, mensajes: [], cufe: null, xmlRuta: null });
    await expect(db.documentoElectronico.create({ data: datos })).rejects.toMatchObject({ code: "P2002" });
    // Probar en SIMULADO con el mismo prefijo no estorba el paso a producción (spec §11.10).
    await expect(db.documentoElectronico.create({ data: { ...datos, ambiente: "PRODUCCION" } })).resolves.toMatchObject({
      ambiente: "PRODUCCION",
      numero: 990000001,
    });
    await expect(
      db.documentoElectronico.create({ data: { ...datos, tipo: "NOTA_CREDITO", documentoReferenciaId: doc.id } }),
    ).resolves.toMatchObject({ documentoReferenciaId: doc.id });
  });
```

- [ ] **Step 2: Correr la prueba y verla fallar**

Run: `npx vitest run --project db src/lib/factura-electronica/migracion-db.test.ts`
Expected: FAIL — `activadaDesde` no existe (error de tipos/columna) y la creación en `PRODUCCION` choca con `P2002`.

- [ ] **Step 3: Cambiar el esquema**

En `prisma/tenant/schema.prisma`, modelo `ConfiguracionFacturaElectronica`, justo debajo de la línea de `ambienteProveedor`:

```prisma
  /// Primera vez que se activó: las facturas anteriores no cuentan como "sin enviar a la DIAN".
  activadaDesde                   DateTime?                           @map("activada_desde")
```

En el modelo `DocumentoElectronico`, reemplaza `@@unique([tipo, prefijo, numero])` por:

```prisma
  @@unique([tipo, ambiente, prefijo, numero])
```

- [ ] **Step 4: Corregir la migración en sitio**

En `prisma/tenant/migrations/20261120130000_factura_electronica/migration.sql`:

1. En el `CREATE TABLE "configuracion_factura_electronica"`, justo después de la línea de la columna `"ambiente_proveedor"`, agrega:

```sql
    "activada_desde" TIMESTAMP(3),
```

2. Reemplaza el índice único:

```sql
-- CreateIndex
CREATE UNIQUE INDEX "documentos_electronicos_tipo_ambiente_prefijo_numero_key" ON "documentos_electronicos"("tipo", "ambiente", "prefijo", "numero");
```

(se borra la línea `CREATE UNIQUE INDEX "documentos_electronicos_tipo_prefijo_numero_key" ...`).

3. Revisa que nada use el nombre viejo de la clave compuesta:

Run: `grep -rn "tipo_prefijo_numero" src prisma`
Expected: sin resultados (si aparece en código, cambiarlo a `tipo_ambiente_prefijo_numero`).

- [ ] **Step 5: Regenerar el cliente y correr la prueba**

Run: `npx prisma generate --schema=prisma/tenant/schema.prisma`
Run: `npx vitest run --project db src/lib/factura-electronica/migracion-db.test.ts`
Expected: PASS (3/3).

- [ ] **Step 6: Verificar y commit**

Run: `npx tsc --noEmit` → sin errores.
Run: `npx vitest run --project unit src/lib/factura-electronica` → PASS.

```bash
git add prisma/tenant/schema.prisma prisma/tenant/migrations/20261120130000_factura_electronica/migration.sql src/lib/factura-electronica/migracion-db.test.ts
git commit -m "fase-fe-task 10: numeración única por ambiente y fecha de activación"
git push origin fase-fe-factura-electronica
```

---

### Task 11: Permiso "Configurar facturación electrónica" y entrada en el menú

**Files:**
- Modify: `src/lib/auth/permisos.ts`, `src/lib/auth/permisos.test.ts`
- Modify: `src/app/(dashboard)/dashboard-sidebar.tsx`, `src/app/(dashboard)/dashboard-sidebar.test.tsx`

**Interfaces:**
- Produces: permiso `"facturaElectronica.configurar"` (Tasks 12, 13, 15).

- [ ] **Step 1: Pruebas que fallan**

Al final del `describe` principal de `src/lib/auth/permisos.test.ts` agrega:

```ts
  it("facturaElectronica.configurar: el ADMIN lo tiene; nadie más por rol; se agrega solo con facturar", () => {
    expect(permisosEfectivos({ role: "ADMIN" })).toContain("facturaElectronica.configurar");
    for (const role of ["RECEPCION", "JEFE_TALLER", "TECNICO"] as const) {
      expect(permisosEfectivos({ role })).not.toContain("facturaElectronica.configurar");
    }
    expect(permisosEfectivos({ role: "RECEPCION", agregados: ["facturaElectronica.configurar"] })).toContain(
      "facturaElectronica.configurar",
    );
    // TECNICO no factura: el requisito lo descarta.
    expect(permisosEfectivos({ role: "TECNICO", agregados: ["facturaElectronica.configurar"] })).not.toContain(
      "facturaElectronica.configurar",
    );
    expect(REQUISITOS["facturaElectronica.configurar"]).toEqual(["facturas.facturar"]);
  });
```

(si `REQUISITOS` no está importado en ese archivo, agrégalo al `import` de `./permisos`).

En `src/app/(dashboard)/dashboard-sidebar.test.tsx`, dentro del `describe("DashboardSidebar", ...)`, agrega:

```tsx
  it("Facturación electrónica: el ADMIN la ve; RECEPCION solo con el permiso agregado", () => {
    rutaActual = "/configuracion-factura-electronica";
    const { unmount } = renderMenu("ADMIN");
    expect(visible("Facturación electrónica")).toBe(true);
    unmount();

    renderMenu("RECEPCION");
    expect(visible("Facturación electrónica")).toBe(false);
  });

  it("RECEPCION con el permiso agregado ve Facturación electrónica", () => {
    rutaActual = "/configuracion-factura-electronica";
    render(
      <SidebarProvider>
        <DashboardSidebar
          permisos={permisosEfectivos({ role: "RECEPCION", agregados: ["facturaElectronica.configurar"] })}
          tenantSlug="taller"
          plan={null}
        />
      </SidebarProvider>,
    );
    expect(visible("Facturación electrónica")).toBe(true);
  });
```

- [ ] **Step 2: Correrlas y verlas fallar**

Run: `npx vitest run --project unit src/lib/auth/permisos.test.ts "src/app/(dashboard)/dashboard-sidebar.test.tsx"`
Expected: FAIL (el permiso no existe; el ítem no aparece).

- [ ] **Step 3: Implementar**

En `src/lib/auth/permisos.ts`, dentro de `PERMISOS`, justo antes de `"configuracion.taller"`:

```ts
  "facturaElectronica.configurar": { grupo: "Administración", etiqueta: "Configurar facturación electrónica" },
```

En `REQUISITOS`, al final:

```ts
  "facturaElectronica.configurar": ["facturas.facturar"],
```

No se agrega a ningún rol ni a `PERMISOS_SOLO_ADMIN` (spec §6: se puede dar a quien factura).

En `src/app/(dashboard)/dashboard-sidebar.tsx`: agrega `FileCheck` al import de `lucide-react` y, en `CONFIGURACION.items`, justo después del ítem de "Configuración del taller":

```ts
    {
      href: "/configuracion-factura-electronica",
      label: "Facturación electrónica",
      icon: FileCheck,
      permiso: "facturaElectronica.configurar",
    },
```

Si alguna prueba existente compara la lista completa del catálogo de permisos o del menú del ADMIN con `toEqual`, agrega allí la clave/etiqueta nueva en el mismo orden.

- [ ] **Step 4: Correr las pruebas**

Run: `npx vitest run --project unit src/lib/auth "src/app/(dashboard)/dashboard-sidebar.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Verificar y commit**

Run: `npx tsc --noEmit` y `npx eslint src/lib/auth/permisos.ts "src/app/(dashboard)/dashboard-sidebar.tsx"`.

```bash
git add src/lib/auth/permisos.ts src/lib/auth/permisos.test.ts "src/app/(dashboard)/dashboard-sidebar.tsx" "src/app/(dashboard)/dashboard-sidebar.test.tsx"
git commit -m "fase-fe-task 11: permiso para configurar la facturación electrónica"
git push origin fase-fe-factura-electronica
```

---

### Task 12: Acciones de la configuración (leer, guardar, probar conexión)

**Files:**
- Create: `src/lib/validation/factura-electronica.ts`, `src/lib/validation/factura-electronica.test.ts`
- Create: `src/app/actions/factura-electronica-config-actions.ts`, `src/app/actions/factura-electronica-config-actions.test.ts`

**Interfaces:**
- Consumes: `leerConfiguracionFe`, `crearProveedorDesdeConfig`, `ErrorConfiguracionFe`, `diaIso` (`@/lib/factura-electronica/configuracion`); `calcularDvNit`, `RESPONSABILIDADES_FISCALES`, `TIPOS_DOCUMENTO_IDENTIDAD` (`@/modulos/factura-electronica`); `cifrarSecreto` (`@/lib/crypto/secret-box`); permiso de Task 11; `activadaDesde` de Task 10.
- Produces (Task 13):
  - `interface ConfiguracionFeVista` (abajo), `getConfiguracionFe(): Promise<ConfiguracionFeVista>`
  - `interface ConfigFeFormState { error: string | null; success: boolean; mensaje: string | null }`
  - `guardarConfiguracionFeAction(prev: ConfigFeFormState, formData: FormData): Promise<ConfigFeFormState>`
  - `probarConexionFeAction(prev: ConfigFeFormState, formData: FormData): Promise<ConfigFeFormState>`
- Produces (Task 17): `datosFeClienteSchema`, `type DatosFeClienteInput` en `src/lib/validation/factura-electronica.ts`.

- [ ] **Step 1: Pruebas del esquema (fallan)**

Crea `src/lib/validation/factura-electronica.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calcularDvNit } from "@/modulos/factura-electronica";
import { configuracionFeInputSchema, datosFeClienteSchema } from "./factura-electronica";

const NIT = "900123456";
const base = {
  activa: "on",
  envio: "AUTOMATICO",
  ambiente: "PRUEBAS",
  cuenta: "PROPIA",
  token: "",
  nit: NIT,
  dv: calcularDvNit(NIT),
  razonSocial: "Taller Pérez S.A.S.",
  regimen: "48",
  responsabilidadFiscal: "O-13",
  municipioCodigo: "05001",
  direccion: "Calle 10 # 20-30",
  resolucionNumero: "18760000001",
  prefijo: "SETP",
  rangoDesde: "990000000",
  rangoHasta: "995000000",
  vigenciaDesde: "2026-01-01",
  vigenciaHasta: "2027-12-31",
  prefijoNotaCredito: "NC",
  resultadoSimulado: "ACEPTAR",
  confirmarProduccion: "",
};

describe("configuracionFeInputSchema", () => {
  it("acepta una configuración completa y convierte números, fechas y la casilla", () => {
    const r = configuracionFeInputSchema.parse(base);
    expect(r).toMatchObject({ activa: true, rangoDesde: 990000000, rangoHasta: 995000000, vigenciaDesde: "2026-01-01" });
  });

  it("los campos vacíos quedan en null y la casilla sin marcar es false", () => {
    const r = configuracionFeInputSchema.parse({ ...base, activa: "", nit: "", dv: "", rangoDesde: "", vigenciaHasta: "" });
    expect(r).toMatchObject({ activa: false, nit: null, dv: null, rangoDesde: null, vigenciaHasta: null });
  });

  it("rechaza un DV que no corresponde al NIT", () => {
    const dvMalo = String((Number(calcularDvNit(NIT)) + 1) % 10);
    const r = configuracionFeInputSchema.safeParse({ ...base, dv: dvMalo });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("El dígito de verificación no corresponde al NIT.");
  });

  it("rechaza un rango al revés y una vigencia al revés", () => {
    expect(configuracionFeInputSchema.safeParse({ ...base, rangoDesde: "10", rangoHasta: "5" }).success).toBe(false);
    expect(
      configuracionFeInputSchema.safeParse({ ...base, vigenciaDesde: "2027-01-01", vigenciaHasta: "2026-01-01" }).success,
    ).toBe(false);
  });

  it("rechaza municipio que no son 5 dígitos y responsabilidad desconocida", () => {
    expect(configuracionFeInputSchema.safeParse({ ...base, municipioCodigo: "5001" }).success).toBe(false);
    expect(configuracionFeInputSchema.safeParse({ ...base, responsabilidadFiscal: "X-1" }).success).toBe(false);
  });
});

describe("datosFeClienteSchema", () => {
  it("acepta datos completos y deja en null lo vacío", () => {
    expect(
      datosFeClienteSchema.parse({
        tipoDocumento: "13",
        dv: "",
        tipoPersona: "NATURAL",
        responsabilidadFiscal: "R-99-PN",
        municipioCodigo: "11001",
        direccion: "Cra 7 # 1-2",
      }),
    ).toEqual({
      tipoDocumento: "13",
      dv: null,
      tipoPersona: "NATURAL",
      responsabilidadFiscal: "R-99-PN",
      municipioCodigo: "11001",
      direccion: "Cra 7 # 1-2",
    });
  });

  it("rechaza tipo de documento desconocido", () => {
    expect(
      datosFeClienteSchema.safeParse({
        tipoDocumento: "99",
        dv: "",
        tipoPersona: "",
        responsabilidadFiscal: "",
        municipioCodigo: "",
        direccion: "",
      }).success,
    ).toBe(false);
  });
});
```

Run: `npx vitest run --project unit src/lib/validation/factura-electronica.test.ts`
Expected: FAIL ("Cannot find module './factura-electronica'").

- [ ] **Step 2: Implementar el esquema**

Crea `src/lib/validation/factura-electronica.ts`:

```ts
import { z } from "zod";
import { RESPONSABILIDADES_FISCALES, TIPOS_DOCUMENTO_IDENTIDAD, calcularDvNit } from "@/modulos/factura-electronica";

const tiene = (objeto: object, clave: string) => Object.prototype.hasOwnProperty.call(objeto, clave);

/** "" → null; si no, el texto recortado. */
const textoOpcional = z
  .string()
  .transform((v) => v.trim())
  .transform((v) => (v === "" ? null : v));

const enteroOpcional = textoOpcional.refine((v) => v === null || /^\d{1,10}$/.test(v), "Debe ser un número entero.").transform(
  (v) => (v === null ? null : Number(v)),
);

const diaOpcional = textoOpcional.refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Fecha inválida.");

const casilla = z.string().transform((v) => v === "on");

const responsabilidadOpcional = textoOpcional.refine(
  (v) => v === null || tiene(RESPONSABILIDADES_FISCALES, v),
  "Responsabilidad fiscal desconocida.",
);

const municipioOpcional = textoOpcional.refine((v) => v === null || /^\d{5}$/.test(v), "El municipio debe ser un código DANE de 5 dígitos.");

function dvCorresponde(nit: string | null, dv: string | null): boolean {
  if (!nit || !dv) return true;
  try {
    return calcularDvNit(nit) === dv;
  } catch {
    return false;
  }
}

export const configuracionFeInputSchema = z
  .object({
    activa: casilla,
    envio: z.enum(["AUTOMATICO", "MANUAL"]),
    ambiente: z.enum(["SIMULADO", "PRUEBAS", "PRODUCCION"]),
    cuenta: z.enum(["BOLSA", "PROPIA"]),
    token: z.string().transform((v) => v.trim()),
    nit: textoOpcional.refine((v) => v === null || /^\d{5,15}$/.test(v), "El NIT va sin puntos, guiones ni DV."),
    dv: textoOpcional.refine((v) => v === null || /^\d$/.test(v), "El DV es un solo dígito."),
    razonSocial: textoOpcional,
    regimen: textoOpcional.refine((v) => v === null || v === "48" || v === "49", "Régimen inválido."),
    responsabilidadFiscal: responsabilidadOpcional,
    municipioCodigo: municipioOpcional,
    direccion: textoOpcional,
    resolucionNumero: textoOpcional,
    prefijo: textoOpcional.refine((v) => v === null || /^[A-Za-z0-9]{1,4}$/.test(v), "El prefijo tiene hasta 4 letras o números."),
    rangoDesde: enteroOpcional,
    rangoHasta: enteroOpcional,
    vigenciaDesde: diaOpcional,
    vigenciaHasta: diaOpcional,
    prefijoNotaCredito: textoOpcional.refine(
      (v) => v === null || /^[A-Za-z0-9]{1,4}$/.test(v),
      "El prefijo de notas crédito tiene hasta 4 letras o números.",
    ),
    resultadoSimulado: z.enum(["ACEPTAR", "RECHAZAR", "CAIDA", "CAIDA_RECIBIDO"]),
    confirmarProduccion: z.string(),
  })
  .refine((d) => dvCorresponde(d.nit, d.dv), { message: "El dígito de verificación no corresponde al NIT.", path: ["dv"] })
  .refine((d) => d.rangoDesde === null || d.rangoHasta === null || d.rangoDesde <= d.rangoHasta, {
    message: "El rango de la resolución está al revés.",
    path: ["rangoHasta"],
  })
  .refine((d) => d.vigenciaDesde === null || d.vigenciaHasta === null || d.vigenciaDesde <= d.vigenciaHasta, {
    message: "La vigencia de la resolución está al revés.",
    path: ["vigenciaHasta"],
  });

export type ConfiguracionFeInput = z.output<typeof configuracionFeInputSchema>;

export const datosFeClienteSchema = z.object({
  tipoDocumento: textoOpcional.refine((v) => v === null || tiene(TIPOS_DOCUMENTO_IDENTIDAD, v), "Tipo de documento desconocido."),
  dv: textoOpcional.refine((v) => v === null || /^\d$/.test(v), "El DV es un solo dígito."),
  tipoPersona: textoOpcional.refine((v) => v === null || v === "NATURAL" || v === "JURIDICA", "Tipo de persona inválido.").transform(
    (v) => v as "NATURAL" | "JURIDICA" | null,
  ),
  responsabilidadFiscal: responsabilidadOpcional,
  municipioCodigo: municipioOpcional,
  direccion: textoOpcional,
});

export type DatosFeClienteInput = z.output<typeof datosFeClienteSchema>;
```

Run: `npx vitest run --project unit src/lib/validation/factura-electronica.test.ts`
Expected: PASS.

- [ ] **Step 3: Pruebas de las acciones (fallan)**

Crea `src/app/actions/factura-electronica-config-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequirePermiso = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requirePermiso: (...args: unknown[]) => mockRequirePermiso(...args),
  requireSession: vi.fn(),
}));

const mockFindUnique = vi.fn();
const mockUpsert = vi.fn();
const mockUpdate = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    configuracionFacturaElectronica: { findUnique: mockFindUnique, upsert: mockUpsert, update: mockUpdate },
  }),
}));

const mockProbar = vi.fn();
const mockCrearProveedor = vi.fn(() => ({ probarConexion: mockProbar }));
vi.mock("@/lib/factura-electronica/configuracion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/factura-electronica/configuracion")>()),
  crearProveedorDesdeConfig: (...args: unknown[]) => mockCrearProveedor(...(args as [])),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { calcularDvNit } from "@/modulos/factura-electronica";
import {
  getConfiguracionFe,
  guardarConfiguracionFeAction,
  probarConexionFeAction,
  type ConfigFeFormState,
} from "./factura-electronica-config-actions";

const SESION = { user: { id: "u1", tenantSchema: "taller_x", sedeActivaId: "s1", permisos: [] } };
const inicial: ConfigFeFormState = { error: null, success: false, mensaje: null };
const NIT = "900123456";

function form(campos: Record<string, string> = {}): FormData {
  const valores: Record<string, string> = {
    activa: "on",
    envio: "AUTOMATICO",
    ambiente: "SIMULADO",
    cuenta: "PROPIA",
    token: "",
    nit: NIT,
    dv: calcularDvNit(NIT),
    razonSocial: "Taller Pérez",
    regimen: "48",
    responsabilidadFiscal: "O-13",
    municipioCodigo: "05001",
    direccion: "Calle 1",
    resolucionNumero: "18760000001",
    prefijo: "SETP",
    rangoDesde: "1",
    rangoHasta: "5000",
    vigenciaDesde: "2026-01-01",
    vigenciaHasta: "2027-12-31",
    prefijoNotaCredito: "NC",
    resultadoSimulado: "ACEPTAR",
    confirmarProduccion: "",
    ...campos,
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries(valores)) fd.set(k, v);
  return fd;
}

function fila(extra: Record<string, unknown> = {}) {
  return {
    id: "singleton",
    activa: false,
    envio: "AUTOMATICO",
    ambiente: "SIMULADO",
    cuenta: "PROPIA",
    tokenCifrado: null,
    nit: NIT,
    dv: calcularDvNit(NIT),
    razonSocial: "Taller Pérez",
    regimen: "48",
    responsabilidadFiscal: "O-13",
    municipioCodigo: "05001",
    direccion: "Calle 1",
    resolucionNumero: "18760000001",
    prefijo: "SETP",
    rangoDesde: 1,
    rangoHasta: 5000,
    vigenciaDesde: new Date("2026-01-01T00:00:00.000Z"),
    vigenciaHasta: new Date("2027-12-31T00:00:00.000Z"),
    siguienteConsecutivo: 40,
    prefijoNotaCredito: "NC",
    siguienteConsecutivoNotaCredito: 1,
    resultadoSimulado: "ACEPTAR",
    ultimaPruebaAt: null,
    ultimaPruebaExitosa: null,
    ultimaPruebaMensaje: null,
    ambienteProveedor: null,
    activadaDesde: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequirePermiso.mockResolvedValue(SESION);
  process.env.SMTP_ENCRYPTION_KEY = "0".repeat(63) + "1";
});

describe("getConfiguracionFe", () => {
  it("pide el permiso de configurar y, sin fila, devuelve los valores por defecto", async () => {
    mockFindUnique.mockResolvedValue(null);
    const vista = await getConfiguracionFe();
    expect(mockRequirePermiso).toHaveBeenCalledWith("facturaElectronica.configurar");
    expect(vista).toMatchObject({ activa: false, ambiente: "SIMULADO", cuenta: "BOLSA", tokenConfigurado: false, siguienteConsecutivo: 1 });
  });

  it("nunca devuelve el token y lee las fechas como día", async () => {
    mockFindUnique.mockResolvedValue(fila({ tokenCifrado: "v1:x:y:z" }));
    const vista = await getConfiguracionFe();
    expect(vista).not.toHaveProperty("tokenCifrado");
    expect(vista).toMatchObject({ tokenConfigurado: true, vigenciaDesde: "2026-01-01", vigenciaHasta: "2027-12-31" });
  });
});

describe("guardarConfiguracionFeAction", () => {
  it("guarda, cifra el token nuevo y marca la fecha de activación la primera vez", async () => {
    mockFindUnique.mockResolvedValue(fila());
    const r = await guardarConfiguracionFeAction(inicial, form({ token: "tok-123" }));
    expect(r).toEqual({ error: null, success: true, mensaje: "Configuración guardada." });
    const { update } = mockUpsert.mock.calls[0][0];
    expect(update.tokenCifrado).toMatch(/^v1:/);
    expect(update.activadaDesde).toBeInstanceOf(Date);
    expect(update.vigenciaDesde).toEqual(new Date("2026-01-01T00:00:00.000Z"));
    // La resolución no cambió: el consecutivo se conserva.
    expect(update).not.toHaveProperty("siguienteConsecutivo");
  });

  it("con el token en blanco conserva el guardado y no vuelve a fechar la activación", async () => {
    const activada = new Date("2026-05-01T00:00:00.000Z");
    mockFindUnique.mockResolvedValue(fila({ tokenCifrado: "v1:viejo", activa: true, activadaDesde: activada }));
    await guardarConfiguracionFeAction(inicial, form());
    const { update } = mockUpsert.mock.calls[0][0];
    expect(update.tokenCifrado).toBe("v1:viejo");
    expect(update).not.toHaveProperty("activadaDesde");
  });

  it("una resolución nueva reinicia el consecutivo al inicio del rango", async () => {
    mockFindUnique.mockResolvedValue(fila());
    await guardarConfiguracionFeAction(inicial, form({ resolucionNumero: "18760000999", rangoDesde: "100", rangoHasta: "900" }));
    expect(mockUpsert.mock.calls[0][0].update.siguienteConsecutivo).toBe(100);
  });

  it("pasar a producción pide confirmación", async () => {
    mockFindUnique.mockResolvedValue(fila({ ambiente: "PRUEBAS", tokenCifrado: "v1:t" }));
    const sin = await guardarConfiguracionFeAction(inicial, form({ ambiente: "PRODUCCION" }));
    expect(sin).toEqual({
      error: "Confirma el paso a producción: desde ahí las facturas tienen validez ante la DIAN.",
      success: false,
      mensaje: null,
    });
    expect(mockUpsert).not.toHaveBeenCalled();
    const con = await guardarConfiguracionFeAction(inicial, form({ ambiente: "PRODUCCION", confirmarProduccion: "si" }));
    expect(con.success).toBe(true);
  });

  it("activa fuera de Simulado exige emisor, resolución y token propio", async () => {
    mockFindUnique.mockResolvedValue(fila());
    const r = await guardarConfiguracionFeAction(inicial, form({ ambiente: "PRUEBAS", razonSocial: "" }));
    expect(r.error).toBe("Para activar fuera de Simulado faltan: razón social, token del proveedor.");
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("con la bolsa de TorqueFlow no deja activar fuera de Simulado si TorqueFlow aún no registró el token", async () => {
    mockFindUnique.mockResolvedValue(fila({ cuenta: "BOLSA" }));
    const r = await guardarConfiguracionFeAction(inicial, form({ ambiente: "PRUEBAS", cuenta: "BOLSA", token: "intento" }));
    expect(r.error).toBe("Para activar fuera de Simulado faltan: token del proveedor (con la bolsa de TorqueFlow lo registra TorqueFlow).");
  });

  it("devuelve el primer error de validación", async () => {
    mockFindUnique.mockResolvedValue(fila());
    const r = await guardarConfiguracionFeAction(inicial, form({ dv: "", nit: "12" }));
    expect(r).toEqual({ error: "El NIT va sin puntos, guiones ni DV.", success: false, mensaje: null });
  });
});

describe("probarConexionFeAction", () => {
  it("guarda el resultado y el ambiente que informa el proveedor", async () => {
    mockFindUnique.mockResolvedValue(fila({ ambiente: "PRUEBAS", tokenCifrado: "v1:t" }));
    mockProbar.mockResolvedValue({ ok: true, ambiente: "PRUEBAS" });
    const r = await probarConexionFeAction(inicial, new FormData());
    expect(r).toEqual({ error: null, success: true, mensaje: "Conexión correcta. El proveedor está en pruebas." });
    expect(mockUpdate.mock.calls[0][0].data).toMatchObject({ ultimaPruebaExitosa: true, ambienteProveedor: "PRUEBAS" });
  });

  it("avisa si el proveedor está en otro ambiente", async () => {
    mockFindUnique.mockResolvedValue(fila({ ambiente: "PRODUCCION", tokenCifrado: "v1:t" }));
    mockProbar.mockResolvedValue({ ok: true, ambiente: "PRUEBAS" });
    const r = await probarConexionFeAction(inicial, new FormData());
    expect(r.error).toBe(
      "Hay conexión, pero el proveedor está en pruebas y el taller en producción. No se enviará nada hasta que coincidan.",
    );
    expect(mockUpdate.mock.calls[0][0].data.ultimaPruebaExitosa).toBe(false);
  });

  it("un error de configuración se guarda como prueba fallida", async () => {
    const { ErrorConfiguracionFe } = await import("@/lib/factura-electronica/configuracion");
    mockFindUnique.mockResolvedValue(fila({ ambiente: "PRUEBAS" }));
    mockCrearProveedor.mockImplementationOnce(() => {
      throw new ErrorConfiguracionFe("Falta el token.");
    });
    const r = await probarConexionFeAction(inicial, new FormData());
    expect(r).toEqual({ error: "Falta el token.", success: false, mensaje: null });
    expect(mockUpdate.mock.calls[0][0].data).toMatchObject({ ultimaPruebaExitosa: false, ultimaPruebaMensaje: "Falta el token." });
  });

  it("sin configuración guardada no prueba nada", async () => {
    mockFindUnique.mockResolvedValue(null);
    const r = await probarConexionFeAction(inicial, new FormData());
    expect(r.error).toBe("Guarda la configuración antes de probar la conexión.");
    expect(mockCrearProveedor).not.toHaveBeenCalled();
  });
});
```

Run: `npx vitest run --project unit src/app/actions/factura-electronica-config-actions.test.ts`
Expected: FAIL ("Cannot find module").

- [ ] **Step 4: Implementar las acciones**

Crea `src/app/actions/factura-electronica-config-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requirePermiso } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { cifrarSecreto } from "@/lib/crypto/secret-box";
import {
  ErrorConfiguracionFe,
  crearProveedorDesdeConfig,
  diaIso,
  leerConfiguracionFe,
  type ConfiguracionFe,
} from "@/lib/factura-electronica/configuracion";
import { configuracionFeInputSchema, type ConfiguracionFeInput } from "@/lib/validation/factura-electronica";
import type {
  AmbienteFacturaElectronica,
  CuentaFacturaElectronica,
  EnvioFacturaElectronica,
  ResultadoSimuladoFacturaElectronica,
} from "@/generated/prisma-tenant";

const RUTA = "/configuracion-factura-electronica";
const ID = "singleton";

export interface ConfigFeFormState {
  error: string | null;
  success: boolean;
  mensaje: string | null;
}

/** Lo que ve la pantalla: nunca el token, solo si hay uno guardado. Fechas de resolución como "YYYY-MM-DD". */
export interface ConfiguracionFeVista {
  activa: boolean;
  envio: EnvioFacturaElectronica;
  ambiente: AmbienteFacturaElectronica;
  cuenta: CuentaFacturaElectronica;
  tokenConfigurado: boolean;
  nit: string | null;
  dv: string | null;
  razonSocial: string | null;
  regimen: string | null;
  responsabilidadFiscal: string | null;
  municipioCodigo: string | null;
  direccion: string | null;
  resolucionNumero: string | null;
  prefijo: string | null;
  rangoDesde: number | null;
  rangoHasta: number | null;
  vigenciaDesde: string | null;
  vigenciaHasta: string | null;
  siguienteConsecutivo: number;
  prefijoNotaCredito: string | null;
  resultadoSimulado: ResultadoSimuladoFacturaElectronica;
  ultimaPruebaAt: Date | null;
  ultimaPruebaExitosa: boolean | null;
  ultimaPruebaMensaje: string | null;
  ambienteProveedor: AmbienteFacturaElectronica | null;
}

const VISTA_VACIA: ConfiguracionFeVista = {
  activa: false,
  envio: "AUTOMATICO",
  ambiente: "SIMULADO",
  cuenta: "BOLSA",
  tokenConfigurado: false,
  nit: null,
  dv: null,
  razonSocial: null,
  regimen: null,
  responsabilidadFiscal: null,
  municipioCodigo: null,
  direccion: null,
  resolucionNumero: null,
  prefijo: null,
  rangoDesde: null,
  rangoHasta: null,
  vigenciaDesde: null,
  vigenciaHasta: null,
  siguienteConsecutivo: 1,
  prefijoNotaCredito: null,
  resultadoSimulado: "ACEPTAR",
  ultimaPruebaAt: null,
  ultimaPruebaExitosa: null,
  ultimaPruebaMensaje: null,
  ambienteProveedor: null,
};

const NOMBRE_AMBIENTE: Record<AmbienteFacturaElectronica, string> = {
  SIMULADO: "simulado",
  PRUEBAS: "pruebas",
  PRODUCCION: "producción",
};

function aVista(c: ConfiguracionFe): ConfiguracionFeVista {
  return {
    activa: c.activa,
    envio: c.envio,
    ambiente: c.ambiente,
    cuenta: c.cuenta,
    tokenConfigurado: Boolean(c.tokenCifrado),
    nit: c.nit,
    dv: c.dv,
    razonSocial: c.razonSocial,
    regimen: c.regimen,
    responsabilidadFiscal: c.responsabilidadFiscal,
    municipioCodigo: c.municipioCodigo,
    direccion: c.direccion,
    resolucionNumero: c.resolucionNumero,
    prefijo: c.prefijo,
    rangoDesde: c.rangoDesde,
    rangoHasta: c.rangoHasta,
    vigenciaDesde: c.vigenciaDesde ? diaIso(c.vigenciaDesde) : null,
    vigenciaHasta: c.vigenciaHasta ? diaIso(c.vigenciaHasta) : null,
    siguienteConsecutivo: c.siguienteConsecutivo,
    prefijoNotaCredito: c.prefijoNotaCredito,
    resultadoSimulado: c.resultadoSimulado,
    ultimaPruebaAt: c.ultimaPruebaAt,
    ultimaPruebaExitosa: c.ultimaPruebaExitosa,
    ultimaPruebaMensaje: c.ultimaPruebaMensaje,
    ambienteProveedor: c.ambienteProveedor,
  };
}

export async function getConfiguracionFe(): Promise<ConfiguracionFeVista> {
  const session = await requirePermiso("facturaElectronica.configurar");
  const fila = await leerConfiguracionFe(getTenantDb(session.user.tenantSchema));
  return fila ? aVista(fila) : VISTA_VACIA;
}

const aDia = (dia: string | null) => (dia === null ? null : new Date(`${dia}T00:00:00.000Z`));

/** Qué falta para enviar de verdad (fuera de Simulado). */
function faltantesParaActivar(d: ConfiguracionFeInput, tokenCifrado: string | null): string[] {
  const faltan: string[] = [];
  if (!d.nit || !d.dv) faltan.push("NIT y DV");
  if (!d.razonSocial) faltan.push("razón social");
  if (!d.regimen || !d.responsabilidadFiscal) faltan.push("régimen y responsabilidad fiscal");
  if (!d.municipioCodigo || !d.direccion) faltan.push("municipio y dirección");
  if (!d.resolucionNumero || !d.prefijo || d.rangoDesde === null || d.rangoHasta === null || !d.vigenciaDesde || !d.vigenciaHasta) {
    faltan.push("datos de la resolución");
  }
  if (!tokenCifrado) {
    faltan.push(
      d.cuenta === "BOLSA" ? "token del proveedor (con la bolsa de TorqueFlow lo registra TorqueFlow)" : "token del proveedor",
    );
  }
  return faltan;
}

export async function guardarConfiguracionFeAction(_prev: ConfigFeFormState, formData: FormData): Promise<ConfigFeFormState> {
  const session = await requirePermiso("facturaElectronica.configurar");
  const campo = (nombre: string) => String(formData.get(nombre) ?? "");
  const parsed = configuracionFeInputSchema.safeParse({
    activa: campo("activa"),
    envio: campo("envio"),
    ambiente: campo("ambiente"),
    cuenta: campo("cuenta"),
    token: campo("token"),
    nit: campo("nit"),
    dv: campo("dv"),
    razonSocial: campo("razonSocial"),
    regimen: campo("regimen"),
    responsabilidadFiscal: campo("responsabilidadFiscal"),
    municipioCodigo: campo("municipioCodigo"),
    direccion: campo("direccion"),
    resolucionNumero: campo("resolucionNumero"),
    prefijo: campo("prefijo"),
    rangoDesde: campo("rangoDesde"),
    rangoHasta: campo("rangoHasta"),
    vigenciaDesde: campo("vigenciaDesde"),
    vigenciaHasta: campo("vigenciaHasta"),
    prefijoNotaCredito: campo("prefijoNotaCredito"),
    resultadoSimulado: campo("resultadoSimulado") || "ACEPTAR",
    confirmarProduccion: campo("confirmarProduccion"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos.", success: false, mensaje: null };
  }
  const d = parsed.data;
  const db = getTenantDb(session.user.tenantSchema);
  const existente = await leerConfiguracionFe(db);

  if (d.ambiente === "PRODUCCION" && existente?.ambiente !== "PRODUCCION" && d.confirmarProduccion !== "si") {
    return {
      error: "Confirma el paso a producción: desde ahí las facturas tienen validez ante la DIAN.",
      success: false,
      mensaje: null,
    };
  }

  // Con la bolsa, el token lo registra TorqueFlow (super-admin, Plan 2c): el taller no lo cambia.
  const tokenCifrado = d.cuenta === "PROPIA" && d.token ? cifrarSecreto(d.token) : (existente?.tokenCifrado ?? null);

  if (d.activa && d.ambiente !== "SIMULADO") {
    const faltan = faltantesParaActivar(d, tokenCifrado);
    if (faltan.length > 0) {
      return { error: `Para activar fuera de Simulado faltan: ${faltan.join(", ")}.`, success: false, mensaje: null };
    }
  }

  const resolucionNueva =
    !existente ||
    existente.resolucionNumero !== d.resolucionNumero ||
    existente.prefijo !== d.prefijo ||
    existente.rangoDesde !== d.rangoDesde;

  const campos = {
    activa: d.activa,
    envio: d.envio,
    ambiente: d.ambiente,
    cuenta: d.cuenta,
    tokenCifrado,
    nit: d.nit,
    dv: d.dv,
    razonSocial: d.razonSocial,
    regimen: d.regimen,
    responsabilidadFiscal: d.responsabilidadFiscal,
    municipioCodigo: d.municipioCodigo,
    direccion: d.direccion,
    resolucionNumero: d.resolucionNumero,
    prefijo: d.prefijo,
    rangoDesde: d.rangoDesde,
    rangoHasta: d.rangoHasta,
    vigenciaDesde: aDia(d.vigenciaDesde),
    vigenciaHasta: aDia(d.vigenciaHasta),
    prefijoNotaCredito: d.prefijoNotaCredito,
    resultadoSimulado: d.resultadoSimulado,
    // Resolución nueva → se arranca en el inicio de su rango (spec §11.10).
    ...(resolucionNueva ? { siguienteConsecutivo: d.rangoDesde ?? 1 } : {}),
    // Primera activación: las facturas anteriores no cuentan como "sin enviar" (spec §11.11).
    ...(d.activa && !existente?.activadaDesde ? { activadaDesde: new Date() } : {}),
  };

  try {
    await db.configuracionFacturaElectronica.upsert({ where: { id: ID }, create: { id: ID, ...campos }, update: campos });
  } catch (err) {
    return {
      error: friendlyPrismaErrorMessage(err, "Error al guardar la configuración de facturación electrónica"),
      success: false,
      mensaje: null,
    };
  }
  revalidatePath(RUTA);
  return { error: null, success: true, mensaje: "Configuración guardada." };
}

export async function probarConexionFeAction(_prev: ConfigFeFormState, _formData: FormData): Promise<ConfigFeFormState> {
  const session = await requirePermiso("facturaElectronica.configurar");
  const db = getTenantDb(session.user.tenantSchema);
  const config = await leerConfiguracionFe(db);
  if (!config) return { error: "Guarda la configuración antes de probar la conexión.", success: false, mensaje: null };

  const guardar = (exitosa: boolean, mensaje: string, ambienteProveedor: AmbienteFacturaElectronica | null) =>
    db.configuracionFacturaElectronica.update({
      where: { id: ID },
      data: { ultimaPruebaAt: new Date(), ultimaPruebaExitosa: exitosa, ultimaPruebaMensaje: mensaje, ambienteProveedor },
    });

  let resultado: Awaited<ReturnType<ReturnType<typeof crearProveedorDesdeConfig>["probarConexion"]>>;
  try {
    resultado = await crearProveedorDesdeConfig(config, session.user.tenantSchema).probarConexion();
  } catch (e) {
    const mensaje =
      e instanceof ErrorConfiguracionFe ? e.message : "No se pudo probar la conexión con el proveedor. Intenta de nuevo.";
    await guardar(false, mensaje, null);
    revalidatePath(RUTA);
    return { error: mensaje, success: false, mensaje: null };
  }

  if (!resultado.ok) {
    await guardar(false, resultado.mensaje, null);
    revalidatePath(RUTA);
    return { error: resultado.mensaje, success: false, mensaje: null };
  }

  const ambiente = resultado.ambiente;
  if (config.ambiente !== "SIMULADO" && ambiente !== config.ambiente) {
    const mensaje = ambiente
      ? `Hay conexión, pero el proveedor está en ${NOMBRE_AMBIENTE[ambiente]} y el taller en ${NOMBRE_AMBIENTE[config.ambiente]}. No se enviará nada hasta que coincidan.`
      : "Hay conexión, pero el proveedor no informó su ambiente. No se enviará nada hasta confirmarlo.";
    await guardar(false, mensaje, ambiente);
    revalidatePath(RUTA);
    return { error: mensaje, success: false, mensaje: null };
  }

  const mensaje = ambiente ? `Conexión correcta. El proveedor está en ${NOMBRE_AMBIENTE[ambiente]}.` : "Conexión correcta.";
  await guardar(true, mensaje, ambiente);
  revalidatePath(RUTA);
  return { error: null, success: true, mensaje };
}
```

- [ ] **Step 5: Correr las pruebas**

Run: `npx vitest run --project unit src/lib/validation/factura-electronica.test.ts src/app/actions/factura-electronica-config-actions.test.ts`
Expected: PASS.

- [ ] **Step 6: Verificar y commit**

Run: `npx tsc --noEmit`, `npx eslint src/lib/validation/factura-electronica.ts src/app/actions/factura-electronica-config-actions.ts`.

```bash
git add src/lib/validation/factura-electronica.ts src/lib/validation/factura-electronica.test.ts src/app/actions/factura-electronica-config-actions.ts src/app/actions/factura-electronica-config-actions.test.ts
git commit -m "fase-fe-task 12: acciones para leer, guardar y probar la configuración"
git push origin fase-fe-factura-electronica
```

---

### Task 13: Pestaña "Facturación electrónica" en Configuración del taller

**Files:**
- Create: `src/lib/factura-electronica/avisos-resolucion.ts`, `src/lib/factura-electronica/avisos-resolucion.test.ts`
- Create: `src/components/campo-municipio.tsx`, `src/components/campo-municipio.test.tsx`
- Modify: `src/app/(dashboard)/pestanas-configuracion.tsx`, `src/app/(dashboard)/pestanas-configuracion.test.tsx`
- Create: `src/app/(dashboard)/configuracion-factura-electronica/page.tsx`
- Create: `src/app/(dashboard)/configuracion-factura-electronica/configuracion-fe-form.tsx`, `configuracion-fe-form.test.tsx`

**Interfaces:**
- Consumes: Task 12 (`getConfiguracionFe`, `guardarConfiguracionFeAction`, `probarConexionFeAction`, `ConfiguracionFeVista`, `ConfigFeFormState`); `MUNICIPIOS`, `RESPONSABILIDADES_FISCALES` del núcleo.
- Produces:
  - `avisosResolucion(c: { rangoHasta: number | null; vigenciaHasta: string | null; siguienteConsecutivo: number }, hoy: string): string[]` (`hoy` = "YYYY-MM-DD")
  - `CampoMunicipio({ municipios, name, defaultValue, id }: { municipios: { codigo: string; nombre: string; departamento: string }[]; name: string; defaultValue: string | null; id: string })` (Task 17)
  - `EncabezadoConfiguracion({ actual, permisos? })` con `actual` que admite `"/configuracion-factura-electronica"`.

- [ ] **Step 1: Pruebas que fallan**

Crea `src/lib/factura-electronica/avisos-resolucion.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { avisosResolucion } from "./avisos-resolucion";

describe("avisosResolucion", () => {
  it("sin avisos cuando sobra rango y vigencia", () => {
    expect(avisosResolucion({ rangoHasta: 5000, vigenciaHasta: "2027-12-31", siguienteConsecutivo: 10 }, "2026-11-21")).toEqual([]);
  });

  it("avisa cuando quedan 100 números o menos", () => {
    expect(avisosResolucion({ rangoHasta: 1000, vigenciaHasta: "2027-12-31", siguienteConsecutivo: 901 }, "2026-11-21")).toEqual([
      "Quedan 100 números de la resolución. Pide una nueva a la DIAN.",
    ]);
  });

  it("avisa cuando el rango se agotó", () => {
    expect(avisosResolucion({ rangoHasta: 1000, vigenciaHasta: "2027-12-31", siguienteConsecutivo: 1001 }, "2026-11-21")).toEqual([
      "Se acabaron los números de la resolución: no se pueden enviar facturas hasta registrar una nueva.",
    ]);
  });

  it("avisa cuando faltan 30 días o menos de vigencia, y cuando ya venció", () => {
    expect(avisosResolucion({ rangoHasta: 5000, vigenciaHasta: "2026-12-21", siguienteConsecutivo: 1 }, "2026-11-21")).toEqual([
      "La resolución vence en 30 días (2026-12-21).",
    ]);
    expect(avisosResolucion({ rangoHasta: 5000, vigenciaHasta: "2026-11-20", siguienteConsecutivo: 1 }, "2026-11-21")).toEqual([
      "La resolución venció el 2026-11-20: no se pueden enviar facturas hasta registrar una nueva.",
    ]);
  });

  it("sin datos de resolución no avisa nada", () => {
    expect(avisosResolucion({ rangoHasta: null, vigenciaHasta: null, siguienteConsecutivo: 1 }, "2026-11-21")).toEqual([]);
  });
});
```

Crea `src/components/campo-municipio.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { CampoMunicipio } from "./campo-municipio";

const MUNICIPIOS = [
  { codigo: "05001", nombre: "Medellín", departamento: "Antioquia" },
  { codigo: "11001", nombre: "Bogotá, D.C.", departamento: "Bogotá, D.C." },
];

describe("CampoMunicipio", () => {
  it("envía el código DANE elegido en un campo con el nombre pedido", () => {
    const { container } = render(<CampoMunicipio municipios={MUNICIPIOS} name="municipioCodigo" defaultValue="11001" id="m" />);
    const oculto = container.querySelector<HTMLInputElement>('input[name="municipioCodigo"]');
    expect(oculto?.value).toBe("11001");
  });

  it("sin valor guardado el campo va vacío", () => {
    const { container } = render(<CampoMunicipio municipios={MUNICIPIOS} name="municipioCodigo" defaultValue={null} id="m" />);
    expect(container.querySelector<HTMLInputElement>('input[name="municipioCodigo"]')?.value).toBe("");
  });
});
```

En `src/app/(dashboard)/pestanas-configuracion.test.tsx` agrega (con los imports que ya tiene el archivo; agrega `permisosEfectivos` desde `@/lib/auth/permisos`):

```tsx
  it("muestra la pestaña de facturación electrónica y la marca como actual", () => {
    render(<EncabezadoConfiguracion actual="/configuracion-factura-electronica" />);
    expect(screen.getByRole("link", { name: "Facturación electrónica" })).toHaveAttribute("aria-current", "page");
  });

  it("con permisos, oculta las pestañas a las que el usuario no puede entrar", () => {
    render(
      <EncabezadoConfiguracion
        actual="/configuracion-factura-electronica"
        permisos={permisosEfectivos({ role: "RECEPCION", agregados: ["facturaElectronica.configurar"] })}
      />,
    );
    expect(screen.queryByRole("link", { name: "Correo y avisos" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Tarifas de IVA" })).toBeNull();
    expect(screen.getByRole("link", { name: "Facturación electrónica" })).toBeInTheDocument();
  });
```

Crea `src/app/(dashboard)/configuracion-factura-electronica/configuracion-fe-form.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/app/actions/factura-electronica-config-actions", () => ({
  guardarConfiguracionFeAction: vi.fn(),
  probarConexionFeAction: vi.fn(),
}));

import { ConfiguracionFeForm } from "./configuracion-fe-form";
import type { ConfiguracionFeVista } from "@/app/actions/factura-electronica-config-actions";

const vista: ConfiguracionFeVista = {
  activa: true,
  envio: "AUTOMATICO",
  ambiente: "PRUEBAS",
  cuenta: "PROPIA",
  tokenConfigurado: true,
  nit: "900123456",
  dv: "8",
  razonSocial: "Taller Pérez",
  regimen: "48",
  responsabilidadFiscal: "O-13",
  municipioCodigo: "05001",
  direccion: "Calle 1",
  resolucionNumero: "18760000001",
  prefijo: "SETP",
  rangoDesde: 1,
  rangoHasta: 5000,
  vigenciaDesde: "2026-01-01",
  vigenciaHasta: "2027-12-31",
  siguienteConsecutivo: 40,
  prefijoNotaCredito: "NC",
  resultadoSimulado: "ACEPTAR",
  ultimaPruebaAt: null,
  ultimaPruebaExitosa: null,
  ultimaPruebaMensaje: null,
  ambienteProveedor: null,
};
const MUNICIPIOS = [{ codigo: "05001", nombre: "Medellín", departamento: "Antioquia" }];

describe("ConfiguracionFeForm", () => {
  it("llena los datos guardados y nunca muestra el token", () => {
    render(<ConfiguracionFeForm configuracion={vista} municipios={MUNICIPIOS} />);
    expect(screen.getByLabelText<HTMLInputElement>("NIT (sin DV)").value).toBe("900123456");
    expect(screen.getByLabelText<HTMLInputElement>("Prefijo").value).toBe("SETP");
    expect(screen.getByLabelText<HTMLInputElement>("Token del proveedor").value).toBe("");
    expect(screen.getByText("Déjalo en blanco para conservar el token guardado.")).toBeInTheDocument();
    expect(screen.getByText("Próximo número: SETP-40")).toBeInTheDocument();
  });

  it("al elegir producción pide confirmación antes de guardar", () => {
    render(<ConfiguracionFeForm configuracion={vista} municipios={MUNICIPIOS} />);
    fireEvent.click(screen.getByLabelText("Producción (con validez ante la DIAN)"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByRole("group", { name: "¿Pasar a producción? Desde ahí las facturas tienen validez ante la DIAN." })).toBeInTheDocument();
  });

  it("con la bolsa de TorqueFlow no deja escribir token", () => {
    render(<ConfiguracionFeForm configuracion={{ ...vista, cuenta: "BOLSA" }} municipios={MUNICIPIOS} />);
    expect(screen.queryByLabelText("Token del proveedor")).toBeNull();
    expect(screen.getByText("Con la bolsa de TorqueFlow, el token lo registra TorqueFlow.")).toBeInTheDocument();
  });

  it("el resultado simulado solo aparece en Simulado", () => {
    const { rerender } = render(<ConfiguracionFeForm configuracion={vista} municipios={MUNICIPIOS} />);
    expect(screen.queryByLabelText("Resultado simulado")).toBeNull();
    rerender(<ConfiguracionFeForm configuracion={{ ...vista, ambiente: "SIMULADO" }} municipios={MUNICIPIOS} />);
    expect(screen.getByLabelText("Resultado simulado")).toBeInTheDocument();
  });
});
```

Run: `npx vitest run --project unit src/lib/factura-electronica/avisos-resolucion.test.ts src/components/campo-municipio.test.tsx "src/app/(dashboard)/pestanas-configuracion.test.tsx" "src/app/(dashboard)/configuracion-factura-electronica"`
Expected: FAIL (módulos inexistentes, pestaña ausente).

- [ ] **Step 2: Avisos de la resolución**

Crea `src/lib/factura-electronica/avisos-resolucion.ts`:

```ts
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
```

- [ ] **Step 3: Campo de municipio**

Crea `src/components/campo-municipio.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { Combobox } from "@/components/ui/combobox";

export interface MunicipioOpcion {
  codigo: string;
  nombre: string;
  departamento: string;
}

/** Buscador de municipio (código DANE). La lista llega del servidor para no cargar el núcleo en el navegador. */
export function CampoMunicipio({
  municipios,
  name,
  defaultValue,
  id,
}: {
  municipios: MunicipioOpcion[];
  name: string;
  defaultValue: string | null;
  id: string;
}) {
  const [valor, setValor] = useState(defaultValue ?? "");
  const items = useMemo(
    () => municipios.map((m) => ({ value: m.codigo, label: `${m.nombre} (${m.departamento}) · ${m.codigo}` })),
    [municipios],
  );
  return (
    <>
      <Combobox id={id} items={items} value={valor} onValueChange={setValor} placeholder="Buscar municipio..." />
      <input type="hidden" name={name} value={valor} />
    </>
  );
}
```

(El `input` oculto propio garantiza el nombre del campo aunque el `Combobox` cambie su implementación.)

- [ ] **Step 4: Pestañas filtradas por permisos**

Reemplaza el contenido de `src/app/(dashboard)/pestanas-configuracion.tsx` por:

```tsx
import Link from "next/link";
import { cn } from "@/lib/utils";
import { tienePermiso, type Permiso } from "@/lib/auth/permisos";

const PESTANAS = [
  { href: "/configuracion-smtp", label: "Correo y avisos", permiso: "configuracion.taller" },
  { href: "/configuracion-iva", label: "Tarifas de IVA", permiso: "configuracion.taller" },
  { href: "/configuracion-factura-electronica", label: "Facturación electrónica", permiso: "facturaElectronica.configurar" },
] as const satisfies readonly { href: string; label: string; permiso: Permiso }[];

export type PestanaConfiguracion = (typeof PESTANAS)[number]["href"];

/**
 * Encabezado común de "Configuración del taller": el título y las pestañas que
 * llevan a cada página. Cada pestaña es su propia ruta, así los enlaces que ya
 * apuntan a /configuracion-smtp siguen sirviendo. Con `permisos`, solo se
 * muestran las pestañas a las que el usuario puede entrar (quien solo configura
 * la facturación electrónica no ve Correo ni IVA).
 */
export function EncabezadoConfiguracion({
  actual,
  permisos,
}: {
  actual: PestanaConfiguracion;
  permisos?: readonly Permiso[];
}) {
  const visibles = permisos ? PESTANAS.filter((p) => tienePermiso(permisos, p.permiso)) : PESTANAS;
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-xl font-semibold tracking-tight">Configuración del taller</h1>
      <nav aria-label="Secciones de la configuración" className="flex gap-1 self-start rounded-xl border border-border bg-muted p-1">
        {visibles.map((pestana) => {
          const activa = pestana.href === actual;
          return (
            <Link
              key={pestana.href}
              href={pestana.href}
              aria-current={activa ? "page" : undefined}
              className={cn(
                "inline-flex items-center rounded-lg px-4 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors",
                activa ? "bg-card shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
              )}
            >
              {pestana.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
```

En `src/app/(dashboard)/dashboard-sidebar.tsx`, en el ítem "Configuración del taller", cambia `tambienActivoEn: ["/configuracion-iva"]` por `tambienActivoEn: ["/configuracion-iva", "/configuracion-factura-electronica"]` y su comentario a "Correo y avisos, Tarifas de IVA y Facturación electrónica son pestañas de la misma página.".

- [ ] **Step 5: El formulario**

Crea `src/app/(dashboard)/configuracion-factura-electronica/configuracion-fe-form.tsx`:

```tsx
"use client";

import { useActionState, useRef, useState } from "react";
import {
  guardarConfiguracionFeAction,
  probarConexionFeAction,
  type ConfigFeFormState,
  type ConfiguracionFeVista,
} from "@/app/actions/factura-electronica-config-actions";
import type { MunicipioOpcion } from "@/components/campo-municipio";
import { CampoMunicipio } from "@/components/campo-municipio";
import { ConfirmacionEnLinea } from "@/components/confirmacion-en-linea";
import { FormGroup } from "@/components/form-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { formatoFechaRelativa } from "@/lib/fecha-bogota";

const inicial: ConfigFeFormState = { error: null, success: false, mensaje: null };

const AMBIENTES = [
  { value: "SIMULADO", label: "Simulado (para practicar, nada llega a la DIAN)" },
  { value: "PRUEBAS", label: "Pruebas de la DIAN (habilitación)" },
  { value: "PRODUCCION", label: "Producción (con validez ante la DIAN)" },
] as const;

const REGIMENES = [
  { value: "48", label: "Responsable de IVA" },
  { value: "49", label: "No responsable de IVA" },
];

const RESPONSABILIDADES = [
  { value: "O-13", label: "Gran contribuyente" },
  { value: "O-15", label: "Autorretenedor" },
  { value: "O-23", label: "Agente de retención de IVA" },
  { value: "O-47", label: "Régimen simple de tributación" },
  { value: "R-99-PN", label: "No responsable" },
];

const RESULTADOS_SIMULADOS = [
  { value: "ACEPTAR", label: "La DIAN acepta" },
  { value: "RECHAZAR", label: "La DIAN rechaza" },
  { value: "CAIDA", label: "Se cae la conexión (no llega)" },
  { value: "CAIDA_RECIBIDO", label: "Se cae la conexión pero la DIAN sí la recibió" },
];

export function ConfiguracionFeForm({
  configuracion: c,
  municipios,
}: {
  configuracion: ConfiguracionFeVista;
  municipios: MunicipioOpcion[];
}) {
  const [state, guardar, guardando] = useActionState(guardarConfiguracionFeAction, inicial);
  const [prueba, probar, probando] = useActionState(probarConexionFeAction, inicial);
  const [ambiente, setAmbiente] = useState(c.ambiente);
  const [cuenta, setCuenta] = useState(c.cuenta);
  const [confirmando, setConfirmando] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const pideConfirmacion = ambiente === "PRODUCCION" && c.ambiente !== "PRODUCCION";

  return (
    <div className="flex flex-col gap-4">
      <form
        ref={formRef}
        action={guardar}
        onSubmit={(e) => {
          if (pideConfirmacion && !confirmando) {
            e.preventDefault();
            setConfirmando(true);
          }
        }}
        className="flex flex-col gap-4"
      >
        <Card>
          <CardHeader>
            <CardTitle>Funcionamiento</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="activa" defaultChecked={c.activa} />
              Facturación electrónica activa
            </label>
            <FormGroup label="Envío a la DIAN" htmlFor="fe-envio">
              <SelectField
                id="fe-envio"
                name="envio"
                defaultValue={c.envio}
                items={[
                  { value: "AUTOMATICO", label: "Automático al crear la factura" },
                  { value: "MANUAL", label: "Manual, con el botón de la factura" },
                ]}
              />
            </FormGroup>
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Ambiente</legend>
              {AMBIENTES.map((a) => (
                <label key={a.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="ambiente"
                    value={a.value}
                    checked={ambiente === a.value}
                    onChange={() => {
                      setAmbiente(a.value);
                      setConfirmando(false);
                    }}
                  />
                  {a.label}
                </label>
              ))}
            </fieldset>
            {ambiente === "SIMULADO" ? (
              <FormGroup label="Resultado simulado" htmlFor="fe-simulado">
                <SelectField id="fe-simulado" name="resultadoSimulado" defaultValue={c.resultadoSimulado} items={RESULTADOS_SIMULADOS} />
              </FormGroup>
            ) : (
              <input type="hidden" name="resultadoSimulado" value={c.resultadoSimulado} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Datos del taller (emisor)</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fe-nit">NIT (sin DV)</Label>
              <Input id="fe-nit" name="nit" inputMode="numeric" defaultValue={c.nit ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fe-dv">DV</Label>
              <Input id="fe-dv" name="dv" inputMode="numeric" maxLength={1} defaultValue={c.dv ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="fe-razon">Razón social</Label>
              <Input id="fe-razon" name="razonSocial" defaultValue={c.razonSocial ?? ""} />
            </div>
            <FormGroup label="Régimen de IVA" htmlFor="fe-regimen">
              <SelectField id="fe-regimen" name="regimen" defaultValue={c.regimen ?? ""} items={REGIMENES} />
            </FormGroup>
            <FormGroup label="Responsabilidad fiscal" htmlFor="fe-resp">
              <SelectField id="fe-resp" name="responsabilidadFiscal" defaultValue={c.responsabilidadFiscal ?? ""} items={RESPONSABILIDADES} />
            </FormGroup>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fe-municipio">Municipio</Label>
              <CampoMunicipio id="fe-municipio" name="municipioCodigo" defaultValue={c.municipioCodigo} municipios={municipios} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fe-direccion">Dirección</Label>
              <Input id="fe-direccion" name="direccion" defaultValue={c.direccion ?? ""} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resolución de numeración</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fe-resolucion">Número de resolución</Label>
              <Input id="fe-resolucion" name="resolucionNumero" defaultValue={c.resolucionNumero ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fe-prefijo">Prefijo</Label>
              <Input id="fe-prefijo" name="prefijo" maxLength={4} defaultValue={c.prefijo ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fe-desde">Desde el número</Label>
              <Input id="fe-desde" name="rangoDesde" inputMode="numeric" defaultValue={c.rangoDesde ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fe-hasta">Hasta el número</Label>
              <Input id="fe-hasta" name="rangoHasta" inputMode="numeric" defaultValue={c.rangoHasta ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fe-vig-desde">Vigente desde</Label>
              <Input id="fe-vig-desde" name="vigenciaDesde" type="date" defaultValue={c.vigenciaDesde ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fe-vig-hasta">Vigente hasta</Label>
              <Input id="fe-vig-hasta" name="vigenciaHasta" type="date" defaultValue={c.vigenciaHasta ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fe-prefijo-nc">Prefijo de notas crédito</Label>
              <Input id="fe-prefijo-nc" name="prefijoNotaCredito" maxLength={4} defaultValue={c.prefijoNotaCredito ?? ""} />
            </div>
            <p className="self-end text-sm text-muted-foreground">
              Próximo número: {c.prefijo ?? ""}-{c.siguienteConsecutivo}
            </p>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Si cambias la resolución, el prefijo o el número inicial, la numeración vuelve a empezar en &quot;Desde el número&quot;.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cuenta del proveedor</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-2">
              <legend className="sr-only">Cuenta</legend>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="cuenta" value="BOLSA" checked={cuenta === "BOLSA"} onChange={() => setCuenta("BOLSA")} />
                Bolsa de TorqueFlow
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="cuenta" value="PROPIA" checked={cuenta === "PROPIA"} onChange={() => setCuenta("PROPIA")} />
                Cuenta propia del taller
              </label>
            </fieldset>
            {cuenta === "PROPIA" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fe-token">Token del proveedor</Label>
                <Input id="fe-token" name="token" type="password" autoComplete="off" defaultValue="" />
                <p className="text-xs text-muted-foreground">
                  {c.tokenConfigurado ? "Déjalo en blanco para conservar el token guardado." : "Aún no hay token guardado."}
                </p>
              </div>
            ) : (
              <>
                <input type="hidden" name="token" value="" />
                <p className="text-sm text-muted-foreground">Con la bolsa de TorqueFlow, el token lo registra TorqueFlow.</p>
              </>
            )}
          </CardContent>
        </Card>

        {state.error ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        {state.success && state.mensaje ? (
          <Alert>
            <AlertDescription>{state.mensaje}</AlertDescription>
          </Alert>
        ) : null}

        {confirmando ? (
          <ConfirmacionEnLinea
            pregunta="¿Pasar a producción? Desde ahí las facturas tienen validez ante la DIAN."
            etiquetaConfirmar="Sí, pasar a producción"
            onCancelar={() => setConfirmando(false)}
            enviaFormulario
            nombreBoton="confirmarProduccion"
            valorBoton="si"
            pendiente={guardando}
          />
        ) : (
          <Button type="submit" className="self-start" disabled={guardando}>
            Guardar
          </Button>
        )}
      </form>

      <Card>
        <CardHeader>
          <CardTitle>Probar conexión</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <form action={probar}>
            <Button type="submit" variant="outline" disabled={probando}>
              Probar conexión
            </Button>
          </form>
          {prueba.error ? <p className="text-sm text-destructive">{prueba.error}</p> : null}
          {prueba.success && prueba.mensaje ? <p className="text-sm">{prueba.mensaje}</p> : null}
          {c.ultimaPruebaAt ? (
            <p className="text-xs text-muted-foreground">
              Última prueba {formatoFechaRelativa(c.ultimaPruebaAt, new Date())}:{" "}
              {c.ultimaPruebaExitosa ? "correcta" : "con problemas"}
              {c.ultimaPruebaMensaje ? ` — ${c.ultimaPruebaMensaje}` : ""}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
```

Antes de escribirlo, revisa la firma real de `FormGroup` (`src/components/form-group.tsx`): si no recibe `label`/`htmlFor`, reemplaza cada `<FormGroup label=... htmlFor=...>` por `<div className="flex flex-col gap-1.5"><Label htmlFor=...>...</Label>...</div>` como en los demás campos de este archivo. Y revisa que `SelectField` acepte `id` y `defaultValue` (sí, según `src/components/ui/select-field.tsx`); si su etiqueta accesible no queda asociada al `id`, la prueba "Resultado simulado" debe buscarlo con `getByText("Resultado simulado")`.

- [ ] **Step 6: La página**

Crea `src/app/(dashboard)/configuracion-factura-electronica/page.tsx`:

```tsx
import { requirePermiso } from "@/lib/auth/guards";
import { getConfiguracionFe } from "@/app/actions/factura-electronica-config-actions";
import { MUNICIPIOS } from "@/modulos/factura-electronica";
import { avisosResolucion } from "@/lib/factura-electronica/avisos-resolucion";
import { fechaHoraBogota } from "@/lib/factura-electronica/hora-bogota";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EncabezadoConfiguracion } from "../pestanas-configuracion";
import { ConfiguracionFeForm } from "./configuracion-fe-form";

export default async function ConfiguracionFacturaElectronicaPage() {
  // Quien no tenga el permiso es redirigido a /sin-permiso antes de renderizar.
  const session = await requirePermiso("facturaElectronica.configurar");
  const configuracion = await getConfiguracionFe();
  const avisos = avisosResolucion(configuracion, fechaHoraBogota(new Date()).fecha);

  return (
    <main className="flex flex-col gap-4">
      <div>
        <EncabezadoConfiguracion actual="/configuracion-factura-electronica" permisos={session.user.permisos} />
        <p className="mt-3 text-sm text-muted-foreground">
          Con la facturación electrónica activa, cada factura del taller se envía a la DIAN. Empieza en Simulado para
          practicar; cuando tengas la resolución y el token del proveedor, pasa a Pruebas y luego a Producción.
        </p>
      </div>
      {avisos.map((aviso) => (
        <Alert key={aviso} variant="destructive">
          <AlertDescription>{aviso}</AlertDescription>
        </Alert>
      ))}
      <ConfiguracionFeForm configuracion={configuracion} municipios={MUNICIPIOS} />
    </main>
  );
}
```

- [ ] **Step 7: Correr las pruebas**

Run: `npx vitest run --project unit src/lib/factura-electronica/avisos-resolucion.test.ts src/components/campo-municipio.test.tsx "src/app/(dashboard)/pestanas-configuracion.test.tsx" "src/app/(dashboard)/configuracion-factura-electronica" "src/app/(dashboard)/dashboard-sidebar.test.tsx"`
Expected: PASS.

- [ ] **Step 8: Verificar y commit**

Run: `npx tsc --noEmit`, `npx eslint` de los archivos tocados.

```bash
git add src/lib/factura-electronica/avisos-resolucion.ts src/lib/factura-electronica/avisos-resolucion.test.ts src/components/campo-municipio.tsx src/components/campo-municipio.test.tsx "src/app/(dashboard)/pestanas-configuracion.tsx" "src/app/(dashboard)/pestanas-configuracion.test.tsx" "src/app/(dashboard)/dashboard-sidebar.tsx" "src/app/(dashboard)/configuracion-factura-electronica"
git commit -m "fase-fe-task 13: pestaña de facturación electrónica en la configuración del taller"
git push origin fase-fe-factura-electronica
```

---

### Task 14: Textos del estado DIAN y acciones de la ficha (ver, enviar, reenviar, contar)

**Files:**
- Create: `src/lib/factura-electronica/textos.ts`, `src/lib/factura-electronica/textos.test.ts`
- Create: `src/app/actions/factura-electronica-actions.ts`, `src/app/actions/factura-electronica-actions.test.ts`

**Interfaces:**
- Consumes: `emitirDocumentoFactura`, `reintentarDocumento`, `ResultadoFe` (`@/lib/factura-electronica/servicio`); `leerConfiguracionFe`; `scopeFactura`; `MensajeDian`, `ErrorValidacion` (núcleo).
- Produces:
  - `type EstadoDian = EstadoDocumentoElectronico | "SIN_ENVIAR"`
  - `TEXTO_ESTADO_DIAN: Record<EstadoDian, { etiqueta: string; descripcion: string; tono: "exito" | "alerta" | "error" | "neutro" }>`
  - `estadoDian(doc: { estado: EstadoDocumentoElectronico } | null | undefined): EstadoDian`
  - `necesitaAtencionDian(estado: EstadoDian): boolean` — `SIN_ENVIAR`, `PENDIENTE`, `POR_CONFIRMAR`, `RECHAZADO`
  - `cuentaParaDian(facturaCreadaAt: Date, activadaDesde: Date | null): boolean` — `activadaDesde !== null && creada >= activadaDesde`
  - `interface DocumentoFeVista { id; estado; prefijo; numero; cufe; fechaValidacion: Date | null; mensajes: MensajeDian[]; xmlRuta; pdfRuta; ambiente; intentos; ultimoIntentoAt: Date | null }`
  - `interface FacturaFeVista { activa: boolean; envio: "AUTOMATICO" | "MANUAL"; ambiente: AmbienteFacturaElectronica; cuenta: boolean /* cuentaParaDian */; documento: DocumentoFeVista | null }`
  - `getFacturaFe(facturaId: string): Promise<FacturaFeVista | null>` — null si no hay configuración o no está activa
  - `interface EnvioFeState { error: string | null; success: boolean; mensaje: string | null; errores: ErrorValidacion[] }`
  - `enviarFacturaDianAction(facturaId: string, prev: EnvioFeState, formData: FormData): Promise<EnvioFeState>`
  - `reenviarDocumentoAction(facturaId: string, documentoId: string, prev: EnvioFeState, formData: FormData): Promise<EnvioFeState>`
  - `getResumenFeTaller(): Promise<{ activa: boolean; activadaDesde: Date | null }>` (Task 16)
  - `contarFacturasSinEnviarDian(): Promise<number>` (Task 18)

- [ ] **Step 1: Pruebas que fallan**

Crea `src/lib/factura-electronica/textos.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TEXTO_ESTADO_DIAN, cuentaParaDian, estadoDian, necesitaAtencionDian } from "./textos";

describe("textos del estado DIAN", () => {
  it("sin documento es SIN_ENVIAR; con documento, su estado", () => {
    expect(estadoDian(null)).toBe("SIN_ENVIAR");
    expect(estadoDian(undefined)).toBe("SIN_ENVIAR");
    expect(estadoDian({ estado: "ACEPTADO" })).toBe("ACEPTADO");
  });

  it("necesitan atención: sin enviar, pendiente, por confirmar y rechazada", () => {
    expect(["SIN_ENVIAR", "PENDIENTE", "POR_CONFIRMAR", "RECHAZADO"].every((e) => necesitaAtencionDian(e as never))).toBe(true);
    expect(["ENVIANDO", "ACEPTADO", "ANULADO"].some((e) => necesitaAtencionDian(e as never))).toBe(false);
  });

  it("solo cuentan las facturas creadas desde la activación", () => {
    const activada = new Date("2026-11-01T00:00:00Z");
    expect(cuentaParaDian(new Date("2026-11-02T00:00:00Z"), activada)).toBe(true);
    expect(cuentaParaDian(new Date("2026-10-31T00:00:00Z"), activada)).toBe(false);
    expect(cuentaParaDian(new Date(), null)).toBe(false);
  });

  it("cada estado tiene etiqueta en lenguaje sencillo", () => {
    expect(TEXTO_ESTADO_DIAN.ACEPTADO.etiqueta).toBe("Aceptada por la DIAN");
    expect(TEXTO_ESTADO_DIAN.RECHAZADO.tono).toBe("error");
    expect(TEXTO_ESTADO_DIAN.SIN_ENVIAR.etiqueta).toBe("Sin enviar a la DIAN");
  });
});
```

Crea `src/app/actions/factura-electronica-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequirePermiso = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requirePermiso: (...a: unknown[]) => mockRequirePermiso(...a),
  requireSession: (...a: unknown[]) => mockRequireSession(...a),
  puede: (s: { user: { permisos: string[] } }, p: string) => s.user.permisos.includes(p),
}));

const mockConfig = vi.fn();
const mockFacturaFindFirst = vi.fn();
const mockFacturaCount = vi.fn();
const mockDocFindFirst = vi.fn();
const DB = {
  configuracionFacturaElectronica: { findUnique: mockConfig },
  factura: { findFirst: mockFacturaFindFirst, count: mockFacturaCount },
  documentoElectronico: { findFirst: mockDocFindFirst },
};
vi.mock("@/lib/db/tenant-client", () => ({ getTenantDb: () => DB }));

const mockEmitir = vi.fn();
const mockReintentar = vi.fn();
vi.mock("@/lib/factura-electronica/servicio", () => ({
  emitirDocumentoFactura: (...a: unknown[]) => mockEmitir(...a),
  reintentarDocumento: (...a: unknown[]) => mockReintentar(...a),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  contarFacturasSinEnviarDian,
  enviarFacturaDianAction,
  getFacturaFe,
  reenviarDocumentoAction,
  type EnvioFeState,
} from "./factura-electronica-actions";

const SESION = { user: { id: "u1", tenantSchema: "taller_x", sedeActivaId: "s1", permisos: ["facturas.ver", "facturas.facturar"] } };
const inicial: EnvioFeState = { error: null, success: false, mensaje: null, errores: [] };
const ACTIVADA = new Date("2026-11-01T00:00:00Z");
const config = { activa: true, envio: "MANUAL", ambiente: "SIMULADO", activadaDesde: ACTIVADA };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequirePermiso.mockResolvedValue(SESION);
  mockRequireSession.mockResolvedValue(SESION);
  mockConfig.mockResolvedValue(config);
});

describe("getFacturaFe", () => {
  it("null si la facturación electrónica no está activa", async () => {
    mockConfig.mockResolvedValue({ ...config, activa: false });
    expect(await getFacturaFe("f1")).toBeNull();
  });

  it("busca la factura en la sede activa y arma la vista con su documento", async () => {
    mockFacturaFindFirst.mockResolvedValue({
      createdAt: new Date("2026-11-10T00:00:00Z"),
      documentosElectronicos: [
        {
          id: "d1",
          estado: "ACEPTADO",
          prefijo: "SETP",
          numero: 7,
          cufe: "abc",
          fechaValidacion: null,
          mensajes: [],
          xmlRuta: "/api/uploads/x.xml",
          pdfRuta: null,
          ambiente: "SIMULADO",
          intentos: 1,
          ultimoIntentoAt: null,
        },
      ],
    });
    const vista = await getFacturaFe("f1");
    expect(mockRequirePermiso).toHaveBeenCalledWith("facturas.ver");
    expect(mockFacturaFindFirst.mock.calls[0][0].where).toEqual({ id: "f1", orden: { sedeId: "s1" } });
    expect(vista).toMatchObject({ activa: true, envio: "MANUAL", cuenta: true, documento: { id: "d1", estado: "ACEPTADO", numero: 7 } });
  });
});

describe("enviarFacturaDianAction", () => {
  it("pide facturar, verifica la sede y traduce un envío aceptado", async () => {
    mockFacturaFindFirst.mockResolvedValue({ id: "f1" });
    mockEmitir.mockResolvedValue({ ok: true, documentoId: "d1", estado: "ACEPTADO", mensajes: [] });
    const r = await enviarFacturaDianAction("f1", inicial, new FormData());
    expect(mockRequirePermiso).toHaveBeenCalledWith("facturas.facturar");
    expect(mockEmitir.mock.calls[0][0]).toMatchObject({ tenantSchema: "taller_x", usuarioId: "u1" });
    expect(mockEmitir.mock.calls[0][1]).toBe("f1");
    expect(r).toEqual({ error: null, success: true, mensaje: "La DIAN aceptó la factura.", errores: [] });
  });

  it("una validación fallida devuelve los faltantes", async () => {
    mockFacturaFindFirst.mockResolvedValue({ id: "f1" });
    const errores = [{ campo: "cliente.tipoDocumento", mensaje: "Falta el tipo de documento del cliente." }];
    mockEmitir.mockResolvedValue({ ok: false, motivo: "VALIDACION", mensaje: "Faltan datos para la factura electrónica.", errores });
    const r = await enviarFacturaDianAction("f1", inicial, new FormData());
    expect(r).toEqual({ error: "Faltan datos para la factura electrónica.", success: false, mensaje: null, errores });
  });

  it("una factura de otra sede no se envía", async () => {
    mockFacturaFindFirst.mockResolvedValue(null);
    const r = await enviarFacturaDianAction("f9", inicial, new FormData());
    expect(r.error).toBe("La factura no existe.");
    expect(mockEmitir).not.toHaveBeenCalled();
  });
});

describe("reenviarDocumentoAction", () => {
  it("solo reenvía un documento de esa factura", async () => {
    mockFacturaFindFirst.mockResolvedValue({ id: "f1" });
    mockDocFindFirst.mockResolvedValue(null);
    const r = await reenviarDocumentoAction("f1", "d-de-otra", inicial, new FormData());
    expect(mockDocFindFirst.mock.calls[0][0].where).toEqual({ id: "d-de-otra", facturaId: "f1" });
    expect(r.error).toBe("El documento no existe.");
    expect(mockReintentar).not.toHaveBeenCalled();
  });

  it("un rechazo se informa con sus motivos", async () => {
    mockFacturaFindFirst.mockResolvedValue({ id: "f1" });
    mockDocFindFirst.mockResolvedValue({ id: "d1" });
    mockReintentar.mockResolvedValue({ ok: true, documentoId: "d1", estado: "RECHAZADO", mensajes: [] });
    const r = await reenviarDocumentoAction("f1", "d1", inicial, new FormData());
    expect(r).toEqual({ error: "La DIAN rechazó la factura. Revisa los motivos, corrige y vuelve a enviarla.", success: false, mensaje: null, errores: [] });
  });
});

describe("contarFacturasSinEnviarDian", () => {
  it("0 sin permiso de ver facturas o con la facturación inactiva", async () => {
    mockRequireSession.mockResolvedValue({ user: { ...SESION.user, permisos: [] } });
    expect(await contarFacturasSinEnviarDian()).toBe(0);
    mockRequireSession.mockResolvedValue(SESION);
    mockConfig.mockResolvedValue({ ...config, activa: false });
    expect(await contarFacturasSinEnviarDian()).toBe(0);
    expect(mockFacturaCount).not.toHaveBeenCalled();
  });

  it("cuenta en la sede activa desde la activación las que no tienen documento o lo tienen pendiente", async () => {
    mockFacturaCount.mockResolvedValue(3);
    expect(await contarFacturasSinEnviarDian()).toBe(3);
    expect(mockFacturaCount.mock.calls[0][0].where).toEqual({
      orden: { sedeId: "s1" },
      createdAt: { gte: ACTIVADA },
      OR: [
        { documentosElectronicos: { none: { tipo: "FACTURA" } } },
        { documentosElectronicos: { some: { tipo: "FACTURA", estado: { in: ["PENDIENTE", "POR_CONFIRMAR", "RECHAZADO"] } } } },
      ],
    });
  });
});
```

Run: `npx vitest run --project unit src/lib/factura-electronica/textos.test.ts src/app/actions/factura-electronica-actions.test.ts`
Expected: FAIL ("Cannot find module").

- [ ] **Step 2: Implementar los textos**

Crea `src/lib/factura-electronica/textos.ts`:

```ts
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
```

- [ ] **Step 3: Implementar las acciones**

Crea `src/app/actions/factura-electronica-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { puede, requirePermiso, requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { scopeFactura } from "@/lib/sede/scope";
import { leerConfiguracionFe } from "@/lib/factura-electronica/configuracion";
import { emitirDocumentoFactura, reintentarDocumento, type ResultadoFe } from "@/lib/factura-electronica/servicio";
import { ESTADOS_DOCUMENTO_PENDIENTES, cuentaParaDian } from "@/lib/factura-electronica/textos";
import type { ErrorValidacion, MensajeDian } from "@/modulos/factura-electronica";
import type { AmbienteFacturaElectronica, EnvioFacturaElectronica, EstadoDocumentoElectronico } from "@/generated/prisma-tenant";

export interface DocumentoFeVista {
  id: string;
  estado: EstadoDocumentoElectronico;
  prefijo: string;
  numero: number;
  cufe: string | null;
  fechaValidacion: Date | null;
  mensajes: MensajeDian[];
  xmlRuta: string | null;
  pdfRuta: string | null;
  ambiente: AmbienteFacturaElectronica;
  intentos: number;
  ultimoIntentoAt: Date | null;
}

export interface FacturaFeVista {
  activa: boolean;
  envio: EnvioFacturaElectronica;
  ambiente: AmbienteFacturaElectronica;
  /** Creada desde la activación (las anteriores no se marcan como pendientes). */
  cuenta: boolean;
  documento: DocumentoFeVista | null;
}

export interface EnvioFeState {
  error: string | null;
  success: boolean;
  mensaje: string | null;
  errores: ErrorValidacion[];
}

const SELECT_DOCUMENTO = {
  id: true,
  estado: true,
  prefijo: true,
  numero: true,
  cufe: true,
  fechaValidacion: true,
  mensajes: true,
  xmlRuta: true,
  pdfRuta: true,
  ambiente: true,
  intentos: true,
  ultimoIntentoAt: true,
} as const;

export async function getFacturaFe(facturaId: string): Promise<FacturaFeVista | null> {
  const session = await requirePermiso("facturas.ver");
  const db = getTenantDb(session.user.tenantSchema);
  const config = await leerConfiguracionFe(db);
  if (!config?.activa) return null;
  const factura = await db.factura.findFirst({
    where: { id: facturaId, ...scopeFactura(session.user.sedeActivaId) },
    select: {
      createdAt: true,
      documentosElectronicos: { where: { tipo: "FACTURA" }, select: SELECT_DOCUMENTO, take: 1 },
    },
  });
  if (!factura) return null;
  const doc = factura.documentosElectronicos[0];
  return {
    activa: true,
    envio: config.envio,
    ambiente: config.ambiente,
    cuenta: cuentaParaDian(factura.createdAt, config.activadaDesde),
    documento: doc ? { ...doc, mensajes: (doc.mensajes ?? []) as unknown as MensajeDian[] } : null,
  };
}

const MENSAJE_ESTADO: Record<EstadoDocumentoElectronico, { ok: boolean; texto: string }> = {
  ACEPTADO: { ok: true, texto: "La DIAN aceptó la factura." },
  RECHAZADO: { ok: false, texto: "La DIAN rechazó la factura. Revisa los motivos, corrige y vuelve a enviarla." },
  POR_CONFIRMAR: { ok: false, texto: "No se pudo confirmar si la DIAN la recibió. Vuelve a intentarlo en unos minutos." },
  PENDIENTE: { ok: false, texto: "No se pudo enviar a la DIAN. Vuelve a intentarlo." },
  ENVIANDO: { ok: false, texto: "Se está enviando. Espera unos segundos y recarga." },
  ANULADO: { ok: true, texto: "La factura ya está anulada." },
};

function aEstado(r: ResultadoFe): EnvioFeState {
  if (!r.ok) return { error: r.mensaje, success: false, mensaje: null, errores: r.errores };
  const m = MENSAJE_ESTADO[r.estado];
  return m.ok
    ? { error: null, success: true, mensaje: m.texto, errores: [] }
    : { error: m.texto, success: false, mensaje: null, errores: [] };
}

async function prepararEnvio(facturaId: string) {
  const session = await requirePermiso("facturas.facturar");
  const db = getTenantDb(session.user.tenantSchema);
  const factura = await db.factura.findFirst({
    where: { id: facturaId, ...scopeFactura(session.user.sedeActivaId) },
    select: { id: true },
  });
  return { session, db, factura };
}

export async function enviarFacturaDianAction(facturaId: string, _prev: EnvioFeState, _formData: FormData): Promise<EnvioFeState> {
  const { session, db, factura } = await prepararEnvio(facturaId);
  if (!factura) return { error: "La factura no existe.", success: false, mensaje: null, errores: [] };
  const r = await emitirDocumentoFactura({ db, tenantSchema: session.user.tenantSchema, usuarioId: session.user.id }, facturaId);
  revalidatePath(`/facturas/${facturaId}`);
  return aEstado(r);
}

export async function reenviarDocumentoAction(
  facturaId: string,
  documentoId: string,
  _prev: EnvioFeState,
  _formData: FormData,
): Promise<EnvioFeState> {
  const { session, db, factura } = await prepararEnvio(facturaId);
  if (!factura) return { error: "La factura no existe.", success: false, mensaje: null, errores: [] };
  const doc = await db.documentoElectronico.findFirst({ where: { id: documentoId, facturaId }, select: { id: true } });
  if (!doc) return { error: "El documento no existe.", success: false, mensaje: null, errores: [] };
  const r = await reintentarDocumento({ db, tenantSchema: session.user.tenantSchema, usuarioId: session.user.id }, documentoId);
  revalidatePath(`/facturas/${facturaId}`);
  return aEstado(r);
}

/** Para la lista de facturas: si hay que mostrar la columna DIAN y desde cuándo cuentan. */
export async function getResumenFeTaller(): Promise<{ activa: boolean; activadaDesde: Date | null }> {
  const session = await requirePermiso("facturas.ver");
  const config = await leerConfiguracionFe(getTenantDb(session.user.tenantSchema));
  return { activa: config?.activa ?? false, activadaDesde: config?.activadaDesde ?? null };
}

/** Aviso de Inicio: facturas de la sede activa, desde la activación, sin documento o con documento pendiente. */
export async function contarFacturasSinEnviarDian(): Promise<number> {
  const session = await requireSession();
  if (!puede(session, "facturas.ver")) return 0;
  const db = getTenantDb(session.user.tenantSchema);
  const config = await leerConfiguracionFe(db);
  if (!config?.activa || !config.activadaDesde) return 0;
  return db.factura.count({
    where: {
      ...scopeFactura(session.user.sedeActivaId),
      createdAt: { gte: config.activadaDesde },
      OR: [
        { documentosElectronicos: { none: { tipo: "FACTURA" } } },
        { documentosElectronicos: { some: { tipo: "FACTURA", estado: { in: ESTADOS_DOCUMENTO_PENDIENTES } } } },
      ],
    },
  });
}
```

- [ ] **Step 4: Correr las pruebas**

Run: `npx vitest run --project unit src/lib/factura-electronica/textos.test.ts src/app/actions/factura-electronica-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificar y commit**

Run: `npx tsc --noEmit`, `npx eslint src/lib/factura-electronica/textos.ts src/app/actions/factura-electronica-actions.ts`.

```bash
git add src/lib/factura-electronica/textos.ts src/lib/factura-electronica/textos.test.ts src/app/actions/factura-electronica-actions.ts src/app/actions/factura-electronica-actions.test.ts
git commit -m "fase-fe-task 14: acciones para ver, enviar y reenviar la factura electrónica"
git push origin fase-fe-factura-electronica
```

---

### Task 15: Tarjeta "Factura electrónica" en la ficha de la factura

**Files:**
- Create: `src/app/(dashboard)/facturas/[id]/factura-electronica-card.tsx`, `factura-electronica-card.test.tsx`
- Modify: `src/app/(dashboard)/facturas/[id]/page.tsx`

**Interfaces:**
- Consumes: Task 14 (`FacturaFeVista`, `EnvioFeState`, `enviarFacturaDianAction`, `reenviarDocumentoAction`, `TEXTO_ESTADO_DIAN`, `estadoDian`).
- Produces: `FacturaElectronicaCard({ facturaId, clienteId, vista, puedeFacturar, puedeConfigurar })`.

- [ ] **Step 1: Pruebas que fallan**

Crea `src/app/(dashboard)/facturas/[id]/factura-electronica-card.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/app/actions/factura-electronica-actions", () => ({
  enviarFacturaDianAction: vi.fn(),
  reenviarDocumentoAction: vi.fn(),
}));

import { FacturaElectronicaCard } from "./factura-electronica-card";
import type { DocumentoFeVista, FacturaFeVista } from "@/app/actions/factura-electronica-actions";

const doc: DocumentoFeVista = {
  id: "d1",
  estado: "ACEPTADO",
  prefijo: "SETP",
  numero: 7,
  cufe: "cufe-123",
  fechaValidacion: new Date("2026-11-20T15:00:00Z"),
  mensajes: [],
  xmlRuta: "/api/uploads/t/facturas-electronicas/d1/FES-SETP7.xml",
  pdfRuta: "/api/uploads/t/facturas-electronicas/d1/FES-SETP7.pdf",
  ambiente: "PRODUCCION",
  intentos: 1,
  ultimoIntentoAt: null,
};
const vista = (documento: DocumentoFeVista | null, extra: Partial<FacturaFeVista> = {}): FacturaFeVista => ({
  activa: true,
  envio: "MANUAL",
  ambiente: "PRODUCCION",
  cuenta: true,
  documento,
  ...extra,
});
const props = { facturaId: "f1", clienteId: "c1", puedeFacturar: true, puedeConfigurar: false };

describe("FacturaElectronicaCard", () => {
  it("sin documento ofrece enviar a la DIAN", () => {
    render(<FacturaElectronicaCard {...props} vista={vista(null)} />);
    expect(screen.getByText("Sin enviar a la DIAN")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar a la DIAN" })).toBeInTheDocument();
  });

  it("sin permiso de facturar no muestra botones", () => {
    render(<FacturaElectronicaCard {...props} puedeFacturar={false} vista={vista(null)} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("aceptada: número, código único y descargas", () => {
    render(<FacturaElectronicaCard {...props} vista={vista(doc)} />);
    expect(screen.getByText("Aceptada por la DIAN")).toBeInTheDocument();
    expect(screen.getByText("SETP-7")).toBeInTheDocument();
    expect(screen.getByText("cufe-123")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Descargar PDF" })).toHaveAttribute("href", doc.pdfRuta);
    expect(screen.getByRole("link", { name: "Descargar XML" })).toHaveAttribute("href", doc.xmlRuta);
    expect(screen.queryByRole("button", { name: "Reenviar a la DIAN" })).toBeNull();
  });

  it("aceptada en simulado o pruebas avisa que no tiene validez", () => {
    render(<FacturaElectronicaCard {...props} vista={vista({ ...doc, ambiente: "SIMULADO" })} />);
    expect(screen.getByText("Enviada en Simulado: no tiene validez ante la DIAN.")).toBeInTheDocument();
  });

  it("rechazada: muestra qué pasó, cómo corregir y deja reenviar", () => {
    const rechazado: DocumentoFeVista = {
      ...doc,
      estado: "RECHAZADO",
      cufe: null,
      mensajes: [
        { codigo: "FAJ43b", tipo: "RECHAZO", textoDian: "x", explicacion: "El NIT del cliente no es válido.", comoCorregir: "Revisa el documento del cliente." },
      ],
    };
    render(<FacturaElectronicaCard {...props} vista={vista(rechazado)} />);
    expect(screen.getByText("Rechazada por la DIAN")).toBeInTheDocument();
    expect(screen.getByText("El NIT del cliente no es válido.")).toBeInTheDocument();
    expect(screen.getByText("Revisa el documento del cliente.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reenviar a la DIAN" })).toBeInTheDocument();
  });

  it("una factura anterior a la activación lo dice y aún deja enviarla", () => {
    render(<FacturaElectronicaCard {...props} vista={vista(null, { cuenta: false })} />);
    expect(screen.getByText("Se creó antes de activar la facturación electrónica.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar a la DIAN" })).toBeInTheDocument();
  });
});
```

(Si `MensajeDian.tipo` usa otros valores que `"RECHAZO"`, usa uno válido de `TipoMensajeDian` en `src/modulos/factura-electronica/modelo.ts`.)

Run: `npx vitest run --project unit "src/app/(dashboard)/facturas/[id]/factura-electronica-card.test.tsx"`
Expected: FAIL ("Cannot find module").

- [ ] **Step 2: Implementar la tarjeta**

Crea `src/app/(dashboard)/facturas/[id]/factura-electronica-card.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  enviarFacturaDianAction,
  reenviarDocumentoAction,
  type EnvioFeState,
  type FacturaFeVista,
} from "@/app/actions/factura-electronica-actions";
import { TEXTO_ESTADO_DIAN, estadoDian, type TonoDian } from "@/lib/factura-electronica/textos";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatoFechaCorta } from "@/lib/fecha-bogota";
import { cn } from "@/lib/utils";

const inicial: EnvioFeState = { error: null, success: false, mensaje: null, errores: [] };

const CLASE_TONO: Record<TonoDian, string> = {
  exito: "border-transparent bg-[oklch(0.4_0.1_150/0.1)] text-[oklch(0.4_0.1_150)]",
  alerta: "border-transparent bg-[oklch(0.7_0.15_60/0.15)] text-[oklch(0.55_0.15_60)]",
  error: "border-transparent bg-destructive/10 text-destructive",
  neutro: "",
};

const NOMBRE_AMBIENTE = { SIMULADO: "Simulado", PRUEBAS: "Pruebas" } as const;

export function FacturaElectronicaCard({
  facturaId,
  clienteId,
  vista,
  puedeFacturar,
  puedeConfigurar,
}: {
  facturaId: string;
  clienteId: string;
  vista: FacturaFeVista;
  puedeFacturar: boolean;
  puedeConfigurar: boolean;
}) {
  const doc = vista.documento;
  const estado = estadoDian(doc);
  const texto = TEXTO_ESTADO_DIAN[estado];
  const accion = doc ? reenviarDocumentoAction.bind(null, facturaId, doc.id) : enviarFacturaDianAction.bind(null, facturaId);
  const [state, formAction, pendiente] = useActionState(accion, inicial);
  const puedeEnviar = puedeFacturar && estado !== "ACEPTADO" && estado !== "ANULADO";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Factura electrónica</CardTitle>
        <Badge variant="outline" className={cn("gap-1.5", CLASE_TONO[texto.tono])}>
          {texto.etiqueta}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p className="text-muted-foreground">{texto.descripcion}</p>
        {!vista.cuenta && !doc ? <p className="text-muted-foreground">Se creó antes de activar la facturación electrónica.</p> : null}

        {doc ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Número</span>
              <span className="font-mono">{`${doc.prefijo}-${doc.numero}`}</span>
            </div>
            {doc.fechaValidacion ? (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Validada</span>
                <span>{formatoFechaCorta.format(doc.fechaValidacion)}</span>
              </div>
            ) : null}
            {doc.cufe ? (
              <div className="flex flex-col gap-0.5">
                <span className="text-muted-foreground">Código único (CUFE)</span>
                <span className="font-mono text-xs break-all">{doc.cufe}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {doc && doc.estado === "ACEPTADO" && doc.ambiente !== "PRODUCCION" ? (
          <p className="text-[oklch(0.55_0.15_60)]">Enviada en {NOMBRE_AMBIENTE[doc.ambiente]}: no tiene validez ante la DIAN.</p>
        ) : null}

        {doc && doc.estado === "ACEPTADO" && (doc.pdfRuta || doc.xmlRuta) ? (
          <div className="flex flex-wrap gap-2">
            {doc.pdfRuta ? (
              <a href={doc.pdfRuta} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Descargar PDF
              </a>
            ) : null}
            {doc.xmlRuta ? (
              <a href={doc.xmlRuta} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Descargar XML
              </a>
            ) : null}
          </div>
        ) : null}

        {doc && doc.estado !== "ACEPTADO" && doc.mensajes.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {doc.mensajes.map((m, i) => (
              <li key={`${m.codigo ?? "m"}-${i}`} className="rounded-lg border border-border p-2">
                <p>{m.explicacion}</p>
                {m.comoCorregir ? <p className="text-muted-foreground">{m.comoCorregir}</p> : null}
              </li>
            ))}
          </ul>
        ) : null}

        {state.error ? <p className="text-destructive">{state.error}</p> : null}
        {state.success && state.mensaje ? <p>{state.mensaje}</p> : null}
        {state.errores.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {state.errores.map((e) => (
              <li key={e.campo}>
                {e.mensaje}{" "}
                {e.campo.startsWith("cliente.") ? (
                  <Link href={`/clientes/${clienteId}#factura-electronica`} className="font-medium text-primary hover:underline">
                    Completar datos del cliente
                  </Link>
                ) : puedeConfigurar ? (
                  <Link href="/configuracion-factura-electronica" className="font-medium text-primary hover:underline">
                    Ir a la configuración
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {puedeEnviar ? (
          <form action={formAction}>
            <Button type="submit" size="sm" disabled={pendiente}>
              {doc ? "Reenviar a la DIAN" : "Enviar a la DIAN"}
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Ponerla en la ficha**

En `src/app/(dashboard)/facturas/[id]/page.tsx`:

1. Imports:

```tsx
import { getFacturaFe } from "@/app/actions/factura-electronica-actions";
import { FacturaElectronicaCard } from "./factura-electronica-card";
```

y cambia `import { requirePermiso } from "@/lib/auth/guards";` por `import { puede, requirePermiso } from "@/lib/auth/guards";`.

2. En `FacturaDetailPage`, cambia `await requirePermiso("facturas.ver");` por `const session = await requirePermiso("facturas.ver");` y, después de `notFound()`, agrega:

```tsx
  const facturaFe = await getFacturaFe(factura.id);
```

3. En la columna derecha (`<div className="sticky top-4 flex flex-col gap-4">`), después de la tarjeta "Liquidación" (`</Card>` de esa tarjeta), agrega:

```tsx
          {facturaFe ? (
            <FacturaElectronicaCard
              facturaId={factura.id}
              clienteId={factura.clienteId}
              vista={facturaFe}
              puedeFacturar={puede(session, "facturas.facturar")}
              puedeConfigurar={puede(session, "facturaElectronica.configurar")}
            />
          ) : null}
```

(Si `Factura` no tiene `clienteId` escalar, usa `factura.cliente.id`.)

- [ ] **Step 4: Correr las pruebas**

Run: `npx vitest run --project unit "src/app/(dashboard)/facturas"`
Expected: PASS.

- [ ] **Step 5: Verificar y commit**

Run: `npx tsc --noEmit`, `npx eslint "src/app/(dashboard)/facturas/[id]"`.

```bash
git add "src/app/(dashboard)/facturas/[id]/factura-electronica-card.tsx" "src/app/(dashboard)/facturas/[id]/factura-electronica-card.test.tsx" "src/app/(dashboard)/facturas/[id]/page.tsx"
git commit -m "fase-fe-task 15: tarjeta de factura electrónica en la ficha de la factura"
git push origin fase-fe-factura-electronica
```

---

### Task 16: Estado DIAN en la lista de facturas y filtro "Sin enviar o rechazadas"

**Files:**
- Modify: `src/app/actions/factura-actions.ts` (include)
- Modify: `src/app/(dashboard)/facturas/page.tsx`
- Create: `src/app/(dashboard)/facturas/estado-dian.tsx`, `estado-dian.test.tsx`

**Interfaces:**
- Consumes: Task 14 (`getResumenFeTaller`, `TEXTO_ESTADO_DIAN`, `estadoDian`, `necesitaAtencionDian`, `cuentaParaDian`).
- Produces: `FacturaWithDetalle.documentosElectronicos: { estado: EstadoDocumentoElectronico }[]`; URL `/facturas?dian=pendientes` (Task 18); `InsigniaDian({ estado }: { estado: EstadoDian })`.

- [ ] **Step 1: Prueba de la insignia (falla)**

Crea `src/app/(dashboard)/facturas/estado-dian.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { InsigniaDian } from "./estado-dian";

describe("InsigniaDian", () => {
  it("muestra el estado en lenguaje sencillo", () => {
    render(<InsigniaDian estado="RECHAZADO" />);
    expect(screen.getByText("Rechazada por la DIAN")).toBeInTheDocument();
  });

  it("sin enviar", () => {
    render(<InsigniaDian estado="SIN_ENVIAR" />);
    expect(screen.getByText("Sin enviar a la DIAN")).toBeInTheDocument();
  });
});
```

Run: `npx vitest run --project unit "src/app/(dashboard)/facturas/estado-dian.test.tsx"`
Expected: FAIL.

- [ ] **Step 2: Insignia**

Crea `src/app/(dashboard)/facturas/estado-dian.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { TEXTO_ESTADO_DIAN, type EstadoDian, type TonoDian } from "@/lib/factura-electronica/textos";
import { cn } from "@/lib/utils";

const CLASE_TONO: Record<TonoDian, string> = {
  exito: "border-transparent bg-[oklch(0.4_0.1_150/0.1)] text-[oklch(0.4_0.1_150)]",
  alerta: "border-transparent bg-[oklch(0.7_0.15_60/0.15)] text-[oklch(0.55_0.15_60)]",
  error: "border-transparent bg-destructive/10 text-destructive",
  neutro: "",
};

export function InsigniaDian({ estado }: { estado: EstadoDian }) {
  const t = TEXTO_ESTADO_DIAN[estado];
  return (
    <Badge variant="outline" className={cn("text-[10px]", CLASE_TONO[t.tono])}>
      {t.etiqueta}
    </Badge>
  );
}
```

- [ ] **Step 3: Incluir el documento en la lista**

En `src/app/actions/factura-actions.ts`, en `FACTURA_DETAIL_INCLUDE`, agrega:

```ts
  documentosElectronicos: { where: { tipo: "FACTURA" }, select: { estado: true }, take: 1 },
```

- [ ] **Step 4: Columna y filtro en la página**

En `src/app/(dashboard)/facturas/page.tsx`:

1. Imports:

```tsx
import { getResumenFeTaller } from "@/app/actions/factura-electronica-actions";
import { cuentaParaDian, estadoDian, necesitaAtencionDian } from "@/lib/factura-electronica/textos";
import { InsigniaDian } from "./estado-dian";
```

2. `construirHrefFacturas` recibe y conserva el filtro DIAN. Reemplázala por:

```tsx
function construirHrefFacturas(base: {
  estado?: EstadoFactura;
  q?: string;
  sort?: SortKey;
  order?: SortOrder;
  dian?: boolean;
}): string {
  const params = new URLSearchParams();
  if (base.estado) params.set("estado", base.estado);
  if (base.dian) params.set("dian", "pendientes");
  if (base.q) params.set("q", base.q);
  if (base.sort) params.set("sort", base.sort);
  if (base.sort && base.order === "asc") params.set("order", "asc");
  const query = params.toString();
  return query ? `/facturas?${query}` : "/facturas";
}
```

3. `SortableHeader`: agrega la prop `dian: boolean` a sus props y a su tipo, y pásala en el `href`: `construirHrefFacturas({ estado: estadoFiltro, q, sort: sortKey, order: nextOrder, dian })`.

4. `buildColumns`: agrega los parámetros `dian: boolean` y `fe: { activa: boolean; activadaDesde: Date | null }` al final; `sortableHeaderProps` pasa a `{ sortActual, orderActual, estadoFiltro, q, dian }`; y justo después de la columna "Estado" agrega, solo si `fe.activa`:

```tsx
    ...(fe.activa
      ? [
          {
            header: "DIAN",
            cell: (factura: FacturaRow) =>
              cuentaParaDian(factura.createdAt, fe.activadaDesde) || factura.documentosElectronicos.length > 0 ? (
                <InsigniaDian estado={estadoDian(factura.documentosElectronicos[0])} />
              ) : (
                <span className="text-muted-foreground">—</span>
              ),
          } satisfies DataTableColumn<FacturaRow>,
        ]
      : []),
```

5. En `FacturasPage`: el tipo de `searchParams` suma `dian?: string`; lee `const { estado, q, sort, order, dian } = await searchParams;` y `const filtroDian = dian === "pendientes";`. Cambia el `Promise.all` a:

```tsx
  const [facturas, ordenesFacturables, fe] = await Promise.all([listFacturas(), listOrdenesFacturables(), getResumenFeTaller()]);
```

Agrega al encadenado de `filtradas`, antes del filtro de búsqueda:

```tsx
    .filter(
      (factura) =>
        !filtroDian ||
        (fe.activa &&
          cuentaParaDian(factura.createdAt, fe.activadaDesde) &&
          necesitaAtencionDian(estadoDian(factura.documentosElectronicos[0]))),
    )
```

Pasa `filtroDian` en cada llamada a `construirHrefFacturas` de los chips de estado (`dian: filtroDian`) y a `buildColumns(..., filtroDian, fe)`.

6. En el `<nav aria-label="Filtrar por estado">`, después de los chips de estado, si `fe.activa`, agrega el chip:

```tsx
              {fe.activa ? (
                <Link
                  href={construirHrefFacturas({ estado: estadoFiltro, q, sort: sortActual, order: orderActual, dian: !filtroDian })}
                  aria-current={filtroDian ? "page" : undefined}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm transition-colors",
                    filtroDian
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  Sin enviar o rechazadas
                </Link>
              ) : null}
```

- [ ] **Step 5: Correr las pruebas**

Run: `npx vitest run --project unit "src/app/(dashboard)/facturas" src/app/actions/factura-actions.test.ts`
Expected: PASS (si alguna prueba de `factura-actions.test.ts` compara el `include` exacto, actualízala con la clave nueva).

- [ ] **Step 6: Verificar y commit**

Run: `npx tsc --noEmit`, `npx eslint "src/app/(dashboard)/facturas" src/app/actions/factura-actions.ts`.

```bash
git add src/app/actions/factura-actions.ts "src/app/(dashboard)/facturas/page.tsx" "src/app/(dashboard)/facturas/estado-dian.tsx" "src/app/(dashboard)/facturas/estado-dian.test.tsx"
git commit -m "fase-fe-task 16: estado DIAN y filtro de pendientes en la lista de facturas"
git push origin fase-fe-factura-electronica
```

---

### Task 17: Datos para factura electrónica en la ficha del cliente

**Files:**
- Create: `src/app/actions/cliente-fe-actions.ts`, `src/app/actions/cliente-fe-actions.test.ts`
- Create: `src/app/(dashboard)/clientes/[id]/datos-fe-cliente.tsx`, `datos-fe-cliente.test.tsx`
- Modify: `src/app/(dashboard)/clientes/[id]/page.tsx`

**Interfaces:**
- Consumes: `datosFeClienteSchema` (Task 12), `CampoMunicipio` (Task 13), `adquirenteDesdeCliente` (`@/lib/factura-electronica/mapear`), `calcularDvNit`, `TIPOS_DOCUMENTO_IDENTIDAD`, `RESPONSABILIDADES_FISCALES`, `MUNICIPIOS` (núcleo), `leerConfiguracionFe`.
- Produces: `interface DatosFeClienteState { error: string | null; success: boolean }`; `guardarDatosFeClienteAction(clienteId: string, prev: DatosFeClienteState, formData: FormData): Promise<DatosFeClienteState>`; `DatosFeCliente({ cliente, municipios, puedeEditar })`; ancla `#factura-electronica` (Task 15).

- [ ] **Step 1: Pruebas que fallan**

Crea `src/app/actions/cliente-fe-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequirePermiso = vi.fn();
vi.mock("@/lib/auth/guards", () => ({ requirePermiso: (...a: unknown[]) => mockRequirePermiso(...a) }));

const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({ cliente: { findUnique: mockFindUnique, update: mockUpdate } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { calcularDvNit } from "@/modulos/factura-electronica";
import { guardarDatosFeClienteAction, type DatosFeClienteState } from "./cliente-fe-actions";

const inicial: DatosFeClienteState = { error: null, success: false };
function form(campos: Record<string, string>): FormData {
  const fd = new FormData();
  const base = { tipoDocumento: "", dv: "", tipoPersona: "", responsabilidadFiscal: "", municipioCodigo: "", direccion: "" };
  for (const [k, v] of Object.entries({ ...base, ...campos })) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequirePermiso.mockResolvedValue({ user: { tenantSchema: "taller_x" } });
});

describe("guardarDatosFeClienteAction", () => {
  it("pide editar clientes y guarda los datos", async () => {
    mockFindUnique.mockResolvedValue({ id: "c1", documento: "1020304050" });
    const r = await guardarDatosFeClienteAction(
      "c1",
      inicial,
      form({ tipoDocumento: "13", tipoPersona: "NATURAL", responsabilidadFiscal: "R-99-PN", municipioCodigo: "11001", direccion: "Cra 7" }),
    );
    expect(mockRequirePermiso).toHaveBeenCalledWith("clientes.editar");
    expect(r).toEqual({ error: null, success: true });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { tipoDocumento: "13", dv: null, tipoPersona: "NATURAL", responsabilidadFiscal: "R-99-PN", municipioCodigo: "11001", direccion: "Cra 7" },
    });
  });

  it("con NIT exige el DV correcto del documento del cliente", async () => {
    const nit = "900123456";
    mockFindUnique.mockResolvedValue({ id: "c1", documento: nit });
    const dvMalo = String((Number(calcularDvNit(nit)) + 1) % 10);
    const r = await guardarDatosFeClienteAction("c1", inicial, form({ tipoDocumento: "31", dv: dvMalo }));
    expect(r).toEqual({ error: "El dígito de verificación no corresponde al NIT del cliente.", success: false });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("con NIT y sin DV también lo pide", async () => {
    mockFindUnique.mockResolvedValue({ id: "c1", documento: "900123456" });
    const r = await guardarDatosFeClienteAction("c1", inicial, form({ tipoDocumento: "31" }));
    expect(r.error).toBe("Con NIT, escribe el dígito de verificación.");
  });

  it("cliente inexistente", async () => {
    mockFindUnique.mockResolvedValue(null);
    const r = await guardarDatosFeClienteAction("c9", inicial, form({}));
    expect(r).toEqual({ error: "El cliente no existe.", success: false });
  });
});
```

Crea `src/app/(dashboard)/clientes/[id]/datos-fe-cliente.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/app/actions/cliente-fe-actions", () => ({ guardarDatosFeClienteAction: vi.fn() }));

import { DatosFeCliente } from "./datos-fe-cliente";

const MUNICIPIOS = [{ codigo: "11001", nombre: "Bogotá, D.C.", departamento: "Bogotá, D.C." }];
const base = {
  id: "c1",
  nombre: "Andrea",
  telefono: null,
  email: null,
  documento: "1020304050",
  tipoDocumento: null,
  dv: null,
  tipoPersona: null,
  responsabilidadFiscal: null,
  municipioCodigo: null,
  direccion: null,
};

describe("DatosFeCliente", () => {
  it("con datos incompletos de persona natural avisa que irá como consumidor final", () => {
    render(<DatosFeCliente cliente={base} municipios={MUNICIPIOS} puedeEditar />);
    expect(screen.getByText("Datos para factura electrónica")).toBeInTheDocument();
    expect(screen.getByText("Incompletos: se facturará como consumidor final.")).toBeInTheDocument();
  });

  it("con datos completos lo dice", () => {
    render(
      <DatosFeCliente
        cliente={{ ...base, tipoDocumento: "13", tipoPersona: "NATURAL", responsabilidadFiscal: "R-99-PN", municipioCodigo: "11001", direccion: "Cra 7" }}
        municipios={MUNICIPIOS}
        puedeEditar
      />,
    );
    expect(screen.getByText("Completos")).toBeInTheDocument();
  });

  it("empresa incompleta: no se podrá enviar", () => {
    render(<DatosFeCliente cliente={{ ...base, tipoPersona: "JURIDICA" }} municipios={MUNICIPIOS} puedeEditar />);
    expect(screen.getByText("Incompletos: no se podrá enviar la factura hasta completarlos.")).toBeInTheDocument();
  });

  it("sin permiso de editar no muestra el botón de guardar", () => {
    render(<DatosFeCliente cliente={base} municipios={MUNICIPIOS} puedeEditar={false} />);
    expect(screen.queryByRole("button", { name: "Guardar datos" })).toBeNull();
  });
});
```

Run: `npx vitest run --project unit src/app/actions/cliente-fe-actions.test.ts "src/app/(dashboard)/clientes/[id]/datos-fe-cliente.test.tsx"`
Expected: FAIL.

- [ ] **Step 2: La acción**

Crea `src/app/actions/cliente-fe-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requirePermiso } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { calcularDvNit } from "@/modulos/factura-electronica";
import { datosFeClienteSchema } from "@/lib/validation/factura-electronica";

export interface DatosFeClienteState {
  error: string | null;
  success: boolean;
}

function dvDe(documento: string): string | null {
  try {
    return calcularDvNit(documento);
  } catch {
    return null;
  }
}

export async function guardarDatosFeClienteAction(
  clienteId: string,
  _prev: DatosFeClienteState,
  formData: FormData,
): Promise<DatosFeClienteState> {
  const session = await requirePermiso("clientes.editar");
  const campo = (n: string) => String(formData.get(n) ?? "");
  const parsed = datosFeClienteSchema.safeParse({
    tipoDocumento: campo("tipoDocumento"),
    dv: campo("dv"),
    tipoPersona: campo("tipoPersona"),
    responsabilidadFiscal: campo("responsabilidadFiscal"),
    municipioCodigo: campo("municipioCodigo"),
    direccion: campo("direccion"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos.", success: false };

  const db = getTenantDb(session.user.tenantSchema);
  const cliente = await db.cliente.findUnique({ where: { id: clienteId }, select: { id: true, documento: true } });
  if (!cliente) return { error: "El cliente no existe.", success: false };

  const d = parsed.data;
  if (d.tipoDocumento === "31" && cliente.documento) {
    if (!d.dv) return { error: "Con NIT, escribe el dígito de verificación.", success: false };
    if (dvDe(cliente.documento) !== d.dv) {
      return { error: "El dígito de verificación no corresponde al NIT del cliente.", success: false };
    }
  }

  try {
    await db.cliente.update({ where: { id: clienteId }, data: d });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al guardar los datos del cliente"), success: false };
  }
  revalidatePath(`/clientes/${clienteId}`);
  return { error: null, success: true };
}
```

- [ ] **Step 3: La sección**

Crea `src/app/(dashboard)/clientes/[id]/datos-fe-cliente.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { guardarDatosFeClienteAction, type DatosFeClienteState } from "@/app/actions/cliente-fe-actions";
import { adquirenteDesdeCliente, type ClienteParaMapear } from "@/lib/factura-electronica/mapear";
import { CampoMunicipio, type MunicipioOpcion } from "@/components/campo-municipio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";

const inicial: DatosFeClienteState = { error: null, success: false };

const TIPOS_DOCUMENTO = [
  { value: "13", label: "Cédula de ciudadanía" },
  { value: "31", label: "NIT" },
  { value: "22", label: "Cédula de extranjería" },
  { value: "41", label: "Pasaporte" },
  { value: "12", label: "Tarjeta de identidad" },
  { value: "47", label: "PEP" },
];

const RESPONSABILIDADES = [
  { value: "R-99-PN", label: "No responsable" },
  { value: "O-13", label: "Gran contribuyente" },
  { value: "O-15", label: "Autorretenedor" },
  { value: "O-23", label: "Agente de retención de IVA" },
  { value: "O-47", label: "Régimen simple de tributación" },
];

export type ClienteFe = ClienteParaMapear & { id: string };

function estadoDatos(c: ClienteFe): { completo: boolean; texto: string } {
  const { adquirente, errores } = adquirenteDesdeCliente(c);
  if (adquirente.tipo === "CONSUMIDOR_FINAL") return { completo: false, texto: "Incompletos: se facturará como consumidor final." };
  if (errores.length > 0 || !adquirente.municipioDane || !adquirente.direccion || !adquirente.numeroDocumento) {
    return { completo: false, texto: "Incompletos: no se podrá enviar la factura hasta completarlos." };
  }
  return { completo: true, texto: "Completos" };
}

export function DatosFeCliente({
  cliente,
  municipios,
  puedeEditar,
}: {
  cliente: ClienteFe;
  municipios: MunicipioOpcion[];
  puedeEditar: boolean;
}) {
  const [state, formAction, pendiente] = useActionState(guardarDatosFeClienteAction.bind(null, cliente.id), inicial);
  const estado = estadoDatos(cliente);

  return (
    <details id="factura-electronica" className="scroll-mt-16 rounded-xl border border-border bg-card p-4">
      <summary className="flex cursor-pointer items-center justify-between gap-2 font-semibold">
        <span>Datos para factura electrónica</span>
        <Badge variant="outline" className="font-normal">
          {estado.texto}
        </Badge>
      </summary>
      <form action={formAction} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cfe-tipo">Tipo de documento</Label>
          <SelectField id="cfe-tipo" name="tipoDocumento" defaultValue={cliente.tipoDocumento ?? ""} items={TIPOS_DOCUMENTO} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cfe-dv">DV (solo con NIT)</Label>
          <Input id="cfe-dv" name="dv" maxLength={1} inputMode="numeric" defaultValue={cliente.dv ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cfe-persona">Tipo de persona</Label>
          <SelectField
            id="cfe-persona"
            name="tipoPersona"
            defaultValue={cliente.tipoPersona ?? ""}
            items={[
              { value: "NATURAL", label: "Persona natural" },
              { value: "JURIDICA", label: "Empresa (persona jurídica)" },
            ]}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cfe-resp">Responsabilidad fiscal</Label>
          <SelectField id="cfe-resp" name="responsabilidadFiscal" defaultValue={cliente.responsabilidadFiscal ?? ""} items={RESPONSABILIDADES} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cfe-municipio">Municipio</Label>
          <CampoMunicipio id="cfe-municipio" name="municipioCodigo" defaultValue={cliente.municipioCodigo} municipios={municipios} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cfe-direccion">Dirección</Label>
          <Input id="cfe-direccion" name="direccion" defaultValue={cliente.direccion ?? ""} />
        </div>
        {state.error ? <p className="text-sm text-destructive sm:col-span-2">{state.error}</p> : null}
        {state.success ? <p className="text-sm sm:col-span-2">Datos guardados.</p> : null}
        {puedeEditar ? (
          <Button type="submit" size="sm" className="self-start" disabled={pendiente}>
            Guardar datos
          </Button>
        ) : null}
      </form>
    </details>
  );
}
```

(`adquirenteDesdeCliente` es una función pura sin imports de servidor; si `tsc` o el bundler se quejan de importarla en un componente cliente, calcula `estadoDatos` en la página del servidor y pásalo como prop `estado`.)

- [ ] **Step 4: Ponerla en la ficha del cliente**

En `src/app/(dashboard)/clientes/[id]/page.tsx`:

1. Imports:

```tsx
import { DatosFeCliente } from "./datos-fe-cliente";
import { leerConfiguracionFe } from "@/lib/factura-electronica/configuracion";
import { MUNICIPIOS } from "@/modulos/factura-electronica";
```

2. Donde la página ya tiene la sesión y el `tenantDb` (o con `getTenantDb(session.user.tenantSchema)` si no lo tiene), lee `const configFe = await leerConfiguracionFe(tenantDb);`.

3. Debajo de la tarjeta de datos del cliente (la que muestra documento/teléfono/correo), agrega:

```tsx
          {configFe?.activa ? (
            <DatosFeCliente
              cliente={{
                id: cliente.id,
                nombre: cliente.nombre,
                telefono: cliente.telefono,
                email: cliente.email,
                documento: cliente.documento,
                tipoDocumento: cliente.tipoDocumento,
                dv: cliente.dv,
                tipoPersona: cliente.tipoPersona,
                responsabilidadFiscal: cliente.responsabilidadFiscal,
                municipioCodigo: cliente.municipioCodigo,
                direccion: cliente.direccion,
              }}
              municipios={MUNICIPIOS}
              puedeEditar={puedeEditar}
            />
          ) : null}
```

(Usa el nombre de variable con que la página ya decide si se puede editar al cliente; si no existe, `puede(session, "clientes.editar")`.)

- [ ] **Step 5: Correr las pruebas**

Run: `npx vitest run --project unit src/app/actions/cliente-fe-actions.test.ts "src/app/(dashboard)/clientes/[id]"`
Expected: PASS (si `page.test.tsx` de la ficha del cliente se queja de `leerConfiguracionFe`, simula `@/lib/factura-electronica/configuracion` devolviendo `null` en esa prueba).

- [ ] **Step 6: Verificar y commit**

Run: `npx tsc --noEmit`, `npx eslint src/app/actions/cliente-fe-actions.ts "src/app/(dashboard)/clientes/[id]"`.

```bash
git add src/app/actions/cliente-fe-actions.ts src/app/actions/cliente-fe-actions.test.ts "src/app/(dashboard)/clientes/[id]/datos-fe-cliente.tsx" "src/app/(dashboard)/clientes/[id]/datos-fe-cliente.test.tsx" "src/app/(dashboard)/clientes/[id]/page.tsx"
git commit -m "fase-fe-task 17: datos para factura electrónica en la ficha del cliente"
git push origin fase-fe-factura-electronica
```

---

### Task 18: Aviso en Inicio "N facturas sin enviar a la DIAN"

**Files:**
- Create: `src/app/(dashboard)/aviso-facturas-dian.tsx`, `aviso-facturas-dian.test.tsx`
- Modify: `src/app/(dashboard)/page.tsx`

**Interfaces:**
- Consumes: `contarFacturasSinEnviarDian()` (Task 14); `/facturas?dian=pendientes` (Task 16).

- [ ] **Step 1: Prueba que falla**

Crea `src/app/(dashboard)/aviso-facturas-dian.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AvisoFacturasDian } from "./aviso-facturas-dian";

describe("AvisoFacturasDian", () => {
  it("no muestra nada con 0", () => {
    const { container } = render(<AvisoFacturasDian cantidad={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("singular y plural, con enlace a la lista filtrada", () => {
    const { rerender } = render(<AvisoFacturasDian cantidad={1} />);
    expect(screen.getByRole("link", { name: /1 factura sin enviar a la DIAN/ })).toHaveAttribute("href", "/facturas?dian=pendientes");
    rerender(<AvisoFacturasDian cantidad={4} />);
    expect(screen.getByRole("link", { name: /4 facturas sin enviar a la DIAN/ })).toBeInTheDocument();
  });
});
```

Run: `npx vitest run --project unit "src/app/(dashboard)/aviso-facturas-dian.test.tsx"`
Expected: FAIL.

- [ ] **Step 2: Implementar el aviso**

Crea `src/app/(dashboard)/aviso-facturas-dian.tsx`:

```tsx
import Link from "next/link";
import { ChevronRight, FileWarning } from "lucide-react";

/** Aviso de Inicio: solo aparece si hay facturas sin enviar, pendientes, por confirmar o rechazadas. */
export function AvisoFacturasDian({ cantidad }: { cantidad: number }) {
  if (cantidad <= 0) return null;
  return (
    <Link
      href="/facturas?dian=pendientes"
      className="flex items-center gap-3 rounded-xl border border-[oklch(0.7_0.15_60/0.4)] bg-[oklch(0.7_0.15_60/0.1)] px-4 py-3 text-sm font-medium text-[oklch(0.45_0.12_60)] hover:bg-[oklch(0.7_0.15_60/0.15)]"
    >
      <FileWarning className="size-4 shrink-0" />
      <span className="flex-1">
        {cantidad} {cantidad === 1 ? "factura sin enviar a la DIAN" : "facturas sin enviar a la DIAN"} o con algo por resolver
      </span>
      <ChevronRight className="size-4 shrink-0" />
    </Link>
  );
}
```

- [ ] **Step 3: Ponerlo en Inicio**

En `src/app/(dashboard)/page.tsx`:

1. Imports:

```tsx
import { contarFacturasSinEnviarDian } from "@/app/actions/factura-electronica-actions";
import { AvisoFacturasDian } from "./aviso-facturas-dian";
```

2. Suma la cuenta al `Promise.all` existente (`const [overview, alertasInventario, alertasTaller] = await Promise.all([...])`):

```tsx
  const [overview, alertasInventario, alertasTaller, facturasSinEnviarDian] = await Promise.all([
    // ...las tres llamadas que ya están, sin cambios...
    contarFacturasSinEnviarDian(),
  ]);
```

3. Renderízalo justo antes de `<AlertasTallerCard ... />`:

```tsx
      <AvisoFacturasDian cantidad={facturasSinEnviarDian} />
```

- [ ] **Step 4: Correr las pruebas**

Run: `npx vitest run --project unit "src/app/(dashboard)/aviso-facturas-dian.test.tsx" "src/app/(dashboard)/page.test.tsx"`
Expected: PASS (si existe `page.test.tsx` de Inicio y no simula la acción nueva, agrega `vi.mock("@/app/actions/factura-electronica-actions", () => ({ contarFacturasSinEnviarDian: async () => 0 }))`; si no existe, corre solo el primero).

- [ ] **Step 5: Verificar y commit**

Run: `npx tsc --noEmit`, `npx eslint "src/app/(dashboard)/aviso-facturas-dian.tsx" "src/app/(dashboard)/page.tsx"`, y una pasada completa `npx vitest run --project unit` (última tarea del plan).

```bash
git add "src/app/(dashboard)/aviso-facturas-dian.tsx" "src/app/(dashboard)/aviso-facturas-dian.test.tsx" "src/app/(dashboard)/page.tsx"
git commit -m "fase-fe-task 18: aviso en Inicio de facturas sin enviar a la DIAN"
git push origin fase-fe-factura-electronica
```

---

## Fuera de este plan (Plan 2c)

- Nota crédito total en la app: permiso "Anular con nota crédito" (requisito `facturas.facturar`), concepto de corrección DIAN, numeración `prefijoNotaCredito`/`siguienteConsecutivoNotaCredito`, `ANULADO`, saldo en 0 y aviso de pagos (spec §5.3).
- Super-admin: registrar el token de los talleres con `BOLSA` y ver los documentos aceptados del periodo para cobrarlos.
- "Reenviar al cliente" (correo con PDF y XML por el SMTP del taller) — decisión §11.12.
- Aplicar la migración `20261120130000_factura_electronica` a `taller_dev` y producción (**con permiso del usuario**).

## Autorrevisión

**Cobertura spec §6 (pantallas, sin nota crédito ni super-admin):**
- Configuración → pestaña: activar, envío, ambiente con `ConfirmacionEnLinea` al pasar a producción, emisor, resolución con avisos, cuenta (bolsa/propia), probar conexión con último resultado → Tasks 12, 13.
- Ficha de la factura: estado en lenguaje sencillo, CUFE, fecha, descargas, motivos y qué corregir, enviar/reenviar → Tasks 14, 15. (Reenviar al cliente y anular → 2c.)
- Lista: insignia y filtro "Sin enviar o rechazadas" → Task 16.
- Ficha del cliente: sección plegable con municipio buscable; aviso de consumidor final → Task 17. Desde la factura, los faltantes del cliente enlazan a esta sección (Task 15).
- Inicio: aviso N > 0 que abre la lista filtrada → Task 18.
- Permisos: enviar/reenviar con `facturas.facturar`; "Configurar facturación electrónica" con requisito de facturar → Task 11.

**Cobertura spec §11 (decisiones nuevas):** §11.9 división 2b/2c → este plan; §11.10 numeración por ambiente y reinicio al cambiar resolución → Tasks 10 y 12; §11.11 `activadaDesde` → Tasks 10, 12, 14, 16, 18; §11.12 "Reenviar al cliente" a 2c.

**Pendientes del Plan 2a atendidos:** índice único sin ambiente y `GREATEST` que salta números al cambiar de resolución → Tasks 10 y 12. Siguen pendientes (2c o backlog): descarga XML/PDF sin permiso específico, motivo `ERROR` sin prueba propia.

**Placeholders:** ninguno; donde el código existente puede tener otra forma (firma de `FormGroup`, nombre de variables de las páginas), el paso dice exactamente qué revisar y qué hacer en cada caso.

**Consistencia de tipos entre tareas:** `activadaDesde` (T10) ↔ `guardarConfiguracionFeAction` (T12) ↔ `cuentaParaDian` / `contarFacturasSinEnviarDian` (T14) ↔ lista (T16); `"facturaElectronica.configurar"` (T11) ↔ T12, T13, T15; `ConfiguracionFeVista`/`ConfigFeFormState` (T12) ↔ formulario (T13); `datosFeClienteSchema` (T12) ↔ T17; `CampoMunicipio` (T13) ↔ T17; `FacturaFeVista`/`DocumentoFeVista`/`EnvioFeState` (T14) ↔ tarjeta (T15); `EstadoDian`/`TEXTO_ESTADO_DIAN` (T14) ↔ T15, T16; `/facturas?dian=pendientes` (T16) ↔ T18; ancla `#factura-electronica` (T17) ↔ T15.
