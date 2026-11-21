# Factura electrónica — Plan 2c: nota crédito, paso a producción, fecha de reenvío, copia al cliente y bolsa

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar la facturación electrónica para el piloto: anular una factura aceptada con nota crédito total, empezar de cero al pasar a Producción, reenviar con la fecha del día cuando el reenvío es otro día, mandar una copia del XML y el PDF al cliente por el correo del taller, y que el super-admin registre el token de la bolsa y vea los documentos aceptados por taller.

**Architecture:** El núcleo ya soporta `NotaCredito` (modelo, validación, mapeo Nextpyme a `/credit-note`); no se toca. El servicio (`src/lib/factura-electronica/servicio.ts`) se generaliza de `FacturaVenta` a `DocumentoElectronico`, gana `emitirNotaCredito` y, al aceptarse una nota crédito, anula la factura electrónica y deja la factura sin saldo. La fecha de reenvío se resuelve con una función pura nueva. La copia al cliente reutiliza el SMTP del taller (`enviarEmail` gana adjuntos) y los archivos que ya guardamos. El super-admin lee la configuración de cada taller con `getTenantDb(schemaName)`.

**Tech Stack:** Next 16.4.5 (server actions), React 19, Prisma 6.19 (taller y público), Zod, Nodemailer, Vitest 4 (`unit` y `db`).

**Spec:** `docs/superpowers/specs/2026-11-20-factura-electronica-design.md` (§11 y §12 mandan). Planes anteriores: `…-plan2a.md`, `…-plan2b.md` (pendientes en `docs/superpowers/plans/2026-11-21-factura-electronica-plan2b-pendientes.md`).

## Global Constraints

- Rama: `fase-fe-factura-electronica`. Commit y push al terminar **cada** tarea con el mensaje `fase-fe-task N: descripción breve` y las líneas finales `Co-Authored-By: <modelo real> <noreply@anthropic.com>`. Sin merge a `main`.
- **Sin cambios de esquema ni migraciones nuevas.** La migración `20261120130000_factura_electronica` ya está aplicada en `taller_dev` y **no se puede volver a editar**. Todo lo de este plan cabe en las tablas actuales (`documentos_electronicos` ya tiene `NOTA_CREDITO`, `ANULADO`, `documento_referencia_id`; la configuración ya tiene `prefijo_nota_credito` y `siguiente_consecutivo_nota_credito`). Tampoco se agrega un tipo nuevo a la auditoría de plataforma (enum público).
- Frontera del núcleo intacta: nada en `src/modulos/factura-electronica/` cambia. El lado TorqueFlow lo importa solo desde `@/modulos/factura-electronica`.
- Decisiones del usuario (spec §12 y conversación 2026-11-21): **empezar de cero** al pasar a Producción; nota crédito **total** (concepto por defecto "2", anulación); "Reenviar al cliente" es una **copia** por el SMTP del taller (el envío principal ya lo pide el documento con `enviarCorreo`).
- La factura de TorqueFlow no tiene estado "anulada": al aceptarse la nota crédito queda `saldoPendiente = 0` y `estado = "PAGADA"` ("sin saldo"); la insignia DIAN dice "Anulada". Si tenía pagos, la pantalla avisa que deben devolverse o quedar como anticipo (no se automatiza).
- Permisos: anular usa el permiso nuevo `facturaElectronica.anular` (requisito `facturas.facturar`); reenviar al cliente usa `facturas.facturar`; super-admin usa `requireSuperAdmin`.
- Pruebas `db` (talleres temporales): solo en las tareas 19 y 21 y **solo si el usuario las autoriza al lanzar la ejecución**. Nunca contra `taller_dev` ni producción.
- Verificación por tarea (RULES.md §4): `npx tsc --noEmit`, `npx vitest run --project unit <archivos tocados>`, `npx eslint <archivos tocados>`.
- RULES.md §1 (un intento de corrección por fallo) y §7 (no tocar backlog de otras fases).
- Textos en español de Colombia y lenguaje sencillo; acciones irreversibles con `ConfirmacionEnLinea`.

## Mapa de archivos

```
src/lib/factura-electronica/fecha-reenvio.ts (+ .test.ts)      (crear) fecha del día al reenviar
src/lib/factura-electronica/servicio.ts                        (modificar) genérico, fecha de reenvío, nota crédito, anular
src/lib/factura-electronica/servicio-db.test.ts                (modificar) fecha de reenvío y nota crédito (db)
src/app/actions/factura-electronica-config-actions.ts (+ test) (modificar) paso a producción
src/lib/auth/permisos.ts (+ test)                              (modificar) facturaElectronica.anular
src/app/actions/factura-electronica-actions.ts (+ test)        (modificar) vista con nota crédito, anular, copia al cliente
src/app/(dashboard)/facturas/[id]/nota-credito-seccion.tsx (+ test)   (crear)
src/app/(dashboard)/facturas/[id]/factura-electronica-card.tsx (+ test) (modificar)
src/app/(dashboard)/facturas/[id]/page.tsx                     (modificar)
src/lib/email/enviar-email.ts (+ test si existe)               (modificar) adjuntos
src/lib/storage/local-file-storage.ts (+ test)                 (modificar) leerDocumentoElectronico
src/app/actions/super-admin-fe-actions.ts (+ test)             (crear)
src/app/superadmin/facturacion-electronica/page.tsx            (crear)
src/app/superadmin/facturacion-electronica/token-bolsa-form.tsx (+ test) (crear)
src/app/superadmin/page.tsx                                    (modificar) enlace
```

---

### Task 19: Reenviar con la fecha del día (spec §12.2)

**Files:**
- Create: `src/lib/factura-electronica/fecha-reenvio.ts`, `src/lib/factura-electronica/fecha-reenvio.test.ts`
- Modify: `src/lib/factura-electronica/servicio.ts`
- Modify: `src/lib/factura-electronica/servicio-db.test.ts`

**Interfaces:**
- Produces: `conFechaDeReenvio<T extends DocumentoElectronico>(doc: T, hoy: { fecha: string; hora: string }): T` — devuelve **el mismo objeto** si `doc.fecha === hoy.fecha`; si no, una copia con `fecha`/`hora` de hoy y el vencimiento corrido (Task 21 la reutiliza para notas crédito).

- [ ] **Step 1: Prueba unitaria (falla)**

```ts
// src/lib/factura-electronica/fecha-reenvio.test.ts
import { describe, expect, it } from "vitest";
import type { FacturaVenta } from "@/modulos/factura-electronica";
import { conFechaDeReenvio } from "./fecha-reenvio";

const base = {
  tipo: "FACTURA",
  prefijo: "SETP",
  numero: 7,
  fecha: "2026-11-20",
  hora: "10:00:00",
  resolucionNumero: "1",
  adquirente: { tipo: "CONSUMIDOR_FINAL" },
  lineas: [],
  pago: { forma: "CONTADO", medio: "10", vencimiento: "2026-11-20" },
  enviarCorreo: false,
} as FacturaVenta;

describe("conFechaDeReenvio", () => {
  it("el mismo día devuelve el mismo documento (fecha congelada)", () => {
    expect(conFechaDeReenvio(base, { fecha: "2026-11-20", hora: "18:00:00" })).toBe(base);
  });

  it("otro día cambia fecha y hora y, de contado, el vencimiento queda en la fecha nueva", () => {
    const r = conFechaDeReenvio(base, { fecha: "2026-11-23", hora: "08:30:00" });
    expect(r).not.toBe(base);
    expect(r).toMatchObject({ fecha: "2026-11-23", hora: "08:30:00", numero: 7, prefijo: "SETP", pago: { vencimiento: "2026-11-23" } });
  });

  it("a crédito conserva el plazo en días", () => {
    const credito = { ...base, pago: { forma: "CREDITO", medio: "10", vencimiento: "2026-12-20" } } as FacturaVenta;
    expect(conFechaDeReenvio(credito, { fecha: "2026-11-23", hora: "08:30:00" }).pago.vencimiento).toBe("2026-12-23");
  });
});
```

Run: `npx vitest run --project unit src/lib/factura-electronica/fecha-reenvio.test.ts` → FAIL (módulo inexistente).

- [ ] **Step 2: Implementar**

```ts
// src/lib/factura-electronica/fecha-reenvio.ts
import type { DocumentoElectronico } from "@/modulos/factura-electronica";

const MS_DIA = 86_400_000;
const dia = (s: string) => Date.parse(`${s}T00:00:00Z`);
const sumarDias = (s: string, n: number) => new Date(dia(s) + n * MS_DIA).toISOString().slice(0, 10);

/**
 * Spec §12.2: el reenvío conserva número, líneas y totales; si el día cambió (hora de Colombia),
 * lleva la fecha y hora de hoy y el vencimiento corrido el mismo plazo. El mismo día no cambia nada.
 */
export function conFechaDeReenvio<T extends DocumentoElectronico>(doc: T, hoy: { fecha: string; hora: string }): T {
  if (doc.fecha === hoy.fecha) return doc;
  const plazo = Math.round((dia(doc.pago.vencimiento) - dia(doc.fecha)) / MS_DIA);
  const vencimiento = doc.pago.forma === "CONTADO" ? hoy.fecha : sumarDias(hoy.fecha, Math.max(0, plazo));
  return { ...doc, fecha: hoy.fecha, hora: hoy.hora, pago: { ...doc.pago, vencimiento } };
}
```

Run el test → PASS.

- [ ] **Step 3: Usarla en el servicio, justo antes de enviar**

En `src/lib/factura-electronica/servicio.ts`, función `enviarConProveedor`, reemplaza las dos últimas líneas:

```ts
  const r = await proveedor.enviar(doc.documento);
  return resolverEnvio(ctx, proveedor, doc.id, ref, doc.documento.fecha, total, r);
```

por:

```ts
  // Spec §12.2: si el reenvío es otro día, va con la fecha de hoy (mismo número y totales).
  const aEnviar = conFechaDeReenvio(doc.documento, fechaHoraBogota(reloj(ctx)));
  if (aEnviar !== doc.documento) {
    await ctx.db.documentoElectronico.update({ where: { id: doc.id }, data: { payload: comoJson(aEnviar) } });
  }
  const r = await proveedor.enviar(aEnviar);
  return resolverEnvio(ctx, proveedor, doc.id, ref, aEnviar.fecha, total, r);
```

e importa `conFechaDeReenvio` desde `./fecha-reenvio`. La confirmación previa (`confirmarPrevio`) sigue usando la fecha original del documento, que es la que conoce la DIAN si lo recibió. Actualiza el comentario de `reintentarDocumento` ("conservando número, fecha y hora" → "conservando número; la fecha se actualiza al enviar si cambió el día").

- [ ] **Step 4: Prueba db**

En `src/lib/factura-electronica/servicio-db.test.ts` busca la prueba que comprueba que el reintento **conserva** la fecha (spec §11.7 anterior). Divídela en dos, con el reloj del contexto (`ahora`) que ya usan esas pruebas:
1. Reintento el **mismo día** (otra hora): `payload.fecha` y `payload.hora` iguales a los del primer intento.
2. Reintento **otro día**: `payload.fecha` = el día nuevo, `payload.numero` igual, y el proveedor simulado recibió el documento con la fecha nueva.

Run (si el usuario autorizó pruebas db): `npx vitest run --project db src/lib/factura-electronica/servicio-db.test.ts` → PASS.

- [ ] **Step 5: Verificar y commit**

`npx tsc --noEmit`, `npx vitest run --project unit src/lib/factura-electronica`, `npx eslint src/lib/factura-electronica`.

```bash
git add src/lib/factura-electronica/fecha-reenvio.ts src/lib/factura-electronica/fecha-reenvio.test.ts src/lib/factura-electronica/servicio.ts src/lib/factura-electronica/servicio-db.test.ts
git commit -m "fase-fe-task 19: el reenvío de otro día lleva la fecha de hoy"
git push origin fase-fe-factura-electronica
```

---

### Task 20: Empezar de cero al pasar a Producción

**Files:**
- Modify: `src/app/actions/factura-electronica-config-actions.ts`, `src/app/actions/factura-electronica-config-actions.test.ts`

**Interfaces:**
- Consumes: `consecutivoInicial` (agregada en la corrección final del Plan 2b, en el mismo archivo) — si su firma no recibe el tipo de documento, generalízala a `consecutivoInicial(db, { tipo: "FACTURA" | "NOTA_CREDITO", ambiente, prefijo, desde })` y ajusta su llamada actual.

**Regla:** cuando el ambiente guardado pasa de cualquier otro a `PRODUCCION`:
1. `siguienteConsecutivo` = `consecutivoInicial(FACTURA, PRODUCCION, prefijo, rangoDesde ?? 1)`.
2. `siguienteConsecutivoNotaCredito` = `consecutivoInicial(NOTA_CREDITO, PRODUCCION, prefijoNotaCredito, 1)` (si no hay prefijo de notas, `1`).
3. Si **todavía no hay ningún documento en `PRODUCCION`** (primera vez) y `activa`, `activadaDesde = new Date()`: las facturas hechas mientras se practicaba no cuentan como pendientes (spec §11.11, decisión "empezar de cero").

- [ ] **Step 1: Pruebas (fallan)** — en el `describe("guardarConfiguracionFeAction")`, con el mock de `getTenantDb` extendido con `documentoElectronico: { aggregate: mockAggregate, count: mockCount }`:

```ts
  it("al pasar a producción por primera vez reinicia la activación y ambos consecutivos", async () => {
    const antes = new Date("2026-11-01T00:00:00.000Z");
    mockFindUnique.mockResolvedValue(fila({ ambiente: "PRUEBAS", tokenCifrado: "v1:t", activa: true, activadaDesde: antes, siguienteConsecutivo: 80 }));
    mockCount.mockResolvedValue(0);
    mockAggregate.mockResolvedValue({ _max: { numero: null } });
    const r = await guardarConfiguracionFeAction(inicial, form({ ambiente: "PRODUCCION", confirmarProduccion: "si" }));
    expect(r.success).toBe(true);
    const { update } = mockUpsert.mock.calls[0][0];
    expect(update.siguienteConsecutivo).toBe(1);
    expect(update.siguienteConsecutivoNotaCredito).toBe(1);
    expect(update.activadaDesde).toBeInstanceOf(Date);
    expect(update.activadaDesde.getTime()).toBeGreaterThan(antes.getTime());
  });

  it("si ya hubo documentos en producción no vuelve a fechar la activación", async () => {
    mockFindUnique.mockResolvedValue(fila({ ambiente: "PRUEBAS", tokenCifrado: "v1:t", activa: true, activadaDesde: new Date() }));
    mockCount.mockResolvedValue(3);
    mockAggregate.mockResolvedValue({ _max: { numero: 41 } });
    await guardarConfiguracionFeAction(inicial, form({ ambiente: "PRODUCCION", confirmarProduccion: "si" }));
    const { update } = mockUpsert.mock.calls[0][0];
    expect(update).not.toHaveProperty("activadaDesde");
    expect(update.siguienteConsecutivo).toBe(42);
  });

  it("guardar sin cambiar de ambiente no toca los consecutivos", async () => {
    mockFindUnique.mockResolvedValue(fila({ ambiente: "PRODUCCION", tokenCifrado: "v1:t", activa: true, activadaDesde: new Date() }));
    await guardarConfiguracionFeAction(inicial, form({ ambiente: "PRODUCCION" }));
    const { update } = mockUpsert.mock.calls[0][0];
    expect(update).not.toHaveProperty("siguienteConsecutivo");
    expect(update).not.toHaveProperty("siguienteConsecutivoNotaCredito");
  });
```

(Ajusta `fila()`/`form()` si los nombres cambiaron en la corrección final; `mockCount`/`mockAggregate` son `vi.fn()` nuevos en el mock de `getTenantDb`.)

- [ ] **Step 2: Implementar** — en `guardarConfiguracionFeAction`, después de calcular `resolucionNueva`:

```ts
  const pasaAProduccion = d.ambiente === "PRODUCCION" && existente?.ambiente !== "PRODUCCION";
  const primeraVezEnProduccion =
    pasaAProduccion && (await db.documentoElectronico.count({ where: { ambiente: "PRODUCCION" } })) === 0;
```

y en `campos` reemplaza las entradas condicionales de `siguienteConsecutivo` y `activadaDesde` por:

```ts
    ...(resolucionNueva || pasaAProduccion
      ? { siguienteConsecutivo: await consecutivoInicial(db, { tipo: "FACTURA", ambiente: d.ambiente, prefijo: d.prefijo, desde: d.rangoDesde ?? 1 }) }
      : {}),
    ...(pasaAProduccion
      ? {
          siguienteConsecutivoNotaCredito: await consecutivoInicial(db, {
            tipo: "NOTA_CREDITO",
            ambiente: d.ambiente,
            prefijo: d.prefijoNotaCredito,
            desde: 1,
          }),
        }
      : {}),
    // Primera activación, o primera vez en producción: lo anterior no cuenta como pendiente (spec §11.11, §12).
    ...(d.activa && (!existente?.activadaDesde || primeraVezEnProduccion) ? { activadaDesde: new Date() } : {}),
```

Calcula estos valores **antes** del `try` del upsert (como ya se hace con `consecutivoInicial`), envolviendo las lecturas en el mismo `try` que el upsert para que un error de base se devuelva con `friendlyPrismaErrorMessage`.

- [ ] **Step 3: Correr, verificar y commit**

`npx vitest run --project unit src/app/actions/factura-electronica-config-actions.test.ts` → PASS; `npx tsc --noEmit`; eslint.

```bash
git add src/app/actions/factura-electronica-config-actions.ts src/app/actions/factura-electronica-config-actions.test.ts
git commit -m "fase-fe-task 20: al pasar a producción se empieza de cero"
git push origin fase-fe-factura-electronica
```

---

### Task 21: Servicio de nota crédito total

**Files:**
- Modify: `src/lib/factura-electronica/servicio.ts`
- Modify: `src/lib/factura-electronica/servicio-db.test.ts`

**Interfaces:**
- Consumes: `conFechaDeReenvio` (Task 19); núcleo: `NotaCredito`, `ConceptoNotaCredito`, `CONCEPTOS_NOTA_CREDITO`, `validarDocumento`, `DocumentoElectronico`.
- Produces (Task 22):
  - `interface DatosNotaCredito { concepto: ConceptoNotaCredito; motivo: string }`
  - `emitirNotaCredito(ctx: ContextoFe, facturaId: string, datos: DatosNotaCredito): Promise<ResultadoFe>`
  - Al aceptarse una nota crédito: el documento FACTURA referenciado pasa a `ANULADO` y la `Factura` queda con `saldoPendiente = 0` y `estado = "PAGADA"`.

- [ ] **Step 1: Generalizar el envío a cualquier documento**

En `servicio.ts`:
1. `interface DocumentoEnCurso { id: string; documento: DocumentoElectronico; cufe: string | null }` (antes `FacturaVenta`).
2. En `enviarConProveedor`, `ref.tipo` sale del documento: `tipo: doc.documento.tipo`.
3. En `reintentarDocumento`: lee el documento como `DocumentoElectronico` y **solo** vuelve a mapear desde la factura cuando `doc.tipo === "FACTURA"` y el estado es `RECHAZADO` o `PENDIENTE` (una nota crédito se reenvía con su propio `payload`). Selecciona `tipo` en la consulta del documento si no lo hace.

- [ ] **Step 2: Anular al aceptarse la nota crédito**

Agrega:

```ts
/** Nota crédito aceptada (spec §5.3): la factura electrónica queda ANULADO y la factura, sin saldo. */
async function anularFacturaReferenciada(ctx: ContextoFe, notaCreditoId: string): Promise<void> {
  const nota = await ctx.db.documentoElectronico.findUnique({
    where: { id: notaCreditoId },
    select: { facturaId: true, documentoReferenciaId: true },
  });
  if (!nota?.documentoReferenciaId) return;
  const referenciaId = nota.documentoReferenciaId;
  await ctx.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM facturas WHERE id = ${nota.facturaId} FOR UPDATE`;
    await tx.documentoElectronico.update({ where: { id: referenciaId }, data: { estado: "ANULADO" } });
    await tx.factura.update({ where: { id: nota.facturaId }, data: { saldoPendiente: 0, estado: "PAGADA" } });
  }, TX);
}
```

y en `aceptar(...)`, después de guardar los archivos y antes del `return`:

```ts
  if (ref.tipo === "NOTA_CREDITO") await anularFacturaReferenciada(ctx, id);
```

- [ ] **Step 3: `emitirNotaCredito`**

```ts
export interface DatosNotaCredito {
  concepto: ConceptoNotaCredito;
  motivo: string;
}

/**
 * Nota crédito total sobre una factura electrónica aceptada (spec §5.3). Toma adquirente, líneas
 * y pago de la factura aceptada; usa la numeración de notas crédito. Si ya hay una, es un reintento.
 */
export async function emitirNotaCredito(ctx: ContextoFe, facturaId: string, datos: DatosNotaCredito): Promise<ResultadoFe> {
  const ahora = reloj(ctx);
  const config = await leerConfiguracionFe(ctx.db);
  if (!config?.activa) return falla("INACTIVA", "La facturación electrónica no está activa en este taller.");
  const motivo = datos.motivo.trim();
  if (!motivo) return falla("VALIDACION", "Escribe el motivo de la nota crédito.", [{ campo: "motivo", mensaje: "Escribe el motivo de la nota crédito." }]);
  if (!config.prefijoNotaCredito) {
    const texto = "Falta el prefijo de notas crédito en la configuración de facturación electrónica.";
    return falla("VALIDACION", texto, [{ campo: "config.prefijoNotaCredito", mensaje: texto }]);
  }

  const factura = await ctx.db.documentoElectronico.findFirst({ where: { facturaId, tipo: "FACTURA" } });
  if (!factura) return falla("NO_ENCONTRADO", "Esta factura no tiene factura electrónica.");
  if (factura.estado !== "ACEPTADO" || !factura.cufe) {
    return falla("ESTADO", "Solo se puede anular una factura electrónica aceptada por la DIAN.");
  }
  if (factura.ambiente !== config.ambiente) {
    return falla("AMBIENTE", "Esta factura se emitió en otro ambiente; no se puede anular desde el actual.");
  }

  const existente = await ctx.db.documentoElectronico.findFirst({ where: { facturaId, tipo: "NOTA_CREDITO" }, select: { id: true } });
  if (existente) return reintentarDocumento(ctx, existente.id);

  const original = factura.payload as unknown as FacturaVenta;
  const { fecha, hora } = fechaHoraBogota(ahora);
  const base: NotaCredito = {
    tipo: "NOTA_CREDITO",
    prefijo: config.prefijoNotaCredito,
    numero: Math.max(config.siguienteConsecutivoNotaCredito, 1),
    fecha,
    hora,
    adquirente: original.adquirente,
    lineas: original.lineas,
    pago: original.pago.forma === "CONTADO" ? { ...original.pago, vencimiento: fecha } : original.pago,
    enviarCorreo: original.enviarCorreo,
    concepto: datos.concepto,
    motivo,
    facturaReferencia: { numeroCompleto: `${factura.prefijo}${factura.numero}`, cufe: factura.cufe, fecha: original.fecha },
  };
  const errores = validarDocumento(base, { hoy: fecha });
  if (errores.length > 0) return falla("VALIDACION", "Faltan datos para la nota crédito.", errores);

  const facturaDocId = factura.id;
  const creado = await ctx.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM facturas WHERE id = ${facturaId} FOR UPDATE`;
    const otra = await tx.documentoElectronico.findFirst({ where: { facturaId, tipo: "NOTA_CREDITO" }, select: { id: true } });
    if (otra) return null;
    const [fila] = await tx.$queryRaw<{ asignado: number }[]>`
      UPDATE configuracion_factura_electronica
      SET siguiente_consecutivo_nota_credito = GREATEST(siguiente_consecutivo_nota_credito, 1) + 1, updated_at = NOW()
      WHERE id = 'singleton'
      RETURNING siguiente_consecutivo_nota_credito - 1 AS asignado`;
    const documento: NotaCredito = { ...base, numero: fila.asignado };
    const doc = await tx.documentoElectronico.create({
      data: {
        tipo: "NOTA_CREDITO",
        facturaId,
        documentoReferenciaId: facturaDocId,
        prefijo: documento.prefijo,
        numero: documento.numero,
        estado: "ENVIANDO",
        payload: comoJson(documento),
        ambiente: config.ambiente,
        creadoPorId: ctx.usuarioId,
        intentos: 1,
        ultimoIntentoAt: ahora,
      },
      select: { id: true },
    });
    return { id: doc.id, documento, cufe: null } satisfies DocumentoEnCurso;
  }, TX);

  if (!creado) {
    const ganadora = await ctx.db.documentoElectronico.findFirst({ where: { facturaId, tipo: "NOTA_CREDITO" }, select: { id: true } });
    return ganadora ? reintentarDocumento(ctx, ganadora.id) : falla("NO_ENCONTRADO", "La factura no existe.");
  }
  return ejecutarEnvio(ctx, config, creado, false);
}
```

Importa `NotaCredito`, `ConceptoNotaCredito`, `DocumentoElectronico` y `validarDocumento` desde `@/modulos/factura-electronica` (el servicio ya importa varios de ahí). Si `validarDocumento` exige algo más para notas crédito, ajusta `base` según el error y anótalo en el reporte.

- [ ] **Step 4: Pruebas db (si el usuario las autorizó)** — en `servicio-db.test.ts`, con los mismos helpers que usan las pruebas de emisión (taller temporal, configuración `SIMULADO`, `crearFacturaDePrueba`, `ctx` con `proveedor` simulado), agrega un `describe("nota crédito")` con:
1. Factura aceptada → `emitirNotaCredito(ctx, facturaId, { concepto: "2", motivo: "Error en la factura" })` → `{ ok: true, estado: "ACEPTADO" }`; el documento NOTA_CREDITO tiene `documentoReferenciaId` = id del documento FACTURA y `prefijo` = `prefijoNotaCredito`; el documento FACTURA queda `ANULADO`; la factura queda `saldoPendiente` 0 y `estado` `PAGADA`.
2. Dos notas crédito en facturas distintas toman números consecutivos (1 y 2) y la configuración queda en `siguienteConsecutivoNotaCredito` 3.
3. Sobre una factura con documento `RECHAZADO` → `{ ok: false, motivo: "ESTADO" }` y no se crea nada.
4. Sin `prefijoNotaCredito` → `VALIDACION`, sin número gastado.
5. Llamar dos veces sobre la misma factura no crea una segunda nota crédito (la segunda es un reintento: mismo `id`).

Run: `npx vitest run --project db src/lib/factura-electronica/servicio-db.test.ts` → PASS.

- [ ] **Step 5: Verificar y commit**

`npx tsc --noEmit`, `npx vitest run --project unit src/lib/factura-electronica src/app/actions`, eslint.

```bash
git add src/lib/factura-electronica/servicio.ts src/lib/factura-electronica/servicio-db.test.ts
git commit -m "fase-fe-task 21: nota crédito total que anula la factura electrónica"
git push origin fase-fe-factura-electronica
```

---

### Task 22: Permiso y pantalla para anular con nota crédito

**Files:**
- Modify: `src/lib/auth/permisos.ts`, `src/lib/auth/permisos.test.ts`
- Modify: `src/app/actions/factura-electronica-actions.ts`, `src/app/actions/factura-electronica-actions.test.ts`
- Create: `src/app/(dashboard)/facturas/[id]/nota-credito-seccion.tsx`, `nota-credito-seccion.test.tsx`
- Modify: `src/app/(dashboard)/facturas/[id]/factura-electronica-card.tsx` (+ test), `page.tsx`

**Interfaces:**
- Consumes: `emitirNotaCredito`, `DatosNotaCredito` (Task 21); `CONCEPTOS_NOTA_CREDITO` (núcleo).
- Produces: permiso `"facturaElectronica.anular"`; `FacturaFeVista.notaCredito: DocumentoFeVista | null`; `anularConNotaCreditoAction(facturaId: string, prev: EnvioFeState, formData: FormData): Promise<EnvioFeState>`.

- [ ] **Step 1: Permiso (TDD)** — en `permisos.test.ts`:

```ts
  it("facturaElectronica.anular: solo ADMIN por rol; se agrega con facturar", () => {
    expect(permisosEfectivos({ role: "ADMIN" })).toContain("facturaElectronica.anular");
    expect(permisosEfectivos({ role: "RECEPCION" })).not.toContain("facturaElectronica.anular");
    expect(permisosEfectivos({ role: "RECEPCION", agregados: ["facturaElectronica.anular"] })).toContain("facturaElectronica.anular");
    expect(permisosEfectivos({ role: "TECNICO", agregados: ["facturaElectronica.anular"] })).not.toContain("facturaElectronica.anular");
    expect(REQUISITOS["facturaElectronica.anular"]).toEqual(["facturas.facturar"]);
  });
```

En `permisos.ts`, en `PERMISOS` justo después de `"facturas.facturar"`:

```ts
  "facturaElectronica.anular": { grupo: "Dinero", etiqueta: "Anular facturas con nota crédito" },
```

y en `REQUISITOS`: `"facturaElectronica.anular": ["facturas.facturar"],`. Sin rol por defecto.

- [ ] **Step 2: Acción y vista (TDD)** — en `factura-electronica-actions.test.ts` agrega (con el mock del servicio extendido con `emitirNotaCredito: (...a) => mockNotaCredito(...a)`):

```ts
describe("anularConNotaCreditoAction", () => {
  const fd = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  };

  it("pide el permiso de anular, valida el concepto y traduce la aceptación", async () => {
    mockFacturaFindFirst.mockResolvedValue({ id: "f1" });
    mockNotaCredito.mockResolvedValue({ ok: true, documentoId: "n1", estado: "ACEPTADO", mensajes: [] });
    const r = await anularConNotaCreditoAction("f1", inicial, fd({ concepto: "2", motivo: "Error" }));
    expect(mockRequirePermiso).toHaveBeenCalledWith("facturaElectronica.anular");
    expect(mockNotaCredito.mock.calls[0][2]).toEqual({ concepto: "2", motivo: "Error" });
    expect(r).toEqual({ error: null, success: true, mensaje: "La DIAN aceptó la nota crédito. La factura quedó anulada.", errores: [] });
  });

  it("concepto inválido no llama al servicio", async () => {
    mockFacturaFindFirst.mockResolvedValue({ id: "f1" });
    const r = await anularConNotaCreditoAction("f1", inicial, fd({ concepto: "9", motivo: "x" }));
    expect(r.error).toBe("Elige el concepto de la nota crédito.");
    expect(mockNotaCredito).not.toHaveBeenCalled();
  });
});
```

Y en el `describe("getFacturaFe")` una prueba de que la vista trae `notaCredito` (segundo elemento con `tipo: "NOTA_CREDITO"`).

Implementación en `factura-electronica-actions.ts`:
1. En `getFacturaFe`, la consulta trae los documentos de ambos tipos: `documentosElectronicos: { where: { tipo: { in: ["FACTURA", "NOTA_CREDITO"] } }, select: { ...SELECT_DOCUMENTO, tipo: true }, orderBy: { createdAt: "asc" } }`; arma `documento` con el de tipo FACTURA y `notaCredito` con el de tipo NOTA_CREDITO (o `null`), ambos con la misma conversión de `mensajes` (`Array.isArray`). Agrega `notaCredito: DocumentoFeVista | null` a `FacturaFeVista`.
2. Nueva acción:

```ts
const MENSAJE_NOTA_CREDITO: Partial<Record<EstadoDocumentoElectronico, string>> = {
  ACEPTADO: "La DIAN aceptó la nota crédito. La factura quedó anulada.",
  RECHAZADO: "La DIAN rechazó la nota crédito. Revisa los motivos y vuelve a intentarlo.",
  POR_CONFIRMAR: "No se pudo confirmar si la DIAN recibió la nota crédito. Vuelve a intentarlo en unos minutos.",
};

export async function anularConNotaCreditoAction(facturaId: string, _prev: EnvioFeState, formData: FormData): Promise<EnvioFeState> {
  const session = await requirePermiso("facturaElectronica.anular");
  const db = getTenantDb(session.user.tenantSchema);
  const factura = await db.factura.findFirst({ where: { id: facturaId, ...scopeFactura(session.user.sedeActivaId) }, select: { id: true } });
  if (!factura) return { error: "La factura no existe.", success: false, mensaje: null, errores: [] };
  const concepto = String(formData.get("concepto") ?? "");
  if (!Object.prototype.hasOwnProperty.call(CONCEPTOS_NOTA_CREDITO, concepto)) {
    return { error: "Elige el concepto de la nota crédito.", success: false, mensaje: null, errores: [] };
  }
  const motivo = String(formData.get("motivo") ?? "");
  const r = await emitirNotaCredito(
    { db, tenantSchema: session.user.tenantSchema, usuarioId: session.user.id },
    facturaId,
    { concepto: concepto as ConceptoNotaCredito, motivo },
  );
  revalidatePath(`/facturas/${facturaId}`);
  if (!r.ok) return { error: r.mensaje, success: false, mensaje: null, errores: r.errores };
  if (r.estado === "ACEPTADO") return { error: null, success: true, mensaje: MENSAJE_NOTA_CREDITO.ACEPTADO!, errores: [] };
  return { error: MENSAJE_NOTA_CREDITO[r.estado] ?? "No se pudo enviar la nota crédito. Vuelve a intentarlo.", success: false, mensaje: null, errores: [] };
}
```

- [ ] **Step 3: Sección de nota crédito (TDD)** — `nota-credito-seccion.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/app/actions/factura-electronica-actions", () => ({
  anularConNotaCreditoAction: vi.fn(),
  reenviarDocumentoAction: vi.fn(),
}));

import { NotaCreditoSeccion } from "./nota-credito-seccion";

const props = { facturaId: "f1", puedeAnular: true, puedeFacturar: true, cobrado: 0, ahora: new Date("2026-11-21T15:00:00Z") };

describe("NotaCreditoSeccion", () => {
  it("sin nota crédito ofrece anular y pide confirmación con concepto y motivo", () => {
    render(<NotaCreditoSeccion {...props} notaCredito={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Anular con nota crédito" }));
    expect(screen.getByLabelText("Motivo")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Error en el valor" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByRole("group", { name: "¿Anular esta factura con nota crédito? No se puede deshacer." })).toBeInTheDocument();
  });

  it("avisa si la factura tiene pagos", () => {
    render(<NotaCreditoSeccion {...props} cobrado={150000} notaCredito={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Anular con nota crédito" }));
    expect(screen.getByText(/tiene pagos por \$\s?150\.000/)).toBeInTheDocument();
  });

  it("sin permiso no muestra el botón", () => {
    render(<NotaCreditoSeccion {...props} puedeAnular={false} notaCredito={null} />);
    expect(screen.queryByRole("button", { name: "Anular con nota crédito" })).toBeNull();
  });

  it("con nota crédito aceptada muestra número y descargas", () => {
    render(
      <NotaCreditoSeccion
        {...props}
        notaCredito={{
          id: "n1", estado: "ACEPTADO", prefijo: "NC", numero: 3, cufe: "cude-1", fechaValidacion: null, mensajes: [],
          xmlRuta: "/api/uploads/t/facturas-electronicas/n1/NCS-NC3.xml", pdfRuta: null, ambiente: "PRODUCCION", intentos: 1, ultimoIntentoAt: null,
        }}
      />,
    );
    expect(screen.getByText("NC-3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Descargar XML de la nota crédito" })).toBeInTheDocument();
  });
});
```

Implementa `nota-credito-seccion.tsx` ("use client"): props `{ facturaId, notaCredito: DocumentoFeVista | null, puedeAnular, puedeFacturar, cobrado: number, ahora: Date }`.
- Con `notaCredito`: título "Nota crédito", insignia con `textoEstadoDian(estadoDian(notaCredito, ahora), notaCredito.ambiente)` (las funciones de `textos.ts` tras la corrección final del 2b; usa sus nombres reales), número `${prefijo}-${numero}`, CUFE si hay, motivos si no está aceptada, enlaces "Descargar PDF de la nota crédito"/"Descargar XML de la nota crédito" si está aceptada, y botón "Reenviar a la DIAN" (con `reenviarDocumentoAction.bind(null, facturaId, notaCredito.id)`) si `puedeFacturar` y el estado no es `ACEPTADO`.
- Sin `notaCredito` y `puedeAnular`: botón "Anular con nota crédito" que despliega un formulario con `SelectField` `name="concepto"` (opciones de `CONCEPTOS_NOTA_CREDITO`, por defecto `"2"`), `Textarea` con etiqueta "Motivo" (`name="motivo"`, obligatorio), el aviso de pagos si `cobrado > 0` ("Esta factura tiene pagos por {moneda}. La nota crédito no los devuelve: devuélvelos al cliente o déjalos como anticipo."), botón "Continuar" que abre `ConfirmacionEnLinea` (`pregunta="¿Anular esta factura con nota crédito? No se puede deshacer."`, `etiquetaConfirmar="Sí, anular"`, `enviaFormulario`) y muestra `state.error`/`state.mensaje`/`state.errores` como la tarjeta.
- Formato de moneda: el mismo `Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })` que usa la ficha.

- [ ] **Step 4: Integrarla** — en `factura-electronica-card.tsx` agrega props `notaCredito`, `puedeAnular`, `cobrado` y renderiza `<NotaCreditoSeccion …/>` al final de la tarjeta cuando el documento FACTURA está `ACEPTADO` o `ANULADO` (separada con un borde superior). En `page.tsx` pasa `notaCredito={facturaFe.notaCredito}`, `puedeAnular={puede(session, "facturaElectronica.anular")}` y `cobrado={cobrado}` (ya calculado en la página). Actualiza las pruebas de la tarjeta con las props nuevas.

- [ ] **Step 5: Verificar y commit**

`npx tsc --noEmit`; `npx vitest run --project unit src/lib/auth src/app/actions/factura-electronica-actions.test.ts "src/app/(dashboard)/facturas" "src/app/(dashboard)/dashboard-sidebar.test.tsx"`; eslint.

```bash
git add src/lib/auth/permisos.ts src/lib/auth/permisos.test.ts src/app/actions/factura-electronica-actions.ts src/app/actions/factura-electronica-actions.test.ts "src/app/(dashboard)/facturas/[id]"
git commit -m "fase-fe-task 22: anular una factura con nota crédito desde su ficha"
git push origin fase-fe-factura-electronica
```

---

### Task 23: Reenviar al cliente (copia por el correo del taller)

**Files:**
- Modify: `src/lib/email/enviar-email.ts` (+ su test si existe)
- Modify: `src/lib/storage/local-file-storage.ts`, `src/lib/storage/local-file-storage.test.ts`
- Modify: `src/app/actions/factura-electronica-actions.ts` (+ test)
- Modify: `src/app/(dashboard)/facturas/[id]/factura-electronica-card.tsx` (+ test), `page.tsx`

**Interfaces:**
- Produces: `MensajeEmail.adjuntos?: { nombre: string; contenido: Buffer; tipo: string }[]`; `leerDocumentoElectronico(tenantSchema: string, url: string): Promise<{ nombre: string; contenido: Buffer } | null>`; `reenviarAlClienteAction(facturaId: string, documentoId: string, prev: EnvioFeState, formData: FormData): Promise<EnvioFeState>`.

- [ ] **Step 1: Adjuntos en `enviarEmail`** — agrega a `MensajeEmail`:

```ts
  /** Archivos adjuntos (XML y PDF de la factura electrónica). */
  adjuntos?: { nombre: string; contenido: Buffer; tipo: string }[];
```

y en `sendMail`: `attachments: mensaje.adjuntos?.map((a) => ({ filename: a.nombre, content: a.contenido, contentType: a.tipo })),`. Si existe `enviar-email.test.ts`, agrega una prueba con el transporte simulado que verifique `attachments`.

- [ ] **Step 2: Leer un archivo guardado (TDD)** — en `local-file-storage.test.ts`, siguiendo cómo ese archivo prueba `saveDocumentoElectronico` (raíz temporal de uploads):

```ts
describe("leerDocumentoElectronico", () => {
  it("lee un XML guardado por su URL", async () => {
    const guardado = await saveDocumentoElectronico("taller_x", "doc1", "FES-SETP7.xml", Buffer.from("<x/>"));
    expect(await leerDocumentoElectronico("taller_x", guardado.url)).toEqual({ nombre: "FES-SETP7.xml", contenido: Buffer.from("<x/>") });
  });

  it("rechaza URLs de otro taller, de otra carpeta o con ..", async () => {
    expect(await leerDocumentoElectronico("taller_x", "/api/uploads/taller_y/facturas-electronicas/d/a.xml")).toBeNull();
    expect(await leerDocumentoElectronico("taller_x", "/api/uploads/taller_x/dvi/d/a.jpg")).toBeNull();
    expect(await leerDocumentoElectronico("taller_x", "/api/uploads/taller_x/facturas-electronicas/../../a.xml")).toBeNull();
  });

  it("null si el archivo ya no existe", async () => {
    expect(await leerDocumentoElectronico("taller_x", "/api/uploads/taller_x/facturas-electronicas/zz/no.xml")).toBeNull();
  });
});
```

(Usa la firma real de `saveDocumentoElectronico`; si recibe otros argumentos, adapta la primera prueba.)

Implementación en `local-file-storage.ts`:

```ts
/** Lee un XML/PDF de factura electrónica por su URL de /api/uploads, solo dentro del taller. */
export async function leerDocumentoElectronico(
  tenantSchema: string,
  url: string,
): Promise<{ nombre: string; contenido: Buffer } | null> {
  const prefijo = `${PREFIJO_URL}${tenantSchema}/facturas-electronicas/`;
  if (!url.startsWith(prefijo) || url.includes("..")) return null;
  const partes = url.slice(PREFIJO_URL.length).split("/");
  const raizTaller = path.join(getUploadsRoot(), tenantSchema, "facturas-electronicas");
  const ruta = path.join(getUploadsRoot(), ...partes);
  if (!ruta.startsWith(raizTaller + path.sep)) return null;
  try {
    return { nombre: partes[partes.length - 1], contenido: await fs.readFile(ruta) };
  } catch {
    return null;
  }
}
```

(usa los imports de `path` y `fs` que el archivo ya tiene, con sus nombres reales).

- [ ] **Step 3: Acción (TDD)** — en `factura-electronica-actions.test.ts`, con mocks de `@/lib/storage/local-file-storage` (`leerDocumentoElectronico`), `@/lib/email/enviar-email` (`enviarEmail`), `@/lib/email/smtp-config` (`descifrarConfiguracionSmtp` → config falsa) y `configuracionSmtp.findUnique` en el mock de la base:
1. Envía al correo del cliente con los dos adjuntos (`application/xml`, `application/pdf`) y responde `{ success: true, mensaje: "Se envió una copia a cliente@correo.test." }`.
2. Cliente sin correo → `"El cliente no tiene correo registrado."`, sin envío.
3. Sin SMTP activo → `"Configura el correo del taller en Configuración del taller → Correo y avisos."`.
4. Documento no aceptado o de otra factura → `"El documento no existe."`.
5. Error del SMTP → `"No se pudo enviar el correo. Revisa la configuración del correo del taller."` (sin el texto crudo del error).

Implementación (en el mismo archivo de acciones):

```ts
export async function reenviarAlClienteAction(
  facturaId: string,
  documentoId: string,
  _prev: EnvioFeState,
  _formData: FormData,
): Promise<EnvioFeState> {
  const falla = (error: string): EnvioFeState => ({ error, success: false, mensaje: null, errores: [] });
  const session = await requirePermiso("facturas.facturar");
  const db = getTenantDb(session.user.tenantSchema);
  const factura = await db.factura.findFirst({
    where: { id: facturaId, ...scopeFactura(session.user.sedeActivaId) },
    select: { id: true, cliente: { select: { email: true, nombre: true } } },
  });
  if (!factura) return falla("La factura no existe.");
  const doc = await db.documentoElectronico.findFirst({
    where: { id: documentoId, facturaId, estado: { in: ["ACEPTADO", "ANULADO"] } },
    select: { tipo: true, prefijo: true, numero: true, xmlRuta: true, pdfRuta: true },
  });
  if (!doc) return falla("El documento no existe.");
  const correo = factura.cliente.email?.trim();
  if (!correo) return falla("El cliente no tiene correo registrado.");
  const smtp = await db.configuracionSmtp.findUnique({ where: { id: CONFIGURACION_SMTP_ID } });
  if (!smtp?.activo) return falla("Configura el correo del taller en Configuración del taller → Correo y avisos.");

  const archivos = await Promise.all([
    doc.xmlRuta ? leerDocumentoElectronico(session.user.tenantSchema, doc.xmlRuta) : null,
    doc.pdfRuta ? leerDocumentoElectronico(session.user.tenantSchema, doc.pdfRuta) : null,
  ]);
  const adjuntos = [
    archivos[0] && { ...archivos[0], tipo: "application/xml" },
    archivos[1] && { ...archivos[1], tipo: "application/pdf" },
  ].filter((a): a is { nombre: string; contenido: Buffer; tipo: string } => Boolean(a));
  if (adjuntos.length === 0) return falla("No encontramos los archivos de este documento para enviarlos.");

  const nombreDoc = `${doc.tipo === "NOTA_CREDITO" ? "Nota crédito" : "Factura electrónica"} ${doc.prefijo}${doc.numero}`;
  try {
    await enviarEmail(descifrarConfiguracionSmtp(smtp as ConfiguracionSmtpAlmacenada), {
      para: correo,
      asunto: `${nombreDoc} — ${smtp.fromNombre}`,
      texto: `Hola ${factura.cliente.nombre}:\n\nAdjuntamos copia de su ${nombreDoc.toLowerCase()} (XML y PDF).\n\n${smtp.fromNombre}`,
      html: `<p>Hola ${escaparHtml(factura.cliente.nombre)}:</p><p>Adjuntamos copia de su ${escaparHtml(nombreDoc.toLowerCase())} (XML y PDF).</p><p>${escaparHtml(smtp.fromNombre)}</p>`,
      adjuntos,
    });
  } catch {
    return falla("No se pudo enviar el correo. Revisa la configuración del correo del taller.");
  }
  return { error: null, success: true, mensaje: `Se envió una copia a ${correo}.`, errores: [] };
}
```

con `escaparHtml` (busca si ya existe uno en `src/lib/email`; si no, defínelo local: reemplaza `& < > " '`). Imports: `CONFIGURACION_SMTP_ID`, `descifrarConfiguracionSmtp`, `ConfiguracionSmtpAlmacenada` de `@/lib/email/smtp-config`; `enviarEmail` de `@/lib/email/enviar-email`; `leerDocumentoElectronico` de `@/lib/storage/local-file-storage`.

- [ ] **Step 4: Botón** — en la tarjeta (y en `NotaCreditoSeccion` para la nota aceptada): con el documento `ACEPTADO` y alguna ruta de archivo y `puedeFacturar`, un formulario con botón "Reenviar al cliente" (`reenviarAlClienteAction.bind(null, facturaId, doc.id)`, su propio `useActionState`). Si el cliente no tiene correo (prop nueva `correoCliente: string | null` desde la página: `factura.cliente.email`), en lugar del botón: "El cliente no tiene correo registrado." en gris. Prueba en `factura-electronica-card.test.tsx` para ambos casos.

- [ ] **Step 5: Verificar y commit**

`npx tsc --noEmit`; `npx vitest run --project unit src/lib/email src/lib/storage src/app/actions/factura-electronica-actions.test.ts "src/app/(dashboard)/facturas"`; eslint.

```bash
git add src/lib/email/enviar-email.ts src/lib/storage/local-file-storage.ts src/lib/storage/local-file-storage.test.ts src/app/actions/factura-electronica-actions.ts src/app/actions/factura-electronica-actions.test.ts "src/app/(dashboard)/facturas/[id]"
git commit -m "fase-fe-task 23: reenviar al cliente una copia del XML y el PDF"
git push origin fase-fe-factura-electronica
```

(Si `enviar-email.test.ts` existe y lo modificaste, agrégalo también.)

---

### Task 24: Super-admin — token de la bolsa y documentos por taller

**Files:**
- Create: `src/app/actions/super-admin-fe-actions.ts`, `src/app/actions/super-admin-fe-actions.test.ts`
- Create: `src/app/superadmin/facturacion-electronica/page.tsx`
- Create: `src/app/superadmin/facturacion-electronica/token-bolsa-form.tsx`, `token-bolsa-form.test.tsx`
- Modify: `src/app/superadmin/page.tsx` (enlace junto a "Auditoría")

**Interfaces:**
- Produces:
  - `interface FilaFeTaller { tenantId: string; slug: string; nombre: string | null; estado: "SIN_MIGRAR" | "SIN_CONFIGURAR" | "CONFIGURADA"; activa: boolean; ambiente: AmbienteFacturaElectronica | null; cuenta: CuentaFacturaElectronica | null; tokenRegistrado: boolean; aceptadosMes: number }`
  - `listFacturacionElectronicaTalleres(mes: string): Promise<FilaFeTaller[]>` (`mes` = "YYYY-MM")
  - `rangoMesBogota(mes: string): { desde: Date; hasta: Date }`
  - `registrarTokenBolsaAction(tenantId: string, prev: SuperAdminFormState, formData: FormData): Promise<SuperAdminFormState>`

- [ ] **Step 1: Pruebas de las acciones (fallan)** — `super-admin-fe-actions.test.ts`, con mocks de `@/lib/super-admin/guards` (`requireSuperAdmin`), `@/lib/db/public-client` (`publicDb.tenant.findMany/findUnique`), `@/lib/db/tenant-client` (`getTenantDb` → objeto por schema con `configuracionFacturaElectronica.findUnique/upsert` y `documentoElectronico.count`) y `next/cache`:
1. `rangoMesBogota("2026-11")` → `{ desde: 2026-11-01T05:00:00.000Z, hasta: 2026-12-01T05:00:00.000Z }`; `"2026-12"` cruza el año a `2027-01-01T05:00:00.000Z`.
2. `listFacturacionElectronicaTalleres("2026-11")` llama `requireSuperAdmin`, devuelve una fila por taller: con configuración → `CONFIGURADA`, `tokenRegistrado` según `tokenCifrado`, y `aceptadosMes` = el `count` con `where: { ambiente: "PRODUCCION", estado: { in: ["ACEPTADO", "ANULADO"] }, createdAt: { gte: desde, lt: hasta } }`; sin fila → `SIN_CONFIGURAR`; si la consulta lanza (tabla inexistente) → `SIN_MIGRAR` sin romper las demás filas.
3. `registrarTokenBolsaAction`: token vacío → error "Escribe el token."; taller con cuenta `PROPIA` → error "Este taller usa su propia cuenta del proveedor."; caso feliz → `upsert` con `tokenCifrado` que empieza por `v1:` y `create` con `cuenta: "BOLSA"`; nunca devuelve el token.

- [ ] **Step 2: Implementar las acciones**

```ts
// src/app/actions/super-admin-fe-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/super-admin/guards";
import { publicDb } from "@/lib/db/public-client";
import { getTenantDb } from "@/lib/db/tenant-client";
import { cifrarSecreto } from "@/lib/crypto/secret-box";
import type { SuperAdminFormState } from "@/app/actions/super-admin-actions";
import type { AmbienteFacturaElectronica, CuentaFacturaElectronica } from "@/generated/prisma-tenant";

export interface FilaFeTaller {
  tenantId: string;
  slug: string;
  nombre: string | null;
  estado: "SIN_MIGRAR" | "SIN_CONFIGURAR" | "CONFIGURADA";
  activa: boolean;
  ambiente: AmbienteFacturaElectronica | null;
  cuenta: CuentaFacturaElectronica | null;
  tokenRegistrado: boolean;
  aceptadosMes: number;
}

/** Mes "YYYY-MM" en hora de Colombia (UTC-5, sin horario de verano). */
export function rangoMesBogota(mes: string): { desde: Date; hasta: Date } {
  const [anio, m] = mes.split("-").map(Number);
  const desde = new Date(Date.UTC(anio, m - 1, 1, 5));
  const hasta = new Date(Date.UTC(m === 12 ? anio + 1 : anio, m === 12 ? 0 : m, 1, 5));
  return { desde, hasta };
}

export async function listFacturacionElectronicaTalleres(mes: string): Promise<FilaFeTaller[]> {
  await requireSuperAdmin();
  const { desde, hasta } = rangoMesBogota(mes);
  const tenants = await publicDb.tenant.findMany({ select: { id: true, slug: true, nombre: true, schemaName: true }, orderBy: { slug: "asc" } });
  return Promise.all(
    tenants.map(async (t): Promise<FilaFeTaller> => {
      const vacia = { tenantId: t.id, slug: t.slug, nombre: t.nombre, activa: false, ambiente: null, cuenta: null, tokenRegistrado: false, aceptadosMes: 0 };
      try {
        const db = getTenantDb(t.schemaName);
        const config = await db.configuracionFacturaElectronica.findUnique({ where: { id: "singleton" } });
        if (!config) return { ...vacia, estado: "SIN_CONFIGURAR" };
        const aceptadosMes = await db.documentoElectronico.count({
          where: { ambiente: "PRODUCCION", estado: { in: ["ACEPTADO", "ANULADO"] }, createdAt: { gte: desde, lt: hasta } },
        });
        return {
          ...vacia,
          estado: "CONFIGURADA",
          activa: config.activa,
          ambiente: config.ambiente,
          cuenta: config.cuenta,
          tokenRegistrado: Boolean(config.tokenCifrado),
          aceptadosMes,
        };
      } catch {
        return { ...vacia, estado: "SIN_MIGRAR" };
      }
    }),
  );
}

export async function registrarTokenBolsaAction(
  tenantId: string,
  _prev: SuperAdminFormState,
  formData: FormData,
): Promise<SuperAdminFormState> {
  await requireSuperAdmin();
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return { error: "Escribe el token.", success: false };
  const tenant = await publicDb.tenant.findUnique({ where: { id: tenantId }, select: { schemaName: true } });
  if (!tenant) return { error: "El taller no existe.", success: false };
  const db = getTenantDb(tenant.schemaName);
  const config = await db.configuracionFacturaElectronica.findUnique({ where: { id: "singleton" } });
  if (config?.cuenta === "PROPIA") return { error: "Este taller usa su propia cuenta del proveedor.", success: false };
  const tokenCifrado = cifrarSecreto(token);
  await db.configuracionFacturaElectronica.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", cuenta: "BOLSA", tokenCifrado },
    update: { tokenCifrado },
  });
  revalidatePath("/superadmin/facturacion-electronica");
  return { error: null, success: true };
}
```

- [ ] **Step 3: Formulario y página (TDD del formulario)** — `token-bolsa-form.test.tsx`: renderiza con `tokenRegistrado={true}` y verifica el texto "Ya hay un token registrado; escribe uno nuevo para cambiarlo." y un campo `type="password"` vacío con etiqueta "Token de la bolsa"; con `false`, el texto "Sin token: este taller solo puede usar Simulado."

`token-bolsa-form.tsx` ("use client"): `useActionState(registrarTokenBolsaAction.bind(null, tenantId), { error: null, success: false })`, campo password `name="token"` con `Label` "Token de la bolsa", botón "Guardar token", mensaje de error o "Token guardado.".

`page.tsx` (servidor): lee `searchParams.mes` (validado `^\d{4}-\d{2}$`; por defecto el mes actual de Colombia con `fechaHoraBogota(new Date()).fecha.slice(0, 7)`), llama `listFacturacionElectronicaTalleres(mes)` y muestra una tabla con: taller (nombre o slug), estado ("Sin migrar", "Sin configurar", o "Activa"/"Inactiva" + ambiente), cuenta ("Bolsa"/"Propia"), token ("Registrado"/"Falta"), "Aceptados en el mes" (número), y para cuentas `BOLSA` el `TokenBolsaForm`. Encabezado con enlaces "← mes anterior" / "mes siguiente →" (`?mes=`) y una nota: "El cobro exacto se toma de los informes de consumo de Nextpyme; este número es de referencia." Sigue el estilo de `src/app/superadmin/page.tsx` (tarjetas y `DataTable` si esa página lo usa). El `layout.tsx` de `/superadmin` ya protege la sesión; aun así las acciones llaman `requireSuperAdmin`.

En `src/app/superadmin/page.tsx`, junto al enlace "Auditoría", agrega `<Link href="/superadmin/facturacion-electronica" className={buttonVariants({ variant: "outline" })}>Facturación electrónica</Link>`.

- [ ] **Step 4: Verificar y commit**

`npx tsc --noEmit`; `npx vitest run --project unit src/app/actions/super-admin-fe-actions.test.ts src/app/superadmin`; eslint; y, por ser la última tarea, una pasada completa `npx vitest run --project unit` (reporta totales).

```bash
git add src/app/actions/super-admin-fe-actions.ts src/app/actions/super-admin-fe-actions.test.ts src/app/superadmin/facturacion-electronica src/app/superadmin/page.tsx
git commit -m "fase-fe-task 24: super-admin registra el token de la bolsa y ve los documentos por taller"
git push origin fase-fe-factura-electronica
```

---

## Fuera de este plan

- Endpoint de "copia de la respuesta" de Nextpyme como camino principal para recuperar el CUFE (spec §12.1): cuando Nextpyme diga cuál es.
- Ajuste de `interpretarAmbiente` al ambiente por tipo de documento (spec §12.3) y la tarea 8 de la spec (sandbox real): cuando llegue el token.
- Notas crédito parciales, notas débito, devolución automática de pagos, volver a facturar una orden anulada.
- Aplicar la migración a `taller_dev_reference` y producción (con permiso del usuario, antes del despliegue).

## Autorrevisión

- **Cobertura:** §5.3 nota crédito total (Tasks 21–22); §12.2 fecha de reenvío (19); decisión "empezar de cero" (20); copia al cliente (23); §6 super-admin y §12.4 cobro con informes de Nextpyme (24); permiso "Anular con nota crédito" (22).
- **Sin migraciones:** todo usa columnas existentes; el `TipoEventoAuditoriaPlataforma` no cambia.
- **Placeholders:** las pruebas db de las Tasks 19 y 21 se describen por caso porque deben reutilizar los helpers reales de `servicio-db.test.ts`; el resto trae código.
- **Tipos entre tareas:** `conFechaDeReenvio` (19) ↔ servicio (19, 21); `consecutivoInicial` con `tipo` (20); `emitirNotaCredito`/`DatosNotaCredito` (21) ↔ acción (22); `FacturaFeVista.notaCredito` (22) ↔ sección (22) ↔ botón de copia (23); `leerDocumentoElectronico` y `MensajeEmail.adjuntos` (23); `FilaFeTaller`/`rangoMesBogota` (24).
