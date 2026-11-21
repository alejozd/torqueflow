# Factura electrónica — Plan 2a: ajustes al núcleo, migración y servicio

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conectar el núcleo de facturación electrónica con TorqueFlow sin pantallas: completar el contrato del proveedor (ambiente real, búsqueda en el histórico DIAN, simulación "caída pero recibido", precios con IVA incluido), crear la migración del taller (configuración, datos del cliente, documentos electrónicos) y el servicio que crea, numera, envía y reintenta la factura electrónica, enganchado a `crearFacturaAction`.

**Architecture:** El núcleo (`src/modulos/factura-electronica/`) sigue sin importar nada de la app; aquí solo crece su contrato y gana una función pura de conversión de precios con IVA incluido. El lado TorqueFlow vive en `src/lib/factura-electronica/` (configuración, mapeo, archivos, hora de Bogotá y servicio) y usa Prisma del taller. El consecutivo se asigna con un `UPDATE … RETURNING` atómico dentro de una transacción que también bloquea la factura (`FOR UPDATE`), así no hay huecos ni dos documentos para la misma factura. La llamada al proveedor ocurre fuera de la transacción de la factura: un fallo nunca deshace la factura.

**Tech Stack:** TypeScript estricto, Prisma 6.19 (cliente del taller en `src/generated/prisma-tenant`), Vitest 4 (proyectos `unit` y `db`), Next 16.4.5 (solo se edita un route handler existente, sin API nueva).

**Spec:** `docs/superpowers/specs/2026-11-20-factura-electronica-design.md` (§11 manda sobre lo anterior). Plan anterior: `docs/superpowers/plans/2026-11-20-factura-electronica-nucleo.md`. Pendientes: `docs/superpowers/plans/2026-11-20-factura-electronica-nucleo-pendientes.md`.

## Global Constraints

- Rama: `fase-fe-factura-electronica`. Commit y push al terminar **cada** tarea con el mensaje `fase-fe-task N: descripción breve` y la línea final `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Frontera del núcleo intacta: nada dentro de `src/modulos/factura-electronica/` importa `@/…`, `next`, `react`, `@prisma/*` ni carpetas de la app. El lado TorqueFlow importa el núcleo **solo** desde `@/modulos/factura-electronica` (su `index.ts`).
- Montos del núcleo: centavos enteros. En TorqueFlow los `Decimal(10,2)` son pesos con centavos: a centavos con `Math.round(Number(v) * 100)`; de vuelta con `montoExacto(c / 100)`.
- **Precios con IVA incluido** (así guarda TorqueFlow todo, spec 2026-11-08): `precioUnitario` de `ItemOrden` y `valor` de `ManoDeObra` ya traen el IVA.
- Fechas `@db.Date` (vigencia de la resolución) = medianoche UTC: leer con `toISOString().slice(0, 10)`, **no** con `formatoDiaBogota`.
- Fecha y hora del documento: hora de Colombia, se congelan en el `payload` al crearlo y **nunca** se regeneran en un reintento (spec §11.7).
- **Migración:** esta fase solo crea el SQL y lo prueba en tenants desechables del proyecto `db`. **Aplicarla a `taller_dev` o a producción requiere permiso explícito del usuario y NO es parte de este plan.**
- Pruebas `db`: lentas (10-20 s por tenant contra el servidor remoto por Tailscale). Solo se corren en la tarea que las crea. Si la base no responde (100.87.12.1:5432), iniciar Tailscale; si sigue sin responder, parar y reportar (RULES.md §2).
- Antes de `npx prisma generate` detener `npm run dev` si está corriendo (en Windows bloquea el motor de Prisma).
- No se agregan permisos, pantallas, nota crédito en la app ni super-admin (Plan 2b).
- Verificación por tarea (RULES.md §4): `npx tsc --noEmit`, vitest `unit` de los archivos tocados, `npx eslint` de los archivos tocados.
- RULES.md §1: si un comando falla, máximo un intento de corrección; si vuelve a fallar, parar y reportar.
- No se toca el backlog de fases anteriores (RULES.md §7); los "minor (deferred)" del Plan 1 que no están en este plan siguen pendientes.

## Mapa de archivos

```
src/modulos/factura-electronica/                (núcleo, modificar)
  proveedor.ts                     contrato: ambiente en probarConexion, buscarEmitido, fechaValidacion nullable
  iva-incluido.ts                  (crear) precios con IVA incluido → Linea[] y reparto del descuento
  iva-incluido.test.ts             (crear)
  fabrica.ts / fabrica.test.ts     memoria compartida del simulado
  index.ts                         nuevas exportaciones
  proveedores/simulado.ts          CAIDA_RECIBIDO, memoria, buscarEmitido, total
  proveedores/simulado.test.ts
  proveedores/nextpyme/interpretar.ts       interpretarAmbiente, interpretarEmitidos, fecha null
  proveedores/nextpyme/interpretar.test.ts
  proveedores/nextpyme/proveedor.ts         probarConexion con ambiente, buscarEmitido (get-uuids)
  proveedores/nextpyme/proveedor.test.ts
  proveedores/nextpyme/__fixtures__/emitidos.json   (crear)

prisma/tenant/schema.prisma                     (modificar) enums, ConfiguracionFacturaElectronica, Cliente, DocumentoElectronico
prisma/tenant/migrations/20261120130000_factura_electronica/migration.sql   (crear)
vitest.config.ts                                (modificar) dos pruebas db nuevas

src/lib/factura-electronica/                    (lado TorqueFlow, crear)
  hora-bogota.ts (+ .test.ts)      fecha YYYY-MM-DD y hora HH:mm:ss de Colombia
  configuracion.ts (+ .test.ts)    leer config, resolución, crear proveedor (token descifrado, memoria del simulado)
  mapear.ts (+ .test.ts)           Factura + orden + cliente → FacturaVenta del núcleo
  almacenamiento.ts (+ .test.ts)   descargar y guardar XML/PDF
  servicio.ts                      emitir, reintentar, emitirTrasFacturar
  servicio-db.test.ts              (db) flujos completos y consecutivo concurrente
  migracion-db.test.ts             (db) tablas, columnas y unicidad
  __pruebas__/fixtures-db.ts       factura mínima para pruebas db

src/lib/storage/local-file-storage.ts (+ .test.ts)   (modificar) saveDocumentoElectronico
src/app/api/uploads/[...path]/route.ts (+ .test.ts)  (modificar) servir PDF/XML como adjunto
src/app/actions/factura-actions.ts (+ .test.ts)      (modificar) emitirTrasFacturar tras crear la factura
```

---

### Task 4: Ajustes al núcleo (contrato, simulado, Nextpyme y precios con IVA incluido)

**Files:**
- Modify: `src/modulos/factura-electronica/proveedor.ts` (reemplazo completo)
- Modify: `src/modulos/factura-electronica/proveedores/simulado.ts` (reemplazo completo)
- Modify: `src/modulos/factura-electronica/fabrica.ts`
- Modify: `src/modulos/factura-electronica/proveedores/nextpyme/interpretar.ts`
- Modify: `src/modulos/factura-electronica/proveedores/nextpyme/proveedor.ts` (reemplazo completo)
- Modify: `src/modulos/factura-electronica/index.ts` (reemplazo completo)
- Create: `src/modulos/factura-electronica/iva-incluido.ts`
- Create: `src/modulos/factura-electronica/proveedores/nextpyme/__fixtures__/emitidos.json`
- Test: `simulado.test.ts`, `interpretar.test.ts`, `nextpyme/proveedor.test.ts`, `fabrica.test.ts` (modificar); `iva-incluido.test.ts` (crear)

**Interfaces:**
- Consumes (Plan 1): `calcularTotales(lineas: Linea[]): Totales`, `traducirMensajesDian`, `traducirMensajeDian`, `Centavos`, `Linea`, `DocumentoElectronico`, `MensajeDian`.
- Produces (usados por las tareas 6–8):
  - `type AmbienteProveedor = "PRUEBAS" | "PRODUCCION"`
  - `type ResultadoConexion = { ok: true; ambiente: AmbienteProveedor | null } | { ok: false; mensaje: string }`
  - `type ResultadoEnvio` con `ACEPTADO.fechaValidacion: string | null`
  - `type ResultadoBusqueda = { estado: "ENCONTRADO"; cufe: string; total: Centavos } | { estado: "NO_ENCONTRADO" } | { estado: "ERROR_TEMPORAL"; mensaje: string } | { estado: "ERROR_CONFIGURACION"; mensaje: string }`
  - `ProveedorFacturaElectronica.buscarEmitido(ref: ReferenciaDocumento, fecha: string): Promise<ResultadoBusqueda>`
  - `type ResultadoSimulado = "ACEPTAR" | "RECHAZAR" | "CAIDA" | "CAIDA_RECIBIDO"`
  - `interface AceptadoSimulado { cufe: string; fechaValidacion: string; total: Centavos }`, `type MemoriaSimulado = Map<string, AceptadoSimulado>` (clave `"FACTURA:SETP990000001"`)
  - `crearProveedorSimulado(opciones?: { resultado?: ResultadoSimulado; memoria?: MemoriaSimulado })`
  - `ConfigProveedor.memoriaSimulado?: MemoriaSimulado`
  - `interpretarAmbiente(cuerpo: unknown): AmbienteProveedor | null`, `interpretarEmitidos(status: number, cuerpo: unknown, ref: ReferenciaDocumento): ResultadoBusqueda`
  - `interface LineaConIva { codigo: string; descripcion: string; cantidad: number; unidad: string; precioFinalUnitario: Centavos; tarifa: number | null }`
  - `interface ConversionIvaIncluido { lineas: Linea[]; totalEsperado: Centavos; totalElectronico: Centavos; diferencia: Centavos }`
  - `lineasDesdePreciosConIva(lineas: LineaConIva[], descuentoTotal: Centavos): ConversionIvaIncluido`

- [ ] **Step 1: Reemplazar `proveedor.ts` (contrato)**

```ts
// src/modulos/factura-electronica/proveedor.ts
import type { Centavos, DocumentoElectronico, MensajeDian } from "./modelo";

export interface ReferenciaDocumento {
  tipo: "FACTURA" | "NOTA_CREDITO";
  prefijo: string;
  numero: number;
  cufe?: string;
}

export type ResultadoEnvio =
  | {
      estado: "ACEPTADO";
      cufe: string;
      /** ISO con zona ("2026-07-23T16:25:28-05:00"); null si el proveedor no la informa. */
      fechaValidacion: string | null;
      advertencias: MensajeDian[];
    }
  /** Rechazo de la DIAN o validación del proveedor: corregir y reenviar con el mismo número. */
  | { estado: "RECHAZADO"; motivos: MensajeDian[] }
  /** Caída, tiempo agotado o error 5xx: puede que la DIAN sí lo haya recibido. */
  | { estado: "ERROR_TEMPORAL"; mensaje: string }
  /** Token inválido o sin permiso: seguro no llegó a la DIAN. */
  | { estado: "ERROR_CONFIGURACION"; mensaje: string };

export type ResultadoConsulta = ResultadoEnvio | { estado: "NO_ENCONTRADO" };

/** Ambiente en que el proveedor tiene registrada la empresa. */
export type AmbienteProveedor = "PRUEBAS" | "PRODUCCION";

/** ambiente null: el proveedor no lo informa (el simulado, o una respuesta sin el dato). */
export type ResultadoConexion = { ok: true; ambiente: AmbienteProveedor | null } | { ok: false; mensaje: string };

/** Búsqueda en el histórico de documentos emitidos ante la DIAN (para recuperar el CUFE). */
export type ResultadoBusqueda =
  | { estado: "ENCONTRADO"; cufe: string; total: Centavos }
  | { estado: "NO_ENCONTRADO" }
  | { estado: "ERROR_TEMPORAL"; mensaje: string }
  | { estado: "ERROR_CONFIGURACION"; mensaje: string };

export type FormatoArchivo = "PDF" | "XML";

export interface ProveedorFacturaElectronica {
  enviar(doc: DocumentoElectronico): Promise<ResultadoEnvio>;
  consultarEstado(ref: ReferenciaDocumento): Promise<ResultadoConsulta>;
  /** Busca prefijo + número entre los emitidos alrededor de `fecha` (YYYY-MM-DD, la del documento). */
  buscarEmitido(ref: ReferenciaDocumento, fecha: string): Promise<ResultadoBusqueda>;
  /** Lanza ErrorProveedor si el archivo no se puede descargar. */
  descargar(ref: ReferenciaDocumento, formato: FormatoArchivo): Promise<Uint8Array>;
  probarConexion(): Promise<ResultadoConexion>;
}

export class ErrorProveedor extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorProveedor";
  }
}
```

- [ ] **Step 2: Pruebas que fallan para el simulado** — en `src/modulos/factura-electronica/proveedores/simulado.test.ts`:

Reemplazar la línea de import

```ts
import { crearProveedorSimulado } from "./simulado";
```

por

```ts
import { crearProveedorSimulado, type MemoriaSimulado } from "./simulado";
```

Reemplazar

```ts
    expect(await crearProveedorSimulado().probarConexion()).toEqual({ ok: true });
```

por

```ts
    expect(await crearProveedorSimulado().probarConexion()).toEqual({ ok: true, ambiente: null });
```

Y agregar estas pruebas justo antes del `});` final del `describe("proveedor simulado", …)`:

```ts
  it("CAIDA_RECIBIDO: responde error temporal pero la DIAN sí lo tiene (consulta e histórico)", async () => {
    const p = crearProveedorSimulado({ resultado: "CAIDA_RECIBIDO" });
    expect((await p.enviar(factura)).estado).toBe("ERROR_TEMPORAL");
    expect((await p.consultarEstado(ref)).estado).toBe("ACEPTADO");
    expect(await p.buscarEmitido(ref, "2026-11-20")).toEqual({
      estado: "ENCONTRADO",
      cufe: expect.stringMatching(/^[0-9a-f]{96}$/),
      total: 5950000,
    });
  });

  it("buscarEmitido: NO_ENCONTRADO hasta que se envía; la memoria se puede compartir", async () => {
    const memoria: MemoriaSimulado = new Map();
    const a = crearProveedorSimulado({ memoria });
    const b = crearProveedorSimulado({ memoria });
    expect(await b.buscarEmitido(ref, "2026-11-20")).toEqual({ estado: "NO_ENCONTRADO" });
    await a.enviar(factura);
    expect((await b.buscarEmitido(ref, "2026-11-20")).estado).toBe("ENCONTRADO");
    // Regla 90: la otra instancia ve que ya estaba.
    expect((await b.enviar(factura)).estado).toBe("RECHAZADO");
  });

  it("CAIDA: el histórico tampoco responde", async () => {
    const r = await crearProveedorSimulado({ resultado: "CAIDA" }).buscarEmitido(ref, "2026-11-20");
    expect(r.estado).toBe("ERROR_TEMPORAL");
  });
```

- [ ] **Step 3: Correr y ver que falla**

Run: `npx vitest run --project unit src/modulos/factura-electronica/proveedores/simulado.test.ts`
Expected: FAIL — `buscarEmitido` no existe / `ambiente` no está en la respuesta.

- [ ] **Step 4: Reemplazar `proveedores/simulado.ts`**

```ts
// src/modulos/factura-electronica/proveedores/simulado.ts
import { calcularTotales } from "../calculo";
import { traducirMensajesDian } from "../mensajes-dian";
import type { Centavos, DocumentoElectronico } from "../modelo";
import type {
  FormatoArchivo,
  ProveedorFacturaElectronica,
  ReferenciaDocumento,
  ResultadoBusqueda,
  ResultadoConexion,
  ResultadoConsulta,
  ResultadoEnvio,
} from "../proveedor";

/**
 * ACEPTAR (por defecto), RECHAZAR (FAU14), CAIDA (no llega) y CAIDA_RECIBIDO
 * (la DIAN lo recibe pero la respuesta se pierde: queda registrado y se responde ERROR_TEMPORAL).
 */
export type ResultadoSimulado = "ACEPTAR" | "RECHAZAR" | "CAIDA" | "CAIDA_RECIBIDO";

export interface AceptadoSimulado {
  cufe: string;
  fechaValidacion: string;
  total: Centavos;
}

/** Lo que "la DIAN" ya recibió. Compartirla entre instancias simula un mismo servicio. */
export type MemoriaSimulado = Map<string, AceptadoSimulado>;

export interface OpcionesSimulado {
  resultado?: ResultadoSimulado;
  /** Por defecto, una memoria propia de la instancia. */
  memoria?: MemoriaSimulado;
}

const clave = (r: { tipo: string; prefijo: string; numero: number }) => `${r.tipo}:${r.prefijo}${r.numero}`;
const NO_RESPONDE = "Simulación: el servicio de la DIAN no respondió.";

async function cufeSimulado(texto: string): Promise<string> {
  const huella = await crypto.subtle.digest("SHA-384", new TextEncoder().encode(`simulado:${texto}`));
  return [...new Uint8Array(huella)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Proveedor falso para desarrollo y demostraciones: no habla con nadie. */
export function crearProveedorSimulado(opciones: OpcionesSimulado = {}): ProveedorFacturaElectronica {
  const resultado = opciones.resultado ?? "ACEPTAR";
  const aceptados: MemoriaSimulado = opciones.memoria ?? new Map();

  return {
    async enviar(doc: DocumentoElectronico): Promise<ResultadoEnvio> {
      if (resultado === "CAIDA") return { estado: "ERROR_TEMPORAL", mensaje: NO_RESPONDE };
      if (resultado === "RECHAZAR") {
        return {
          estado: "RECHAZADO",
          motivos: traducirMensajesDian(
            "Regla: FAU14, Rechazo: Valor a Pagar de Factura es distinto de la Suma de Valor Bruto más tributos - Valor del Descuento Total + Valor del Cargo Total",
          ),
        };
      }
      const k = clave(doc);
      if (aceptados.has(k)) {
        return { estado: "RECHAZADO", motivos: traducirMensajesDian("Regla: 90, Rechazo: Documento procesado anteriormente.") };
      }
      const aceptado: AceptadoSimulado = {
        cufe: await cufeSimulado(k),
        fechaValidacion: `${doc.fecha}T${doc.hora}-05:00`,
        total: calcularTotales(doc.lineas).totalAPagar,
      };
      aceptados.set(k, aceptado);
      if (resultado === "CAIDA_RECIBIDO") {
        return { estado: "ERROR_TEMPORAL", mensaje: "Simulación: la DIAN recibió el documento pero la respuesta no llegó." };
      }
      return { estado: "ACEPTADO", cufe: aceptado.cufe, fechaValidacion: aceptado.fechaValidacion, advertencias: [] };
    },

    async consultarEstado(ref: ReferenciaDocumento): Promise<ResultadoConsulta> {
      const a = aceptados.get(clave(ref));
      return a
        ? { estado: "ACEPTADO", cufe: a.cufe, fechaValidacion: a.fechaValidacion, advertencias: [] }
        : { estado: "NO_ENCONTRADO" };
    },

    async buscarEmitido(ref: ReferenciaDocumento): Promise<ResultadoBusqueda> {
      if (resultado === "CAIDA") return { estado: "ERROR_TEMPORAL", mensaje: NO_RESPONDE };
      const a = aceptados.get(clave(ref));
      return a ? { estado: "ENCONTRADO", cufe: a.cufe, total: a.total } : { estado: "NO_ENCONTRADO" };
    },

    async descargar(ref: ReferenciaDocumento, formato: FormatoArchivo) {
      const numero = `${ref.prefijo}${ref.numero}`;
      const texto =
        formato === "PDF"
          ? `%PDF-1.4\n% Documento simulado ${numero} - sin validez fiscal\n%%EOF\n`
          : `<?xml version="1.0" encoding="UTF-8"?>\n<DocumentoSimulado numero="${numero}" validezFiscal="no"/>\n`;
      return new TextEncoder().encode(texto);
    },

    async probarConexion(): Promise<ResultadoConexion> {
      return resultado === "CAIDA"
        ? { ok: false, mensaje: "Simulación: sin conexión con el proveedor." }
        : { ok: true, ambiente: null };
    },
  };
}
```

- [ ] **Step 5: Correr y ver que pasa**

Run: `npx vitest run --project unit src/modulos/factura-electronica/proveedores/simulado.test.ts`
Expected: PASS (9 pruebas).

- [ ] **Step 6: Fixture del histórico** — crear `src/modulos/factura-electronica/proveedores/nextpyme/__fixtures__/emitidos.json` (forma tomada del ejemplo de `GET /dian/documents/get-uuids` de la documentación; CUFE recortado):

```json
{
  "success": true,
  "total_records": 1,
  "truncated": false,
  "documents": [
    {
      "cufe": "a9b1c4e7d2f05b3a",
      "document_type": { "id": "01", "name": "Factura electrónica" },
      "prefix": "FE",
      "number": "585",
      "serie_and_number": "FE585",
      "sender": { "identification_number": "901000123", "name": "TALLER DE PRUEBA SAS" },
      "receiver": { "identification_number": "222222222222", "name": "CONSUMIDOR FINAL" },
      "emission_date": "2026-10-01T00:00:00.000Z",
      "total_amount": 600000
    }
  ]
}
```

- [ ] **Step 7: Pruebas que fallan para `interpretar`** — en `src/modulos/factura-electronica/proveedores/nextpyme/interpretar.test.ts`:

Reemplazar

```ts
import { interpretarRespuestaEnvio, interpretarRespuestaEstado } from "./interpretar";
```

por

```ts
import { interpretarAmbiente, interpretarEmitidos, interpretarRespuestaEnvio, interpretarRespuestaEstado } from "./interpretar";
import emitidos from "./__fixtures__/emitidos.json";
```

Reemplazar (en la prueba "aceptado: usa el CUFE consultado")

```ts
      fechaValidacion: "",
```

por

```ts
      fechaValidacion: null,
```

Agregar al final del archivo:

```ts
describe("interpretarRespuestaEnvio — aceptado sin fecha", () => {
  it("sin dian_validation_date_time la fecha queda en null", () => {
    const { dian_validation_date_time: _fecha, ...cuerpo } = aceptada;
    expect(interpretarRespuestaEnvio(200, cuerpo)).toMatchObject({ estado: "ACEPTADO", fechaValidacion: null });
  });
});

describe("interpretarAmbiente", () => {
  it("1 = producción, 2 = pruebas; sin dato, null", () => {
    expect(interpretarAmbiente({ success: true, data: { type_environment_id: 1 } })).toBe("PRODUCCION");
    expect(interpretarAmbiente({ success: true, data: { type_environment_id: 2 } })).toBe("PRUEBAS");
    expect(interpretarAmbiente({ success: true, data: {} })).toBeNull();
    expect(interpretarAmbiente(null)).toBeNull();
  });
});

describe("interpretarEmitidos", () => {
  const ref = { tipo: "FACTURA" as const, prefijo: "FE", numero: 585 };

  it("encuentra por prefijo y número y pasa el total a centavos", () => {
    expect(interpretarEmitidos(200, emitidos, ref)).toEqual({
      estado: "ENCONTRADO",
      cufe: emitidos.documents[0].cufe,
      total: 60000000,
    });
  });

  it("otro número u otro tipo de documento: NO_ENCONTRADO", () => {
    expect(interpretarEmitidos(200, emitidos, { ...ref, numero: 586 })).toEqual({ estado: "NO_ENCONTRADO" });
    expect(interpretarEmitidos(200, emitidos, { ...ref, tipo: "NOTA_CREDITO" })).toEqual({ estado: "NO_ENCONTRADO" });
  });

  it("401 es de configuración; 500 o cuerpo sin lista, temporal", () => {
    expect(interpretarEmitidos(401, {}, ref).estado).toBe("ERROR_CONFIGURACION");
    expect(interpretarEmitidos(500, {}, ref).estado).toBe("ERROR_TEMPORAL");
    expect(interpretarEmitidos(200, { success: true }, ref).estado).toBe("ERROR_TEMPORAL");
  });

  it("lista truncada sin el documento: ERROR_TEMPORAL (no se puede afirmar que no está)", () => {
    expect(interpretarEmitidos(200, { ...emitidos, truncated: true }, { ...ref, numero: 999 }).estado).toBe("ERROR_TEMPORAL");
  });
});
```

- [ ] **Step 8: Correr y ver que falla**

Run: `npx vitest run --project unit src/modulos/factura-electronica/proveedores/nextpyme/interpretar.test.ts`
Expected: FAIL — `interpretarAmbiente` / `interpretarEmitidos` no existen.

- [ ] **Step 9: Modificar `interpretar.ts`**

Reemplazar

```ts
import type { ResultadoConsulta, ResultadoEnvio } from "../../proveedor";
```

por

```ts
import type {
  AmbienteProveedor,
  ReferenciaDocumento,
  ResultadoBusqueda,
  ResultadoConsulta,
  ResultadoEnvio,
} from "../../proveedor";
```

Reemplazar

```ts
function fechaValidacion(cuerpo: Objeto): string {
  const f = cuerpo.dian_validation_date_time;
  if (!esObjeto(f) || typeof f.date !== "string") return "";
```

por

```ts
function fechaValidacion(cuerpo: Objeto): string | null {
  const f = cuerpo.dian_validation_date_time;
  if (!esObjeto(f) || typeof f.date !== "string") return null;
```

Reemplazar

```ts
  if (r.IsValid === "true") return { estado: "ACEPTADO", cufe, fechaValidacion: "", advertencias: mensajes };
```

por

```ts
  if (r.IsValid === "true") return { estado: "ACEPTADO", cufe, fechaValidacion: null, advertencias: mensajes };
```

Agregar al final del archivo:

```ts
/** GET /config/company → data.type_environment_id: 1 = producción, 2 = pruebas. */
export function interpretarAmbiente(cuerpo: unknown): AmbienteProveedor | null {
  if (!esObjeto(cuerpo) || !esObjeto(cuerpo.data)) return null;
  const id = Number(cuerpo.data.type_environment_id);
  if (id === 1) return "PRODUCCION";
  if (id === 2) return "PRUEBAS";
  return null;
}

/** Código DIAN del tipo de documento en el histórico. */
const TIPO_DOCUMENTO_DIAN = { FACTURA: "01", NOTA_CREDITO: "91" } as const;

/** GET /dian/documents/get-uuids → el documento con ese prefijo y número, con su CUFE y total. */
export function interpretarEmitidos(status: number, cuerpo: unknown, ref: ReferenciaDocumento): ResultadoBusqueda {
  if (status === 401 || status === 403) return { estado: "ERROR_CONFIGURACION", mensaje: MENSAJE_TOKEN };
  const documentos =
    esObjeto(cuerpo) && cuerpo.success !== false && Array.isArray(cuerpo.documents) ? (cuerpo.documents as unknown[]) : null;
  if (status < 200 || status >= 300 || !documentos) {
    return {
      estado: "ERROR_TEMPORAL",
      mensaje: `No se pudo consultar el histórico de la DIAN (código ${status || "sin respuesta"}).`,
    };
  }
  const buscado = `${ref.prefijo}${ref.numero}`;
  const encontrado = documentos.filter(esObjeto).find((d) => {
    const tipo = esObjeto(d.document_type) ? d.document_type.id : undefined;
    if (tipo !== undefined && String(tipo) !== TIPO_DOCUMENTO_DIAN[ref.tipo]) return false;
    const serie =
      typeof d.serie_and_number === "string" ? d.serie_and_number : `${String(d.prefix ?? "")}${String(d.number ?? "")}`;
    return serie === buscado;
  });
  if (!encontrado) {
    return esObjeto(cuerpo) && cuerpo.truncated === true
      ? { estado: "ERROR_TEMPORAL", mensaje: "El histórico de la DIAN llegó incompleto; intenta de nuevo más tarde." }
      : { estado: "NO_ENCONTRADO" };
  }
  const total = Number(encontrado.total_amount);
  if (typeof encontrado.cufe !== "string" || !encontrado.cufe || !Number.isFinite(total)) {
    return { estado: "ERROR_TEMPORAL", mensaje: "El histórico de la DIAN no trae el CUFE o el total del documento." };
  }
  return { estado: "ENCONTRADO", cufe: encontrado.cufe, total: Math.round(total * 100) };
}
```

- [ ] **Step 10: Correr y ver que pasa**

Run: `npx vitest run --project unit src/modulos/factura-electronica/proveedores/nextpyme/interpretar.test.ts`
Expected: PASS (14 pruebas).

- [ ] **Step 11: Pruebas que fallan para el proveedor Nextpyme** — en `src/modulos/factura-electronica/proveedores/nextpyme/proveedor.test.ts`:

Reemplazar

```ts
import aceptada from "./__fixtures__/factura-aceptada.json";
```

por

```ts
import aceptada from "./__fixtures__/factura-aceptada.json";
import emitidos from "./__fixtures__/emitidos.json";
```

Reemplazar

```ts
  it("probarConexion: GET /config/company; 401 explica el token", async () => {
    const ok = vi.fn(async () => respuesta(200, { success: true }));
    expect(await crear(ok as unknown as typeof fetch).probarConexion()).toEqual({ ok: true });
```

por

```ts
  it("probarConexion: GET /config/company con el ambiente real; 401 explica el token", async () => {
    const ok = vi.fn(async () => respuesta(200, { success: true, data: { identification_number: "901000123", type_environment_id: 2 } }));
    expect(await crear(ok as unknown as typeof fetch).probarConexion()).toEqual({ ok: true, ambiente: "PRUEBAS" });
```

Agregar justo antes del `});` final del `describe("crearProveedorNextpyme", …)`:

```ts
  it("buscarEmitido: GET get-uuids con un día antes y uno después de la fecha", async () => {
    const f = vi.fn(async () => respuesta(200, emitidos));
    const r = await crear(f as unknown as typeof fetch).buscarEmitido({ tipo: "FACTURA", prefijo: "FE", numero: 585 }, "2026-10-01");
    expect(r).toEqual({ estado: "ENCONTRADO", cufe: emitidos.documents[0].cufe, total: 60000000 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://api.nextpyme.plus/api/ubl2.1/dian/documents/get-uuids?type_filter=1&start_date=2026-09-30&end_date=2026-10-02",
    );
    expect(init.method).toBe("GET");
  });
```

- [ ] **Step 12: Correr y ver que falla**

Run: `npx vitest run --project unit src/modulos/factura-electronica/proveedores/nextpyme/proveedor.test.ts`
Expected: FAIL — `buscarEmitido` no es una función; `ambiente` ausente.

- [ ] **Step 13: Reemplazar `proveedores/nextpyme/proveedor.ts`**

```ts
// src/modulos/factura-electronica/proveedores/nextpyme/proveedor.ts
import { traducirMensajeDian } from "../../mensajes-dian";
import type { DocumentoElectronico } from "../../modelo";
import { ErrorProveedor, type FormatoArchivo, type ProveedorFacturaElectronica, type ReferenciaDocumento } from "../../proveedor";
import { interpretarAmbiente, interpretarEmitidos, interpretarRespuestaEnvio, interpretarRespuestaEstado } from "./interpretar";
import { mapearDocumentoNextpyme } from "./mapear";

export interface OpcionesNextpyme {
  token: string;
  /** NIT del emisor sin DV (se usa en las rutas de descarga). */
  nitEmisor: string;
  baseUrl?: string;
  /** Tiempo máximo por llamada. Por defecto 20 s. */
  timeoutMs?: number;
  /** Para pruebas. Por defecto, el fetch global. */
  fetch?: typeof fetch;
}

const BASE = "https://api.nextpyme.plus/api/ubl2.1";
const PREFIJO_ARCHIVO = { FACTURA: "FES-", NOTA_CREDITO: "NCS-" } as const;
/** Por confirmar en el sandbox: la ficha del endpoint dice 1 = emitidos; el SDK dice 2. */
const TIPO_FILTRO_EMITIDOS = 1;

/** "2026-10-01" + (-1) → "2026-09-30" (fechas de calendario, sin zona). */
function sumarDias(fecha: string, dias: number): string {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Adaptador de Nextpyme Plus. El ambiente (pruebas o producción) se configura del lado de
 * Nextpyme para cada empresa; la URL es la misma.
 */
export function crearProveedorNextpyme(op: OpcionesNextpyme): ProveedorFacturaElectronica {
  const base = op.baseUrl ?? BASE;
  const hacerFetch = op.fetch ?? fetch;
  const timeoutMs = op.timeoutMs ?? 20_000;
  const encabezados = {
    Authorization: `Bearer ${op.token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  async function llamarJson(metodo: "GET" | "POST", ruta: string, cuerpo?: unknown): Promise<{ status: number; json: unknown }> {
    try {
      const res = await hacerFetch(`${base}${ruta}`, {
        method: metodo,
        headers: encabezados,
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const texto = await res.text();
      let json: unknown = null;
      try {
        json = texto ? JSON.parse(texto) : null;
      } catch {
        json = null;
      }
      return { status: res.status, json };
    } catch {
      return { status: 0, json: null };
    }
  }

  return {
    async enviar(doc: DocumentoElectronico) {
      let cuerpo: Record<string, unknown>;
      try {
        cuerpo = mapearDocumentoNextpyme(doc);
      } catch (e) {
        return { estado: "RECHAZADO", motivos: [traducirMensajeDian(e instanceof Error ? e.message : String(e))] };
      }
      const ruta = doc.tipo === "FACTURA" ? "/invoice" : "/credit-note";
      const { status, json } = await llamarJson("POST", ruta, cuerpo);
      return interpretarRespuestaEnvio(status, json);
    },

    async consultarEstado(ref: ReferenciaDocumento) {
      if (!ref.cufe) return { estado: "NO_ENCONTRADO" };
      const { status, json } = await llamarJson("POST", `/status/document/${encodeURIComponent(ref.cufe)}`, {});
      return interpretarRespuestaEstado(status, json, ref.cufe);
    },

    async buscarEmitido(ref: ReferenciaDocumento, fecha: string) {
      const consulta = new URLSearchParams({
        type_filter: String(TIPO_FILTRO_EMITIDOS),
        start_date: sumarDias(fecha, -1),
        end_date: sumarDias(fecha, 1),
      });
      const { status, json } = await llamarJson("GET", `/dian/documents/get-uuids?${consulta.toString()}`);
      return interpretarEmitidos(status, json, ref);
    },

    async descargar(ref: ReferenciaDocumento, formato: FormatoArchivo) {
      const archivo = `${PREFIJO_ARCHIVO[ref.tipo]}${ref.prefijo}${ref.numero}.${formato === "PDF" ? "pdf" : "xml"}`;
      let res: Response;
      try {
        res = await hacerFetch(`${base}/download/${encodeURIComponent(op.nitEmisor)}/${archivo}`, {
          method: "GET",
          headers: { Authorization: encabezados.Authorization },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new ErrorProveedor(`No se pudo descargar ${archivo}: el proveedor no respondió.`);
      }
      if (!res.ok) throw new ErrorProveedor(`No se pudo descargar ${archivo} (código ${res.status}).`);
      return new Uint8Array(await res.arrayBuffer());
    },

    async probarConexion() {
      const { status, json } = await llamarJson("GET", "/config/company");
      if (status >= 200 && status < 300) return { ok: true, ambiente: interpretarAmbiente(json) };
      if (status === 401 || status === 403) {
        return { ok: false, mensaje: "La conexión con el proveedor no es válida. Revisa el token en Configuración del taller." };
      }
      return { ok: false, mensaje: `El proveedor no respondió correctamente (código ${status || "sin respuesta"}).` };
    },
  };
}
```

- [ ] **Step 14: Correr y ver que pasa**

Run: `npx vitest run --project unit src/modulos/factura-electronica/proveedores/nextpyme/proveedor.test.ts`
Expected: PASS (10 pruebas).

- [ ] **Step 15: Fábrica con memoria compartida** — en `src/modulos/factura-electronica/fabrica.test.ts`, reemplazar

```ts
import { crearProveedor } from "./fabrica";
```

por

```ts
import { crearProveedor } from "./fabrica";
import type { MemoriaSimulado } from "./proveedores/simulado";
```

y agregar antes del `});` final:

```ts
  it("SIMULADO usa la memoria que se le pase", async () => {
    const memoria: MemoriaSimulado = new Map([
      ["FACTURA:SETP1", { cufe: "x", fechaValidacion: "2026-11-20T10:00:00-05:00", total: 100 }],
    ]);
    const p = crearProveedor({ ambiente: "SIMULADO", memoriaSimulado: memoria });
    expect(await p.buscarEmitido({ tipo: "FACTURA", prefijo: "SETP", numero: 1 }, "2026-11-20")).toEqual({
      estado: "ENCONTRADO",
      cufe: "x",
      total: 100,
    });
  });
```

En `src/modulos/factura-electronica/fabrica.ts`, reemplazar

```ts
import { crearProveedorSimulado, type ResultadoSimulado } from "./proveedores/simulado";
```

por

```ts
import { crearProveedorSimulado, type MemoriaSimulado, type ResultadoSimulado } from "./proveedores/simulado";
```

reemplazar

```ts
  /** Solo para SIMULADO. */
  resultadoSimulado?: ResultadoSimulado;
```

por

```ts
  /** Solo para SIMULADO. */
  resultadoSimulado?: ResultadoSimulado;
  /** Solo para SIMULADO: lo ya "recibido" por la DIAN simulada, para compartirlo entre instancias. */
  memoriaSimulado?: MemoriaSimulado;
```

y reemplazar

```ts
    return crearProveedorSimulado({ resultado: config.resultadoSimulado });
```

por

```ts
    return crearProveedorSimulado({ resultado: config.resultadoSimulado, memoria: config.memoriaSimulado });
```

Run: `npx vitest run --project unit src/modulos/factura-electronica/fabrica.test.ts`
Expected: PASS (4 pruebas).

- [ ] **Step 16: Prueba que falla para `iva-incluido`** — crear `src/modulos/factura-electronica/iva-incluido.test.ts`:

```ts
// src/modulos/factura-electronica/iva-incluido.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { calcularTotales } from "./calculo";
import { lineasDesdePreciosConIva, type LineaConIva } from "./iva-incluido";

const linea = (p: Partial<LineaConIva>): LineaConIva => ({
  codigo: "X",
  descripcion: "Concepto",
  cantidad: 1,
  unidad: "94",
  precioFinalUnitario: 0,
  tarifa: 19,
  ...p,
});

describe("lineasDesdePreciosConIva", () => {
  it("una línea al 19 %: $119.000 con IVA → $100.000 sin IVA, exacto", () => {
    const r = lineasDesdePreciosConIva([linea({ precioFinalUnitario: 11900000 })], 0);
    expect(r.lineas).toEqual([
      { codigo: "X", descripcion: "Concepto", cantidad: 1, unidad: "94", precioUnitario: 10000000, descuento: 0, iva: { tarifa: 19 } },
    ]);
    expect(r).toMatchObject({ totalEsperado: 11900000, totalElectronico: 11900000, diferencia: 0 });
  });

  it("tarifas mezcladas 19 %, 5 % y exento", () => {
    const r = lineasDesdePreciosConIva(
      [
        linea({ codigo: "A", precioFinalUnitario: 11900000, tarifa: 19 }),
        linea({ codigo: "B", precioFinalUnitario: 1050000, tarifa: 5 }),
        linea({ codigo: "C", precioFinalUnitario: 2000000, tarifa: 0 }),
      ],
      0,
    );
    expect(r.lineas.map((l) => l.precioUnitario)).toEqual([10000000, 1000000, 2000000]);
    expect(r.diferencia).toBe(0);
    expect(calcularTotales(r.lineas).impuestos).toEqual([
      { tarifa: 19, base: 10000000, valor: 1900000 },
      { tarifa: 5, base: 1000000, valor: 50000 },
      { tarifa: 0, base: 2000000, valor: 0 },
    ]);
  });

  it("con cantidad mayor que uno el precio unitario sale sin IVA", () => {
    const r = lineasDesdePreciosConIva([linea({ precioFinalUnitario: 1190000, cantidad: 3 })], 0);
    expect(r.lineas[0]).toMatchObject({ cantidad: 3, precioUnitario: 1000000, descuento: 0 });
    expect(r.diferencia).toBe(0);
  });

  it("reparte el descuento en proporción y lo resta del precio (sin descuento de línea)", () => {
    const r = lineasDesdePreciosConIva([linea({ precioFinalUnitario: 11900000 }), linea({ precioFinalUnitario: 5950000 })], 1785000);
    expect(r.lineas.map((l) => [l.precioUnitario, l.descuento])).toEqual([
      [9000000, 0],
      [4500000, 0],
    ]);
    expect(r).toMatchObject({ totalEsperado: 16065000, totalElectronico: 16065000, diferencia: 0 });
  });

  it("si ningún precio da exacto usa el más cercano (el menor en empate) e informa la diferencia", () => {
    // b + round(b × 19 %) nunca da 1.190.003: 1.000.002 → 1.190.002 y 1.000.003 → 1.190.004.
    const r = lineasDesdePreciosConIva([linea({ precioFinalUnitario: 1190003 })], 0);
    expect(r.lineas[0].precioUnitario).toBe(1000002);
    expect(r).toMatchObject({ totalEsperado: 1190003, totalElectronico: 1190002, diferencia: -1 });
  });

  it("el resto del descuento se reparte centavo a centavo sin dejar líneas negativas; excluido sin IVA", () => {
    const r = lineasDesdePreciosConIva(
      [
        linea({ precioFinalUnitario: 300, tarifa: null }),
        linea({ precioFinalUnitario: 300, tarifa: null }),
        linea({ precioFinalUnitario: 300, tarifa: null }),
        linea({ precioFinalUnitario: 100, tarifa: null }),
      ],
      5,
    );
    expect(r.lineas.map((l) => l.precioUnitario)).toEqual([299, 299, 298, 99]);
    expect(r.lineas.every((l) => l.iva === null)).toBe(true);
    expect(r).toMatchObject({ totalEsperado: 995, totalElectronico: 995, diferencia: 0 });
  });

  it("un descuento mayor que el valor de los conceptos lanza error", () => {
    expect(() => lineasDesdePreciosConIva([linea({ precioFinalUnitario: 1000 })], 1001)).toThrow(
      "El descuento no puede ser negativo ni mayor que el valor de los conceptos.",
    );
  });
});
```

- [ ] **Step 17: Correr y ver que falla**

Run: `npx vitest run --project unit src/modulos/factura-electronica/iva-incluido.test.ts`
Expected: FAIL — no se encuentra `./iva-incluido`.

- [ ] **Step 18: Implementar `iva-incluido.ts`**

```ts
// src/modulos/factura-electronica/iva-incluido.ts
import { calcularTotales } from "./calculo";
import type { Centavos, Linea } from "./modelo";

/** Concepto tal como lo guarda un programa con precios que ya incluyen el IVA. */
export interface LineaConIva {
  codigo: string;
  descripcion: string;
  /** Hasta 2 decimales. */
  cantidad: number;
  unidad: string;
  /** Precio unitario final (con IVA incluido), en centavos. */
  precioFinalUnitario: Centavos;
  /** null = excluido (sin IVA); 0 = exento. */
  tarifa: number | null;
}

export interface ConversionIvaIncluido {
  /** Líneas con precio SIN IVA y sin descuento de línea (el descuento ya va restado del precio). */
  lineas: Linea[];
  /** Suma de los precios finales menos el descuento: lo que dice la factura interna. */
  totalEsperado: Centavos;
  /** calcularTotales(lineas).totalAPagar: lo que dirá el documento electrónico. */
  totalElectronico: Centavos;
  /** totalElectronico − totalEsperado. Casi siempre 0; si no, la factura interna se ajusta. */
  diferencia: Centavos;
}

/** Igual que calcularLinea: precio × cantidad con la cantidad escalada a entero. */
const importe = (precio: Centavos, cantidad: number) => Math.round((precio * Math.round(cantidad * 100)) / 100);

/**
 * Reparte `total` en proporción a `pesos` por el método del mayor residuo: la suma es exacta
 * y ninguna parte queda negativa ni mayor que su peso. Los empates favorecen a las últimas líneas.
 */
function repartir(total: Centavos, pesos: Centavos[]): Centavos[] {
  const suma = pesos.reduce((a, b) => a + b, 0);
  if (total === 0 || suma === 0) return pesos.map(() => 0);
  const exactas = pesos.map((p) => (total * p) / suma);
  const partes = exactas.map((e) => Math.floor(e));
  let resto = total - partes.reduce((a, b) => a + b, 0);
  const orden = exactas
    .map((e, i) => ({ i, fraccion: e - Math.floor(e) }))
    .sort((a, b) => b.fraccion - a.fraccion || b.i - a.i);
  for (const { i } of orden) {
    if (resto <= 0) break;
    partes[i] += 1;
    resto -= 1;
  }
  return partes;
}

/**
 * Precio unitario sin IVA `p` tal que importe(p) + IVA(importe(p)) quede lo más cerca posible de
 * `total` (spec §11.3). Replica el redondeo de calcularLinea. En empate gana el menor.
 */
function precioSinIva(total: Centavos, cantidad: number, tarifa: number | null): Centavos {
  const q100 = Math.round(cantidad * 100);
  if (q100 <= 0) return 0;
  const valor = (p: number) => {
    const bruto = Math.round((p * q100) / 100);
    return bruto + (tarifa === null ? 0 : Math.round((bruto * tarifa) / 100));
  };
  const estimado = Math.round(total / ((q100 / 100) * (1 + (tarifa ?? 0) / 100)));
  let mejor = Math.max(0, estimado - 3);
  for (let p = mejor + 1; p <= estimado + 3; p++) {
    if (Math.abs(valor(p) - total) < Math.abs(valor(mejor) - total)) mejor = p;
  }
  return mejor;
}

/**
 * Convierte conceptos con IVA incluido y un descuento global en líneas del núcleo (spec §11.3–11.5):
 * el descuento se reparte en proporción al valor de cada concepto y se resta de su precio; luego se
 * busca el precio sin IVA que reproduce el valor final.
 */
export function lineasDesdePreciosConIva(lineas: LineaConIva[], descuentoTotal: Centavos): ConversionIvaIncluido {
  const importes = lineas.map((l) => importe(l.precioFinalUnitario, l.cantidad));
  const subtotal = importes.reduce((a, b) => a + b, 0);
  if (!Number.isInteger(descuentoTotal) || descuentoTotal < 0 || descuentoTotal > subtotal) {
    throw new Error("El descuento no puede ser negativo ni mayor que el valor de los conceptos.");
  }
  const descuentos = repartir(descuentoTotal, importes);
  const convertidas: Linea[] = lineas.map((l, i) => ({
    codigo: l.codigo,
    descripcion: l.descripcion,
    cantidad: l.cantidad,
    unidad: l.unidad,
    precioUnitario: precioSinIva(importes[i] - descuentos[i], l.cantidad, l.tarifa),
    descuento: 0,
    iva: l.tarifa === null ? null : { tarifa: l.tarifa },
  }));
  const totalEsperado = subtotal - descuentoTotal;
  const totalElectronico = calcularTotales(convertidas).totalAPagar;
  return { lineas: convertidas, totalEsperado, totalElectronico, diferencia: totalElectronico - totalEsperado };
}
```

- [ ] **Step 19: Correr y ver que pasa**

Run: `npx vitest run --project unit src/modulos/factura-electronica/iva-incluido.test.ts`
Expected: PASS (7 pruebas).

- [ ] **Step 20: Reemplazar `index.ts`**

```ts
import municipios from "./catalogos/municipios.json";
export * from "./modelo";
export { aTextoDecimal } from "./dinero";
export { calcularDvNit } from "./dv-nit";
export { calcularLinea, calcularTotales } from "./calculo";
export { lineasDesdePreciosConIva, type LineaConIva, type ConversionIvaIncluido } from "./iva-incluido";
export { validarDocumento, type ContextoValidacion } from "./validacion";
export { traducirMensajeDian, traducirMensajesDian, esDocumentoYaProcesado } from "./mensajes-dian";
export {
  ErrorProveedor,
  type ProveedorFacturaElectronica,
  type ReferenciaDocumento,
  type ResultadoEnvio,
  type ResultadoConsulta,
  type ResultadoConexion,
  type ResultadoBusqueda,
  type AmbienteProveedor,
  type FormatoArchivo,
} from "./proveedor";
export {
  crearProveedorSimulado,
  type ResultadoSimulado,
  type MemoriaSimulado,
  type AceptadoSimulado,
  type OpcionesSimulado,
} from "./proveedores/simulado";
export { crearProveedor, type Ambiente, type ConfigProveedor } from "./fabrica";
export { crearProveedorNextpyme, type OpcionesNextpyme } from "./proveedores/nextpyme/proveedor";
/** Municipios de Colombia (código DANE, nombre, departamento), para buscadores. */
export const MUNICIPIOS: { codigo: string; nombre: string; departamento: string }[] = municipios;
```

- [ ] **Step 21: Verificación de la tarea y de la frontera**

Run: `npx tsc --noEmit && npx vitest run --project unit src/modulos/factura-electronica && npx eslint src/modulos/factura-electronica`
Expected: sin errores; 80 pruebas en verde.

Run: `grep -rnE "from \"(@/|next|react|@prisma)" src/modulos/factura-electronica || echo "frontera limpia"`
Expected: `frontera limpia`

- [ ] **Step 22: Commit y push**

```bash
git add src/modulos/factura-electronica
git commit -m "fase-fe-task 4: núcleo con ambiente real, histórico DIAN, caída recibida y precios con IVA incluido

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 5: Migración del taller (configuración, cliente, documentos electrónicos)

> **Solo SQL + prueba en un tenant desechable del proyecto `db`.** Aplicar esta migración a `taller_dev` o a producción **requiere permiso explícito del usuario** y no se hace en este plan (ni con `prisma migrate deploy` ni con `npm run tenant:*`).

**Files:**
- Modify: `prisma/tenant/schema.prisma`
- Create: `prisma/tenant/migrations/20261120130000_factura_electronica/migration.sql`
- Create: `src/lib/factura-electronica/__pruebas__/fixtures-db.ts`
- Create: `src/lib/factura-electronica/migracion-db.test.ts`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: `provisionTenant({ slug, schemaName })` (`scripts/provision-tenant.ts`), `publicDb`, `getTenantDb`, `computeFacturaTotales` (`src/lib/factura/totales.ts`).
- Produces (usados por las tareas 6–8):
  - Modelos Prisma `ConfiguracionFacturaElectronica` (singleton `id = "singleton"`), `DocumentoElectronico` (`@@unique([tipo, prefijo, numero])`), campos nuevos de `Cliente` (`tipoDocumento`, `dv`, `tipoPersona`, `responsabilidadFiscal`, `municipioCodigo`, `direccion`), relaciones `Factura.documentosElectronicos` y `Usuario.documentosElectronicosCreados`.
  - Enums `EnvioFacturaElectronica`, `AmbienteFacturaElectronica`, `CuentaFacturaElectronica`, `ResultadoSimuladoFacturaElectronica` (con `CAIDA_RECIBIDO`), `TipoPersonaCliente`, `TipoDocumentoElectronico`, `EstadoDocumentoElectronico`.
  - `crearFacturaDePrueba(db: TenantPrismaClient, placa: string, opciones?: { valor?: number; descuento?: number }): Promise<{ facturaId: string; usuarioId: string; clienteId: string }>`

- [ ] **Step 1: Editar `prisma/tenant/schema.prisma`** (no correr `prisma format`: el archivo no está formateado y produciría un diff enorme)

En `model Usuario`, reemplazar

```prisma
  pagosProveedorRegistrados     PagoProveedor[]         @relation("PagoProveedorRegistradoPor")
```

por

```prisma
  pagosProveedorRegistrados     PagoProveedor[]         @relation("PagoProveedorRegistradoPor")
  documentosElectronicosCreados DocumentoElectronico[]  @relation("DocumentoElectronicoCreadoPor")
```

En `model Cliente`, reemplazar

```prisma
  fechaNacimiento     DateTime?                  @map("fecha_nacimiento") @db.Date
```

por

```prisma
  fechaNacimiento     DateTime?                  @map("fecha_nacimiento") @db.Date
  /// Datos para factura electrónica (opcionales). Tipo de documento con código DIAN ("13", "31"…).
  tipoDocumento         String?             @map("tipo_documento")
  /// Dígito de verificación (solo NIT).
  dv                    String?
  tipoPersona           TipoPersonaCliente? @map("tipo_persona")
  /// Código DIAN, p. ej. "R-99-PN".
  responsabilidadFiscal String?             @map("responsabilidad_fiscal")
  /// Código DANE de 5 dígitos.
  municipioCodigo       String?             @map("municipio_codigo")
  direccion             String?
```

En `model Factura`, reemplazar

```prisma
  pagos          Pago[]
```

por

```prisma
  pagos          Pago[]
  documentosElectronicos DocumentoElectronico[]
```

Agregar al **final** del archivo:

```prisma

// ── Facturación electrónica DIAN (fase-fe, Plan 2a) ─────────────────────────
// Spec: docs/superpowers/specs/2026-11-20-factura-electronica-design.md §4.

enum EnvioFacturaElectronica {
  AUTOMATICO
  MANUAL
}

enum AmbienteFacturaElectronica {
  SIMULADO
  PRUEBAS
  PRODUCCION
}

enum CuentaFacturaElectronica {
  BOLSA
  PROPIA
}

/// Solo se usa con ambiente SIMULADO. CAIDA_RECIBIDO: la DIAN lo recibe pero la respuesta se pierde.
enum ResultadoSimuladoFacturaElectronica {
  ACEPTAR
  RECHAZAR
  CAIDA
  CAIDA_RECIBIDO
}

enum TipoPersonaCliente {
  NATURAL
  JURIDICA
}

enum TipoDocumentoElectronico {
  FACTURA
  NOTA_CREDITO
}

enum EstadoDocumentoElectronico {
  PENDIENTE
  ENVIANDO
  POR_CONFIRMAR
  ACEPTADO
  RECHAZADO
  ANULADO
}

/// Configuración de facturación electrónica del taller (singleton, como ConfiguracionSmtp).
model ConfiguracionFacturaElectronica {
  id                              String                              @id @default("singleton")
  activa                          Boolean                             @default(false)
  envio                           EnvioFacturaElectronica             @default(AUTOMATICO)
  ambiente                        AmbienteFacturaElectronica          @default(SIMULADO)
  cuenta                          CuentaFacturaElectronica            @default(BOLSA)
  /// Token de Nextpyme cifrado con src/lib/crypto/secret-box.ts.
  tokenCifrado                    String?                             @map("token_cifrado")
  /// Emisor (el taller). NIT sin DV.
  nit                             String?
  dv                              String?
  razonSocial                     String?                             @map("razon_social")
  /// Código DIAN: 48 responsable de IVA, 49 no responsable.
  regimen                         String?
  /// Código DIAN, p. ej. "O-13" o "R-99-PN".
  responsabilidadFiscal           String?                             @map("responsabilidad_fiscal")
  /// Código DANE de 5 dígitos.
  municipioCodigo                 String?                             @map("municipio_codigo")
  direccion                       String?
  /// Resolución de numeración de facturas.
  resolucionNumero                String?                             @map("resolucion_numero")
  prefijo                         String?
  rangoDesde                      Int?                                @map("rango_desde")
  rangoHasta                      Int?                                @map("rango_hasta")
  /// Solo el día (medianoche UTC): leer con toISOString().slice(0, 10).
  vigenciaDesde                   DateTime?                           @map("vigencia_desde") @db.Date
  vigenciaHasta                   DateTime?                           @map("vigencia_hasta") @db.Date
  /// Próximo número a usar; si es menor que rangoDesde se arranca en rangoDesde.
  siguienteConsecutivo            Int                                 @default(1) @map("siguiente_consecutivo")
  prefijoNotaCredito              String?                             @map("prefijo_nota_credito")
  siguienteConsecutivoNotaCredito Int                                 @default(1) @map("siguiente_consecutivo_nota_credito")
  resultadoSimulado               ResultadoSimuladoFacturaElectronica @default(ACEPTAR) @map("resultado_simulado")
  /// Último "Probar conexión": resultado y ambiente que informó el proveedor.
  ultimaPruebaAt                  DateTime?                           @map("ultima_prueba_at")
  ultimaPruebaExitosa             Boolean?                            @map("ultima_prueba_exitosa")
  ultimaPruebaMensaje             String?                             @map("ultima_prueba_mensaje")
  ambienteProveedor               AmbienteFacturaElectronica?         @map("ambiente_proveedor")
  createdAt                       DateTime                            @default(now()) @map("created_at")
  updatedAt                       DateTime                            @updatedAt @map("updated_at")

  @@map("configuracion_factura_electronica")
}

/// Factura electrónica o nota crédito enviada (o por enviar) a la DIAN.
model DocumentoElectronico {
  id                    String                     @id @default(cuid())
  tipo                  TipoDocumentoElectronico
  facturaId             String                     @map("factura_id")
  factura               Factura                    @relation(fields: [facturaId], references: [id], onDelete: Restrict)
  /// Nota crédito → factura electrónica que corrige.
  documentoReferenciaId String?                    @map("documento_referencia_id")
  documentoReferencia   DocumentoElectronico?      @relation("NotaCreditoDeFactura", fields: [documentoReferenciaId], references: [id], onDelete: Restrict)
  notasCredito          DocumentoElectronico[]     @relation("NotaCreditoDeFactura")
  prefijo               String
  numero                Int
  estado                EstadoDocumentoElectronico @default(PENDIENTE)
  cufe                  String?
  fechaValidacion       DateTime?                  @map("fecha_validacion")
  /// MensajeDian[] ya traducidos (núcleo).
  mensajes              Json                       @default("[]")
  intentos              Int                        @default(0)
  ultimoIntentoAt       DateTime?                  @map("ultimo_intento_at")
  /// URL de /api/uploads/... (Nextpyme guarda los archivos solo un año).
  xmlRuta               String?                    @map("xml_ruta")
  pdfRuta               String?                    @map("pdf_ruta")
  /// Foto del DocumentoElectronico del núcleo tal como se envió (fecha y hora congeladas).
  payload               Json
  ambiente              AmbienteFacturaElectronica
  creadoPorId           String                     @map("creado_por_id")
  creadoPor             Usuario                    @relation("DocumentoElectronicoCreadoPor", fields: [creadoPorId], references: [id], onDelete: Restrict)
  createdAt             DateTime                   @default(now()) @map("created_at")
  updatedAt             DateTime                   @updatedAt @map("updated_at")

  @@unique([tipo, prefijo, numero])
  @@index([facturaId])
  @@index([estado])
  @@index([documentoReferenciaId])
  @@map("documentos_electronicos")
}
```

Run: `npx prisma validate --schema=prisma/tenant/schema.prisma`
Expected: `The schema at prisma\tenant\schema.prisma is valid 🚀`

- [ ] **Step 2: Escribir `migration.sql`** — crear `prisma/tenant/migrations/20261120130000_factura_electronica/migration.sql` (es exactamente lo que genera `prisma migrate diff` entre el esquema anterior y el nuevo, con comentarios en español):

```sql
-- Facturación electrónica DIAN (fase-fe, Plan 2a). Todo es aditivo: los talleres
-- que no la activan no notan nada. La tabla de facturas no cambia de columnas.

-- CreateEnum
CREATE TYPE "EnvioFacturaElectronica" AS ENUM ('AUTOMATICO', 'MANUAL');

-- CreateEnum
CREATE TYPE "AmbienteFacturaElectronica" AS ENUM ('SIMULADO', 'PRUEBAS', 'PRODUCCION');

-- CreateEnum
CREATE TYPE "CuentaFacturaElectronica" AS ENUM ('BOLSA', 'PROPIA');

-- CreateEnum
CREATE TYPE "ResultadoSimuladoFacturaElectronica" AS ENUM ('ACEPTAR', 'RECHAZAR', 'CAIDA', 'CAIDA_RECIBIDO');

-- CreateEnum
CREATE TYPE "TipoPersonaCliente" AS ENUM ('NATURAL', 'JURIDICA');

-- CreateEnum
CREATE TYPE "TipoDocumentoElectronico" AS ENUM ('FACTURA', 'NOTA_CREDITO');

-- CreateEnum
CREATE TYPE "EstadoDocumentoElectronico" AS ENUM ('PENDIENTE', 'ENVIANDO', 'POR_CONFIRMAR', 'ACEPTADO', 'RECHAZADO', 'ANULADO');

-- Datos del cliente para la factura electrónica: opcionales, los clientes existentes quedan en blanco.
-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "direccion" TEXT,
ADD COLUMN     "dv" TEXT,
ADD COLUMN     "municipio_codigo" TEXT,
ADD COLUMN     "responsabilidad_fiscal" TEXT,
ADD COLUMN     "tipo_documento" TEXT,
ADD COLUMN     "tipo_persona" "TipoPersonaCliente";

-- Configuración (una sola fila, id 'singleton'); nace inactiva y en ambiente simulado.
-- CreateTable
CREATE TABLE "configuracion_factura_electronica" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "activa" BOOLEAN NOT NULL DEFAULT false,
    "envio" "EnvioFacturaElectronica" NOT NULL DEFAULT 'AUTOMATICO',
    "ambiente" "AmbienteFacturaElectronica" NOT NULL DEFAULT 'SIMULADO',
    "cuenta" "CuentaFacturaElectronica" NOT NULL DEFAULT 'BOLSA',
    "token_cifrado" TEXT,
    "nit" TEXT,
    "dv" TEXT,
    "razon_social" TEXT,
    "regimen" TEXT,
    "responsabilidad_fiscal" TEXT,
    "municipio_codigo" TEXT,
    "direccion" TEXT,
    "resolucion_numero" TEXT,
    "prefijo" TEXT,
    "rango_desde" INTEGER,
    "rango_hasta" INTEGER,
    "vigencia_desde" DATE,
    "vigencia_hasta" DATE,
    "siguiente_consecutivo" INTEGER NOT NULL DEFAULT 1,
    "prefijo_nota_credito" TEXT,
    "siguiente_consecutivo_nota_credito" INTEGER NOT NULL DEFAULT 1,
    "resultado_simulado" "ResultadoSimuladoFacturaElectronica" NOT NULL DEFAULT 'ACEPTAR',
    "ultima_prueba_at" TIMESTAMP(3),
    "ultima_prueba_exitosa" BOOLEAN,
    "ultima_prueba_mensaje" TEXT,
    "ambiente_proveedor" "AmbienteFacturaElectronica",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracion_factura_electronica_pkey" PRIMARY KEY ("id")
);

-- Documentos enviados a la DIAN. Un número de la resolución no se repite por tipo y prefijo.
-- CreateTable
CREATE TABLE "documentos_electronicos" (
    "id" TEXT NOT NULL,
    "tipo" "TipoDocumentoElectronico" NOT NULL,
    "factura_id" TEXT NOT NULL,
    "documento_referencia_id" TEXT,
    "prefijo" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "estado" "EstadoDocumentoElectronico" NOT NULL DEFAULT 'PENDIENTE',
    "cufe" TEXT,
    "fecha_validacion" TIMESTAMP(3),
    "mensajes" JSONB NOT NULL DEFAULT '[]',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "ultimo_intento_at" TIMESTAMP(3),
    "xml_ruta" TEXT,
    "pdf_ruta" TEXT,
    "payload" JSONB NOT NULL,
    "ambiente" "AmbienteFacturaElectronica" NOT NULL,
    "creado_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documentos_electronicos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documentos_electronicos_factura_id_idx" ON "documentos_electronicos"("factura_id");

-- CreateIndex
CREATE INDEX "documentos_electronicos_estado_idx" ON "documentos_electronicos"("estado");

-- CreateIndex
CREATE INDEX "documentos_electronicos_documento_referencia_id_idx" ON "documentos_electronicos"("documento_referencia_id");

-- CreateIndex
CREATE UNIQUE INDEX "documentos_electronicos_tipo_prefijo_numero_key" ON "documentos_electronicos"("tipo", "prefijo", "numero");

-- AddForeignKey
ALTER TABLE "documentos_electronicos" ADD CONSTRAINT "documentos_electronicos_factura_id_fkey" FOREIGN KEY ("factura_id") REFERENCES "facturas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_electronicos" ADD CONSTRAINT "documentos_electronicos_documento_referencia_id_fkey" FOREIGN KEY ("documento_referencia_id") REFERENCES "documentos_electronicos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_electronicos" ADD CONSTRAINT "documentos_electronicos_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 3: Comprobar que el SQL coincide con el esquema (sin base de datos)**

Run: `git show HEAD:prisma/tenant/schema.prisma > "$TEMP/schema-antes.prisma" && npx prisma migrate diff --from-schema-datamodel "$TEMP/schema-antes.prisma" --to-schema-datamodel prisma/tenant/schema.prisma --script | grep -cE "^(CREATE|ALTER|ADD)"`
Expected: `22` (las mismas sentencias del Step 2: 7 enums, 1 ALTER + 5 ADD de clientes, 2 tablas, 4 índices, 3 llaves foráneas). Si difiere, copiar la salida de `--script` al `migration.sql` conservando los comentarios.

- [ ] **Step 4: Regenerar el cliente de Prisma del taller** (con `npm run dev` detenido)

Run: `npx prisma generate --schema=prisma/tenant/schema.prisma`
Expected: `✔ Generated Prisma Client (v6.19.3) to .\src\generated\prisma-tenant`

- [ ] **Step 5: Fixture de factura para pruebas `db`** — crear `src/lib/factura-electronica/__pruebas__/fixtures-db.ts`:

```ts
// src/lib/factura-electronica/__pruebas__/fixtures-db.ts
// Solo para pruebas del proyecto "db": arma la cadena mínima usuario → cliente → vehículo → orden → factura.
import type { TenantPrismaClient } from "@/lib/db/tenant-client";
import { computeFacturaTotales } from "@/lib/factura/totales";

export interface FacturaDePrueba {
  facturaId: string;
  usuarioId: string;
  clienteId: string;
}

/** Una línea de mano de obra de `valor` pesos (IVA 19 % incluido). La placa debe ser única. */
export async function crearFacturaDePrueba(
  db: TenantPrismaClient,
  placa: string,
  opciones: { valor?: number; descuento?: number } = {},
): Promise<FacturaDePrueba> {
  const valor = opciones.valor ?? 119000;
  const descuento = opciones.descuento ?? 0;
  const sede = await db.sede.findFirstOrThrow();
  const usuario = await db.usuario.upsert({
    where: { email: "fe-pruebas@torqueflow.test" },
    update: {},
    create: { email: "fe-pruebas@torqueflow.test", passwordHash: "sin-uso", nombre: "Pruebas FE", role: "ADMIN" },
  });
  const cliente = await db.cliente.create({ data: { nombre: `Cliente ${placa}` } });
  const vehiculo = await db.vehiculo.create({ data: { placa, marca: "Renault", modelo: "Logan", clienteId: cliente.id } });
  const orden = await db.ordenTrabajo.create({
    data: {
      estado: "TERMINADA",
      clienteId: cliente.id,
      vehiculoId: vehiculo.id,
      sedeId: sede.id,
      creadoPorId: usuario.id,
      manoDeObra: { create: [{ descripcion: "Cambio de aceite", valor, ivaPct: 19 }] },
    },
  });
  const t = computeFacturaTotales({ items: [], manoDeObra: [{ valor, ivaPct: 19 }], descuento });
  const factura = await db.factura.create({
    data: {
      ordenId: orden.id,
      clienteId: cliente.id,
      subtotal: t.subtotal,
      descuento,
      iva: t.iva,
      desgloseIva: t.desgloseIva.map((tramo) => ({ ...tramo })),
      total: t.total,
      saldoPendiente: t.total,
      emitidaPorId: usuario.id,
    },
  });
  return { facturaId: factura.id, usuarioId: usuario.id, clienteId: cliente.id };
}
```

- [ ] **Step 6: Prueba `db` de la migración** — crear `src/lib/factura-electronica/migracion-db.test.ts`:

```ts
// src/lib/factura-electronica/migracion-db.test.ts
// Prueba "db": aprovisiona un taller desechable (corre todas las migraciones). Nunca toca taller_dev.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { publicDb } from "@/lib/db/public-client";
import { getTenantDb } from "@/lib/db/tenant-client";
import { provisionTenant } from "../../../scripts/provision-tenant";
import { crearFacturaDePrueba } from "./__pruebas__/fixtures-db";

const SLUG = "test-fe-migracion";
const SCHEMA = "test_fe_migracion";

describe("migración de factura electrónica", () => {
  beforeAll(async () => {
    await provisionTenant({ slug: SLUG, schemaName: SCHEMA });
  });

  afterAll(async () => {
    await publicDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await publicDb.tenant.deleteMany({ where: { slug: SLUG } });
  });

  it("la configuración nace inactiva, simulada, con envío automático y acepta CAIDA_RECIBIDO", async () => {
    const db = getTenantDb(SCHEMA);
    const c = await db.configuracionFacturaElectronica.create({ data: {} });
    expect(c).toMatchObject({
      id: "singleton",
      activa: false,
      envio: "AUTOMATICO",
      ambiente: "SIMULADO",
      cuenta: "BOLSA",
      resultadoSimulado: "ACEPTAR",
      siguienteConsecutivo: 1,
      siguienteConsecutivoNotaCredito: 1,
      tokenCifrado: null,
      ambienteProveedor: null,
    });
    const v = await db.configuracionFacturaElectronica.update({
      where: { id: "singleton" },
      data: { resultadoSimulado: "CAIDA_RECIBIDO", vigenciaHasta: new Date("2027-06-30") },
    });
    expect(v.resultadoSimulado).toBe("CAIDA_RECIBIDO");
    expect(v.vigenciaHasta?.toISOString().slice(0, 10)).toBe("2027-06-30");
  });

  it("el cliente guarda los datos para factura electrónica; sin ellos quedan vacíos", async () => {
    const db = getTenantDb(SCHEMA);
    const empresa = await db.cliente.create({
      data: {
        nombre: "Transportes Andinos SAS",
        documento: "900123456",
        tipoDocumento: "31",
        dv: "8",
        tipoPersona: "JURIDICA",
        responsabilidadFiscal: "O-13",
        municipioCodigo: "05001",
        direccion: "Calle 10 # 20-30",
      },
    });
    expect(empresa).toMatchObject({ tipoDocumento: "31", dv: "8", tipoPersona: "JURIDICA", municipioCodigo: "05001" });
    const sinDatos = await db.cliente.create({ data: { nombre: "Cliente sin datos" } });
    expect(sinDatos).toMatchObject({
      tipoDocumento: null,
      dv: null,
      tipoPersona: null,
      responsabilidadFiscal: null,
      municipioCodigo: null,
      direccion: null,
    });
  });

  it("no deja repetir tipo + prefijo + número; otro tipo con el mismo número sí", async () => {
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
    await expect(
      db.documentoElectronico.create({ data: { ...datos, tipo: "NOTA_CREDITO", documentoReferenciaId: doc.id } }),
    ).resolves.toMatchObject({ documentoReferenciaId: doc.id });
  });
});
```

- [ ] **Step 7: Registrar la prueba en el proyecto `db`** — en `vitest.config.ts`, reemplazar

```ts
  "src/lib/tenant/tenant-user-email.test.ts",
```

por

```ts
  "src/lib/tenant/tenant-user-email.test.ts",
  "src/lib/factura-electronica/migracion-db.test.ts",
```

- [ ] **Step 8: Correr la prueba `db`** (tenant desechable; tarda 20-40 s)

Run: `npx vitest run --project db src/lib/factura-electronica/migracion-db.test.ts`
Expected: PASS (3 pruebas). La salida incluye el `prisma migrate deploy` del tenant `test_fe_migracion` con `20261120130000_factura_electronica` aplicada.

- [ ] **Step 9: Verificación de la tarea**

Run: `npx tsc --noEmit && npx eslint src/lib/factura-electronica vitest.config.ts`
Expected: sin errores.

Run: `npx vitest run --project unit src/lib/factura src/app/actions/factura-actions.test.ts`
Expected: PASS (las pruebas existentes de factura siguen en verde; el esquema solo agregó campos).

- [ ] **Step 10: Commit y push** (sin aplicar la migración a ninguna base real)

```bash
git add prisma/tenant/schema.prisma prisma/tenant/migrations/20261120130000_factura_electronica vitest.config.ts src/lib/factura-electronica
git commit -m "fase-fe-task 5: migración de factura electrónica (configuración, cliente, documentos) probada en tenant desechable

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 6: Lado TorqueFlow — hora de Bogotá, configuración y mapeo

**Files:**
- Create: `src/lib/factura-electronica/hora-bogota.ts`, `hora-bogota.test.ts`
- Create: `src/lib/factura-electronica/configuracion.ts`, `configuracion.test.ts`
- Create: `src/lib/factura-electronica/mapear.ts`, `mapear.test.ts`

**Interfaces:**
- Consumes: núcleo (`crearProveedor`, `crearProveedorSimulado`, `lineasDesdePreciosConIva`, `MemoriaSimulado`, `Resolucion`, `FacturaVenta`, `Adquirente`, `ErrorValidacion`, `UNIDADES`, `MEDIOS_PAGO`, `TIPOS_DOCUMENTO_IDENTIDAD`, `RESPONSABILIDADES_FISCALES`, `ConversionIvaIncluido`, `LineaConIva`); `descifrarSecreto`/`cifrarSecreto` (`src/lib/crypto/secret-box.ts`); tipo Prisma `ConfiguracionFacturaElectronica`.
- Produces (usados por las tareas 7–8):
  - `fechaHoraBogota(momento: Date): { fecha: string; hora: string }`
  - `type ConfiguracionFe = ConfiguracionFacturaElectronica`
  - `class ErrorConfiguracionFe extends Error`
  - `leerConfiguracionFe(db: Pick<Prisma.TransactionClient, "configuracionFacturaElectronica">): Promise<ConfiguracionFe | null>`
  - `diaIso(fecha: Date): string`
  - `resolucionDeConfig(c: ConfiguracionFe): Resolucion | null`
  - `crearProveedorDesdeConfig(c: ConfiguracionFe, tenantSchema: string): ProveedorFacturaElectronica` (lanza `ErrorConfiguracionFe`)
  - `type Numerico = number | { toString(): string }`
  - `interface ClienteParaMapear`, `interface FacturaParaMapear`, `interface DatosNumeracion { prefijo: string; numero: number; resolucionNumero: string; fecha: string; hora: string }`
  - `interface ResultadoMapeo { documento: FacturaVenta; conversion: ConversionIvaIncluido; errores: ErrorValidacion[]; diferencia: number }`
  - `adquirenteDesdeCliente(c: ClienteParaMapear): { adquirente: Adquirente; errores: ErrorValidacion[] }`
  - `mapearFactura(f: FacturaParaMapear, n: DatosNumeracion): ResultadoMapeo`

- [ ] **Step 1: Prueba que falla para la hora** — crear `src/lib/factura-electronica/hora-bogota.test.ts`:

```ts
// src/lib/factura-electronica/hora-bogota.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fechaHoraBogota } from "./hora-bogota";

describe("fechaHoraBogota", () => {
  it("resta las 5 horas de Colombia, también al cambiar de día", () => {
    expect(fechaHoraBogota(new Date("2026-11-21T03:30:05Z"))).toEqual({ fecha: "2026-11-20", hora: "22:30:05" });
  });

  it("la medianoche sale como 00:00:00 (no 24:00:00)", () => {
    expect(fechaHoraBogota(new Date("2026-11-20T05:00:00Z"))).toEqual({ fecha: "2026-11-20", hora: "00:00:00" });
  });
});
```

Run: `npx vitest run --project unit src/lib/factura-electronica/hora-bogota.test.ts`
Expected: FAIL — no se encuentra `./hora-bogota`.

- [ ] **Step 2: Implementar `hora-bogota.ts`**

```ts
// src/lib/factura-electronica/hora-bogota.ts
const FORMATO = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Fecha (YYYY-MM-DD) y hora (HH:mm:ss) de Colombia para el documento electrónico. */
export function fechaHoraBogota(momento: Date): { fecha: string; hora: string } {
  const p = Object.fromEntries(FORMATO.formatToParts(momento).map((parte) => [parte.type, parte.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}:${p.second}` };
}
```

Run: `npx vitest run --project unit src/lib/factura-electronica/hora-bogota.test.ts`
Expected: PASS (2 pruebas).

- [ ] **Step 3: Prueba que falla para la configuración** — crear `src/lib/factura-electronica/configuracion.test.ts`:

```ts
// src/lib/factura-electronica/configuracion.test.ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FacturaVenta } from "@/modulos/factura-electronica";
import { cifrarSecreto } from "@/lib/crypto/secret-box";
import { crearProveedorDesdeConfig, ErrorConfiguracionFe, resolucionDeConfig, type ConfiguracionFe } from "./configuracion";

const claveOriginal = process.env.SMTP_ENCRYPTION_KEY;
beforeEach(() => {
  process.env.SMTP_ENCRYPTION_KEY = "ab".repeat(32);
});
afterEach(() => {
  process.env.SMTP_ENCRYPTION_KEY = claveOriginal;
});

function config(p: Partial<ConfiguracionFe> = {}): ConfiguracionFe {
  return {
    id: "singleton",
    activa: true,
    envio: "AUTOMATICO",
    ambiente: "SIMULADO",
    cuenta: "BOLSA",
    tokenCifrado: null,
    nit: "901000123",
    dv: "6",
    razonSocial: "Taller de Prueba SAS",
    regimen: "48",
    responsabilidadFiscal: "R-99-PN",
    municipioCodigo: "05001",
    direccion: "Calle 1 # 2-3",
    resolucionNumero: "18760000001",
    prefijo: "SETP",
    rangoDesde: 990000000,
    rangoHasta: 995000000,
    vigenciaDesde: new Date("2026-01-01T00:00:00Z"),
    vigenciaHasta: new Date("2027-12-31T00:00:00Z"),
    siguienteConsecutivo: 1,
    prefijoNotaCredito: null,
    siguienteConsecutivoNotaCredito: 1,
    resultadoSimulado: "ACEPTAR",
    ultimaPruebaAt: null,
    ultimaPruebaExitosa: null,
    ultimaPruebaMensaje: null,
    ambienteProveedor: null,
    createdAt: new Date("2026-11-20T00:00:00Z"),
    updatedAt: new Date("2026-11-20T00:00:00Z"),
    ...p,
  };
}

const factura: FacturaVenta = {
  tipo: "FACTURA",
  prefijo: "SETP",
  numero: 990000001,
  resolucionNumero: "18760000001",
  fecha: "2026-11-20",
  hora: "10:00:00",
  adquirente: { tipo: "CONSUMIDOR_FINAL" },
  lineas: [{ codigo: "A", descripcion: "Aceite", cantidad: 1, unidad: "94", precioUnitario: 5000000, descuento: 0, iva: { tarifa: 19 } }],
  pago: { forma: "CONTADO", medio: "10", vencimiento: "2026-11-20" },
  enviarCorreo: false,
};
const ref = { tipo: "FACTURA" as const, prefijo: "SETP", numero: 990000001 };

describe("resolucionDeConfig", () => {
  it("arma la resolución con las fechas @db.Date como día", () => {
    expect(resolucionDeConfig(config())).toEqual({
      numero: "18760000001",
      prefijo: "SETP",
      desde: 990000000,
      hasta: 995000000,
      vigenciaDesde: "2026-01-01",
      vigenciaHasta: "2027-12-31",
    });
  });

  it("si falta cualquier dato no hay resolución", () => {
    expect(resolucionDeConfig(config({ rangoHasta: null }))).toBeNull();
    expect(resolucionDeConfig(config({ prefijo: null }))).toBeNull();
  });
});

describe("crearProveedorDesdeConfig", () => {
  it("SIMULADO comparte lo recibido entre peticiones del mismo taller, no entre talleres", async () => {
    await crearProveedorDesdeConfig(config(), "taller_config_a").enviar(factura);
    expect((await crearProveedorDesdeConfig(config(), "taller_config_a").buscarEmitido(ref, "2026-11-20")).estado).toBe("ENCONTRADO");
    expect((await crearProveedorDesdeConfig(config(), "taller_config_b").buscarEmitido(ref, "2026-11-20")).estado).toBe(
      "NO_ENCONTRADO",
    );
  });

  it("PRUEBAS sin token lanza un error de configuración; con token cifrado crea el proveedor", () => {
    expect(() => crearProveedorDesdeConfig(config({ ambiente: "PRUEBAS" }), "t")).toThrow(ErrorConfiguracionFe);
    expect(() => crearProveedorDesdeConfig(config({ ambiente: "PRUEBAS", tokenCifrado: "v1:roto" }), "t")).toThrow(
      ErrorConfiguracionFe,
    );
    const p = crearProveedorDesdeConfig(config({ ambiente: "PRUEBAS", tokenCifrado: cifrarSecreto("tok-123") }), "t");
    expect(typeof p.buscarEmitido).toBe("function");
  });
});
```

Run: `npx vitest run --project unit src/lib/factura-electronica/configuracion.test.ts`
Expected: FAIL — no se encuentra `./configuracion`.

- [ ] **Step 4: Implementar `configuracion.ts`**

```ts
// src/lib/factura-electronica/configuracion.ts
import {
  crearProveedor,
  type MemoriaSimulado,
  type ProveedorFacturaElectronica,
  type Resolucion,
} from "@/modulos/factura-electronica";
import type { ConfiguracionFacturaElectronica, Prisma } from "@/generated/prisma-tenant";
import { descifrarSecreto } from "@/lib/crypto/secret-box";

export type ConfiguracionFe = ConfiguracionFacturaElectronica;

/** Falta o no sirve algo de la configuración (token, NIT): seguro no se llamó al proveedor. */
export class ErrorConfiguracionFe extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorConfiguracionFe";
  }
}

export function leerConfiguracionFe(
  db: Pick<Prisma.TransactionClient, "configuracionFacturaElectronica">,
): Promise<ConfiguracionFe | null> {
  return db.configuracionFacturaElectronica.findUnique({ where: { id: "singleton" } });
}

/** Día guardado en @db.Date (medianoche UTC) → "YYYY-MM-DD". */
export function diaIso(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/** Resolución de numeración del núcleo; null si falta cualquier dato. */
export function resolucionDeConfig(c: ConfiguracionFe): Resolucion | null {
  if (!c.resolucionNumero || !c.prefijo || c.rangoDesde === null || c.rangoHasta === null || !c.vigenciaDesde || !c.vigenciaHasta) {
    return null;
  }
  return {
    numero: c.resolucionNumero,
    prefijo: c.prefijo,
    desde: c.rangoDesde,
    hasta: c.rangoHasta,
    vigenciaDesde: diaIso(c.vigenciaDesde),
    vigenciaHasta: diaIso(c.vigenciaHasta),
  };
}

/**
 * Lo que "la DIAN simulada" ya recibió, por taller, mientras viva el proceso: así un
 * CAIDA_RECIBIDO se puede recuperar en el reintento (otra petición, otra instancia).
 */
const memoriasSimulado = new Map<string, MemoriaSimulado>();

export function crearProveedorDesdeConfig(c: ConfiguracionFe, tenantSchema: string): ProveedorFacturaElectronica {
  if (c.ambiente === "SIMULADO") {
    let memoria = memoriasSimulado.get(tenantSchema);
    if (!memoria) {
      memoria = new Map();
      memoriasSimulado.set(tenantSchema, memoria);
    }
    return crearProveedor({ ambiente: "SIMULADO", resultadoSimulado: c.resultadoSimulado, memoriaSimulado: memoria });
  }
  if (!c.tokenCifrado) {
    throw new ErrorConfiguracionFe("Falta el token del proveedor de facturación electrónica. Regístralo en Configuración del taller.");
  }
  if (!c.nit) {
    throw new ErrorConfiguracionFe("Falta el NIT del taller en la configuración de facturación electrónica.");
  }
  let token: string;
  try {
    token = descifrarSecreto(c.tokenCifrado);
  } catch {
    throw new ErrorConfiguracionFe("No se pudo leer el token guardado. Vuelve a registrarlo en Configuración del taller.");
  }
  return crearProveedor({ ambiente: c.ambiente, nextpyme: { token, nitEmisor: c.nit } });
}
```

Run: `npx vitest run --project unit src/lib/factura-electronica/configuracion.test.ts`
Expected: PASS (4 pruebas).

- [ ] **Step 5: Prueba que falla para el mapeo** — crear `src/lib/factura-electronica/mapear.test.ts`:

```ts
// src/lib/factura-electronica/mapear.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { adquirenteDesdeCliente, mapearFactura, type ClienteParaMapear, type FacturaParaMapear } from "./mapear";

const sinDatos: ClienteParaMapear = {
  nombre: "Andrea Valencia Ríos",
  telefono: null,
  email: null,
  documento: null,
  tipoDocumento: null,
  dv: null,
  tipoPersona: null,
  responsabilidadFiscal: null,
  municipioCodigo: null,
  direccion: null,
};

const empresa: ClienteParaMapear = {
  nombre: "Transportes Andinos SAS",
  telefono: "3001234567",
  email: "compras@andinos.co",
  documento: "900.123.456",
  tipoDocumento: "31",
  dv: "8",
  tipoPersona: "JURIDICA",
  responsabilidadFiscal: "O-13",
  municipioCodigo: "05001",
  direccion: "Calle 10 # 20-30",
};

const numeracion = { prefijo: "SETP", numero: 990000001, resolucionNumero: "18760000001", fecha: "2026-11-20", hora: "10:00:00" };

function factura(p: Partial<FacturaParaMapear> = {}): FacturaParaMapear {
  return {
    total: "238000",
    descuento: "0",
    cliente: sinDatos,
    orden: {
      items: [{ id: "i1", descripcion: "Filtro de aceite", cantidad: 2, precioUnitario: "59500", ivaPct: "19" }],
      manoDeObra: [{ id: "m1", descripcion: "Cambio de aceite", valor: "119000", ivaPct: "19" }],
    },
    ...p,
  };
}

describe("mapearFactura", () => {
  it("convierte ítems y mano de obra con IVA incluido; la mano de obra va como servicio con cantidad 1", () => {
    const r = mapearFactura(factura(), numeracion);
    expect(r.documento).toEqual({
      tipo: "FACTURA",
      prefijo: "SETP",
      numero: 990000001,
      resolucionNumero: "18760000001",
      fecha: "2026-11-20",
      hora: "10:00:00",
      adquirente: { tipo: "CONSUMIDOR_FINAL" },
      lineas: [
        { codigo: "i1", descripcion: "Filtro de aceite", cantidad: 2, unidad: "94", precioUnitario: 5000000, descuento: 0, iva: { tarifa: 19 } },
        { codigo: "m1", descripcion: "Cambio de aceite", cantidad: 1, unidad: "ZZ", precioUnitario: 10000000, descuento: 0, iva: { tarifa: 19 } },
      ],
      pago: { forma: "CONTADO", medio: "10", vencimiento: "2026-11-20" },
      enviarCorreo: false,
    });
    expect(r.diferencia).toBe(0);
    expect(r.errores).toEqual([]);
  });

  it("reparte el descuento de la factura entre las líneas", () => {
    const r = mapearFactura(
      factura({
        total: "160650",
        descuento: "17850",
        orden: {
          items: [{ id: "i1", descripcion: "Batería", cantidad: 1, precioUnitario: "119000", ivaPct: "19" }],
          manoDeObra: [{ id: "m1", descripcion: "Instalación", valor: "59500", ivaPct: "19" }],
        },
      }),
      numeracion,
    );
    expect(r.documento.lineas.map((l) => l.precioUnitario)).toEqual([9000000, 4500000]);
    expect(r.diferencia).toBe(0);
  });

  it("informa la diferencia en centavos frente al total guardado en la factura", () => {
    const r = mapearFactura(
      factura({ total: "11900.03", orden: { items: [], manoDeObra: [{ id: "m1", descripcion: "Revisión", valor: "11900.03", ivaPct: "19" }] } }),
      numeracion,
    );
    expect(r.documento.lineas[0].precioUnitario).toBe(1000002);
    expect(r.diferencia).toBe(-1);
  });

  it("con cliente identificado pide enviar el correo", () => {
    expect(mapearFactura(factura({ cliente: empresa }), numeracion).documento.enviarCorreo).toBe(true);
  });
});

describe("adquirenteDesdeCliente", () => {
  it("cliente sin datos: consumidor final, sin errores", () => {
    expect(adquirenteDesdeCliente(sinDatos)).toEqual({ adquirente: { tipo: "CONSUMIDOR_FINAL" }, errores: [] });
  });

  it("persona jurídica completa: identificada, responsable de IVA", () => {
    expect(adquirenteDesdeCliente(empresa)).toEqual({
      adquirente: {
        tipo: "IDENTIFICADO",
        tipoDocumento: "31",
        numeroDocumento: "900.123.456",
        dv: "8",
        nombre: "Transportes Andinos SAS",
        tipoPersona: "JURIDICA",
        regimen: "48",
        responsabilidad: "O-13",
        municipioDane: "05001",
        direccion: "Calle 10 # 20-30",
        telefono: "3001234567",
        email: "compras@andinos.co",
      },
      errores: [],
    });
  });

  it("persona natural no responsable (R-99-PN): régimen 49; jurídica incompleta: dice qué falta", () => {
    const natural = { ...empresa, tipoDocumento: "13", dv: null, tipoPersona: "NATURAL" as const, responsabilidadFiscal: "R-99-PN" };
    const r = adquirenteDesdeCliente(natural);
    expect(r.adquirente).toMatchObject({ tipo: "IDENTIFICADO", regimen: "49", responsabilidad: "R-99-PN" });

    const incompleta = adquirenteDesdeCliente({ ...sinDatos, tipoPersona: "JURIDICA" });
    expect(incompleta.adquirente.tipo).toBe("IDENTIFICADO");
    expect(incompleta.errores.map((e) => e.campo)).toEqual(["cliente.tipoDocumento", "cliente.responsabilidadFiscal"]);
  });
});
```

Run: `npx vitest run --project unit src/lib/factura-electronica/mapear.test.ts`
Expected: FAIL — no se encuentra `./mapear`.

- [ ] **Step 6: Implementar `mapear.ts`**

```ts
// src/lib/factura-electronica/mapear.ts
import {
  lineasDesdePreciosConIva,
  MEDIOS_PAGO,
  RESPONSABILIDADES_FISCALES,
  TIPOS_DOCUMENTO_IDENTIDAD,
  UNIDADES,
  type Adquirente,
  type ConversionIvaIncluido,
  type ErrorValidacion,
  type FacturaVenta,
  type LineaConIva,
  type ResponsabilidadFiscal,
  type TipoDocumentoIdentidad,
} from "@/modulos/factura-electronica";

/** Decimal de Prisma, texto o número: todo pasa por Number(). */
export type Numerico = number | { toString(): string };

const centavos = (v: Numerico) => Math.round(Number(v) * 100);

export interface ClienteParaMapear {
  nombre: string;
  telefono: string | null;
  email: string | null;
  documento: string | null;
  tipoDocumento: string | null;
  dv: string | null;
  tipoPersona: "NATURAL" | "JURIDICA" | null;
  responsabilidadFiscal: string | null;
  municipioCodigo: string | null;
  direccion: string | null;
}

/** La Factura de TorqueFlow con su cliente y las líneas de su orden (precios con IVA incluido). */
export interface FacturaParaMapear {
  total: Numerico;
  descuento: Numerico;
  cliente: ClienteParaMapear;
  orden: {
    items: { id: string; descripcion: string; cantidad: number; precioUnitario: Numerico; ivaPct: Numerico }[];
    manoDeObra: { id: string; descripcion: string; valor: Numerico; ivaPct: Numerico }[];
  };
}

export interface DatosNumeracion {
  prefijo: string;
  numero: number;
  resolucionNumero: string;
  /** YYYY-MM-DD, hora de Colombia. */
  fecha: string;
  /** HH:mm:ss, hora de Colombia. */
  hora: string;
}

export interface ResultadoMapeo {
  documento: FacturaVenta;
  conversion: ConversionIvaIncluido;
  /** Datos del cliente que faltan (además de lo que diga validarDocumento). */
  errores: ErrorValidacion[];
  /** Total electrónico − total guardado en la Factura, en centavos. Si no es 0 se ajusta la factura. */
  diferencia: number;
}

const tiene = (objeto: object, clave: string) => Object.prototype.hasOwnProperty.call(objeto, clave);
const esTipoDocumento = (v: string): v is TipoDocumentoIdentidad => tiene(TIPOS_DOCUMENTO_IDENTIDAD, v);
const esResponsabilidad = (v: string): v is ResponsabilidadFiscal => tiene(RESPONSABILIDADES_FISCALES, v);

/**
 * Cliente → adquirente. Con todos los datos, identificado. Si faltan: persona natural (o sin
 * tipo de persona) → consumidor final (spec §4.2); persona jurídica → identificado con lo que
 * haya y la lista de lo que falta, para que no se gaste número.
 */
export function adquirenteDesdeCliente(c: ClienteParaMapear): { adquirente: Adquirente; errores: ErrorValidacion[] } {
  const tipoDocumento = c.tipoDocumento && esTipoDocumento(c.tipoDocumento) ? c.tipoDocumento : null;
  const responsabilidad = c.responsabilidadFiscal && esResponsabilidad(c.responsabilidadFiscal) ? c.responsabilidadFiscal : null;
  const documento = c.documento?.trim() ?? "";
  const municipio = c.municipioCodigo?.trim() ?? "";
  const direccion = c.direccion?.trim() ?? "";
  const completo = Boolean(tipoDocumento && documento && c.tipoPersona && responsabilidad && municipio && direccion);
  if (!completo && c.tipoPersona !== "JURIDICA") return { adquirente: { tipo: "CONSUMIDOR_FINAL" }, errores: [] };

  const errores: ErrorValidacion[] = [];
  if (!tipoDocumento) errores.push({ campo: "cliente.tipoDocumento", mensaje: "Falta el tipo de documento del cliente." });
  if (!responsabilidad) {
    errores.push({ campo: "cliente.responsabilidadFiscal", mensaje: "Falta la responsabilidad fiscal del cliente." });
  }
  const dv = c.dv?.trim();
  const telefono = c.telefono?.trim();
  const email = c.email?.trim();
  return {
    adquirente: {
      tipo: "IDENTIFICADO",
      tipoDocumento: tipoDocumento ?? "31",
      numeroDocumento: documento,
      ...(dv ? { dv } : {}),
      nombre: c.nombre,
      tipoPersona: c.tipoPersona ?? "NATURAL",
      regimen: responsabilidad === "R-99-PN" ? "49" : "48",
      responsabilidad: responsabilidad ?? "R-99-PN",
      municipioDane: municipio,
      direccion,
      ...(telefono ? { telefono } : {}),
      ...(email ? { email } : {}),
    },
    errores,
  };
}

/**
 * Factura de TorqueFlow → factura electrónica del núcleo. Repuestos con su cantidad y unidad
 * "94"; mano de obra con cantidad 1 y unidad "ZZ" (spec §11.5). Pago de contado en efectivo.
 */
export function mapearFactura(f: FacturaParaMapear, n: DatosNumeracion): ResultadoMapeo {
  const lineas: LineaConIva[] = [
    ...f.orden.items.map((i) => ({
      codigo: i.id,
      descripcion: i.descripcion,
      cantidad: i.cantidad,
      unidad: UNIDADES.UNIDAD,
      precioFinalUnitario: centavos(i.precioUnitario),
      tarifa: Number(i.ivaPct),
    })),
    ...f.orden.manoDeObra.map((m) => ({
      codigo: m.id,
      descripcion: m.descripcion,
      cantidad: 1,
      unidad: UNIDADES.SERVICIO,
      precioFinalUnitario: centavos(m.valor),
      tarifa: Number(m.ivaPct),
    })),
  ];
  const conversion = lineasDesdePreciosConIva(lineas, centavos(f.descuento));
  const { adquirente, errores } = adquirenteDesdeCliente(f.cliente);
  const documento: FacturaVenta = {
    tipo: "FACTURA",
    prefijo: n.prefijo,
    numero: n.numero,
    resolucionNumero: n.resolucionNumero,
    fecha: n.fecha,
    hora: n.hora,
    adquirente,
    lineas: conversion.lineas,
    pago: { forma: "CONTADO", medio: MEDIOS_PAGO.EFECTIVO, vencimiento: n.fecha },
    enviarCorreo: adquirente.tipo === "IDENTIFICADO" && Boolean(adquirente.email),
  };
  return { documento, conversion, errores, diferencia: conversion.totalElectronico - centavos(f.total) };
}
```

Run: `npx vitest run --project unit src/lib/factura-electronica/mapear.test.ts`
Expected: PASS (7 pruebas).

- [ ] **Step 7: Verificación de la tarea**

Run: `npx tsc --noEmit && npx vitest run --project unit src/lib/factura-electronica && npx eslint src/lib/factura-electronica`
Expected: sin errores; 13 pruebas en verde (la prueba `db` de la migración no corre en el proyecto `unit`).

- [ ] **Step 8: Commit y push**

```bash
git add src/lib/factura-electronica
git commit -m "fase-fe-task 6: configuración, hora de Bogotá y mapeo de la factura al documento electrónico

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 7: Archivos XML y PDF (storage, descarga y ruta)

**Files:**
- Modify: `src/lib/storage/local-file-storage.ts`, `src/lib/storage/local-file-storage.test.ts`
- Modify: `src/app/api/uploads/[...path]/route.ts`, `src/app/api/uploads/[...path]/route.test.ts`
- Create: `src/lib/factura-electronica/almacenamiento.ts`, `almacenamiento.test.ts`

**Interfaces:**
- Consumes: `getUploadsRoot()`, `SavedUpload { relativePath: string; url: string }`, `PREFIJO_URL` (privada de `local-file-storage.ts`); `ProveedorFacturaElectronica.descargar`, `ReferenciaDocumento`.
- Produces (usado por la tarea 8):
  - `saveDocumentoElectronico(tenantSchema: string, documentoId: string, nombre: string, bytes: Uint8Array): Promise<SavedUpload>` — escribe `<tenant>/facturas-electronicas/<documentoId>/<nombre>`
  - `interface ArchivosGuardados { xmlRuta: string | null; pdfRuta: string | null; errores: string[] }`
  - `guardarArchivosDocumento(proveedor: ProveedorFacturaElectronica, ref: ReferenciaDocumento, tenantSchema: string, documentoId: string): Promise<ArchivosGuardados>` (nunca lanza)
  - La ruta `/api/uploads/...` sirve `.pdf` (`application/pdf`) y `.xml` (`application/xml`) como adjunto.

- [ ] **Step 1: Pruebas que fallan para el storage** — en `src/lib/storage/local-file-storage.test.ts`, reemplazar

```ts
import { borrarArchivoDeOrden, saveDviFoto, saveOrdenArchivo } from "./local-file-storage";
```

por

```ts
import { borrarArchivoDeOrden, saveDocumentoElectronico, saveDviFoto, saveOrdenArchivo } from "./local-file-storage";
```

y agregar justo antes de `/** Escribe un archivo arbitrario dentro de UPLOADS_DIR (para el caso de travesía). */`:

```ts
describe("saveDocumentoElectronico", () => {
  const pdf = new TextEncoder().encode("%PDF-1.4\n%%EOF\n");

  it("guarda el PDF en <tenant>/facturas-electronicas/<id>/ y lo reemplaza si se guarda de nuevo", async () => {
    const saved = await saveDocumentoElectronico("taller_perez", "doc1", "FES-SETP1.pdf", pdf);
    expect(saved).toEqual({
      relativePath: "taller_perez/facturas-electronicas/doc1/FES-SETP1.pdf",
      url: "/api/uploads/taller_perez/facturas-electronicas/doc1/FES-SETP1.pdf",
    });
    const otro = new TextEncoder().encode("%PDF-1.7\n%%EOF\n");
    await saveDocumentoElectronico("taller_perez", "doc1", "FES-SETP1.pdf", otro);
    expect(Array.from(await readFile(path.join(uploadsDir, saved.relativePath)))).toEqual(Array.from(otro));
  });

  it("rechaza nombres o ids con ruta y extensiones no permitidas", async () => {
    await expect(saveDocumentoElectronico("taller_perez", "doc1", "../x.pdf", pdf)).rejects.toThrow(/no permitido/);
    await expect(saveDocumentoElectronico("taller_perez", "doc1", "factura.exe", pdf)).rejects.toThrow(/no permitido/);
    await expect(saveDocumentoElectronico("taller_perez", "../dvi", "FES-SETP1.pdf", pdf)).rejects.toThrow(/no permitido/);
  });

  it("rechaza bytes que no son PDF en un .pdf", async () => {
    await expect(
      saveDocumentoElectronico("taller_perez", "doc1", "FES-SETP1.pdf", new TextEncoder().encode("<html>")),
    ).rejects.toThrow(/no es un PDF válido/);
  });

  it("acepta un XML aunque traiga BOM", async () => {
    const xml = new TextEncoder().encode('﻿<?xml version="1.0"?><Invoice/>');
    const saved = await saveDocumentoElectronico("taller_perez", "doc1", "FES-SETP1.xml", xml);
    expect(saved.url).toBe("/api/uploads/taller_perez/facturas-electronicas/doc1/FES-SETP1.xml");
  });
});

```

Run: `npx vitest run --project unit src/lib/storage/local-file-storage.test.ts`
Expected: FAIL — `saveDocumentoElectronico` no existe.

- [ ] **Step 2: Implementar `saveDocumentoElectronico`** — en `src/lib/storage/local-file-storage.ts`, reemplazar

```ts
export async function saveDviFoto(tenantSchema: string, dviId: string, file: File): Promise<SavedUpload> {
```

por

```ts
/** Tope para el XML y el PDF de un documento electrónico. */
export const MAX_DOCUMENTO_ELECTRONICO_BYTES = 10 * 1024 * 1024;
const NOMBRE_DOCUMENTO_ELECTRONICO = /^[A-Za-z0-9_-]{1,80}\.(pdf|xml)$/;
const ID_SEGURO = /^[A-Za-z0-9_-]+$/;

function pareceDocumento(bytes: Uint8Array, extension: string): boolean {
  const inicio = new TextDecoder().decode(bytes.subarray(0, 64)).replace(/^﻿/, "").trimStart();
  return extension === "pdf" ? inicio.startsWith("%PDF-") : inicio.startsWith("<");
}

/**
 * XML y PDF de un documento electrónico (spec §11.6):
 * `<tenant>/facturas-electronicas/<documentoId>/<nombre>`. El nombre lo arma el servidor
 * (p. ej. "FES-SETP990000001.pdf"); guardarlo otra vez reemplaza el archivo.
 */
export async function saveDocumentoElectronico(
  tenantSchema: string,
  documentoId: string,
  nombre: string,
  bytes: Uint8Array,
): Promise<SavedUpload> {
  const coincide = NOMBRE_DOCUMENTO_ELECTRONICO.exec(nombre);
  if (!coincide || !ID_SEGURO.test(documentoId) || !ID_SEGURO.test(tenantSchema)) {
    throw new Error(`Nombre de archivo no permitido: ${nombre}`);
  }
  if (bytes.byteLength > MAX_DOCUMENTO_ELECTRONICO_BYTES) {
    throw new Error("El archivo supera el tamaño máximo permitido (10 MB)");
  }
  const extension = coincide[1];
  if (!pareceDocumento(bytes, extension)) {
    throw new Error(`El archivo no es un ${extension.toUpperCase()} válido`);
  }
  const segments = [tenantSchema, "facturas-electronicas", documentoId];
  const absoluteDir = path.join(getUploadsRoot(), ...segments);
  await mkdir(absoluteDir, { recursive: true });
  await writeFile(path.join(absoluteDir, nombre), bytes);
  const relativePath = [...segments, nombre].join("/");
  return { relativePath, url: `${PREFIJO_URL}${relativePath}` };
}

export async function saveDviFoto(tenantSchema: string, dviId: string, file: File): Promise<SavedUpload> {
```

Run: `npx vitest run --project unit src/lib/storage/local-file-storage.test.ts`
Expected: PASS (16 pruebas).

- [ ] **Step 3: Prueba que falla para la ruta** — en `src/app/api/uploads/[...path]/route.test.ts`, agregar justo antes del `});` final del `describe("GET /api/uploads/[...path]", …)`:

```ts
  it("sirve el PDF de un documento electrónico como adjunto con su tipo", async () => {
    mockRequireSession.mockResolvedValue({ user: { tenantSchema: TENANT } });
    const dir = path.join(uploadsDir, TENANT, "facturas-electronicas", "doc1");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "FES-SETP1.pdf"), Buffer.from("%PDF-1.4"));

    const response = await GET(undefined as never, makeParams([TENANT, "facturas-electronicas", "doc1", "FES-SETP1.pdf"]));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="FES-SETP1.pdf"');
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
```

Run: `npx vitest run --project unit "src/app/api/uploads/[...path]/route.test.ts"`
Expected: FAIL — status 404 (extensión no reconocida).

- [ ] **Step 4: Servir PDF y XML** — en `src/app/api/uploads/[...path]/route.ts`, reemplazar

```ts
const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};
```

por

```ts
const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".xml": "application/xml",
};

/** Documentos electrónicos: se descargan, nunca se muestran en la pestaña (un XML podría ejecutar código). */
const COMO_ADJUNTO = new Set([".pdf", ".xml"]);
```

y reemplazar

```ts
    const file = await readFile(requestedPath);
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
```

por

```ts
    const file = await readFile(requestedPath);
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    };
    if (COMO_ADJUNTO.has(extension)) {
      const nombre = path.basename(requestedPath).replace(/[^A-Za-z0-9._-]/g, "_");
      headers["Content-Disposition"] = `attachment; filename="${nombre}"`;
    }
    return new NextResponse(new Uint8Array(file), { headers });
```

Run: `npx vitest run --project unit "src/app/api/uploads/[...path]/route.test.ts"`
Expected: PASS (8 pruebas).

- [ ] **Step 5: Prueba que falla para `almacenamiento`** — crear `src/lib/factura-electronica/almacenamiento.test.ts`:

```ts
// src/lib/factura-electronica/almacenamiento.test.ts
// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { crearProveedorSimulado, ErrorProveedor, type ProveedorFacturaElectronica } from "@/modulos/factura-electronica";
import { guardarArchivosDocumento } from "./almacenamiento";

let uploadsDir: string;
const uploadsOriginal = process.env.UPLOADS_DIR;

beforeEach(async () => {
  uploadsDir = await mkdtemp(path.join(tmpdir(), "torqueflow-fe-"));
  process.env.UPLOADS_DIR = uploadsDir;
});

afterEach(async () => {
  await rm(uploadsDir, { recursive: true, force: true });
  process.env.UPLOADS_DIR = uploadsOriginal;
});

const ref = { tipo: "FACTURA" as const, prefijo: "SETP", numero: 990000001 };

describe("guardarArchivosDocumento", () => {
  it("descarga y guarda XML y PDF con el nombre del documento", async () => {
    const r = await guardarArchivosDocumento(crearProveedorSimulado(), ref, "taller_perez", "doc1");
    expect(r).toEqual({
      xmlRuta: "/api/uploads/taller_perez/facturas-electronicas/doc1/FES-SETP990000001.xml",
      pdfRuta: "/api/uploads/taller_perez/facturas-electronicas/doc1/FES-SETP990000001.pdf",
      errores: [],
    });
  });

  it("si la descarga falla no lanza: deja las rutas en null y cuenta los errores", async () => {
    const proveedor: ProveedorFacturaElectronica = {
      ...crearProveedorSimulado(),
      descargar: async () => {
        throw new ErrorProveedor("No se pudo descargar (código 404).");
      },
    };
    const r = await guardarArchivosDocumento(proveedor, ref, "taller_perez", "doc1");
    expect(r.xmlRuta).toBeNull();
    expect(r.pdfRuta).toBeNull();
    expect(r.errores).toHaveLength(2);
  });
});
```

Run: `npx vitest run --project unit src/lib/factura-electronica/almacenamiento.test.ts`
Expected: FAIL — no se encuentra `./almacenamiento`.

- [ ] **Step 6: Implementar `almacenamiento.ts`**

```ts
// src/lib/factura-electronica/almacenamiento.ts
import type { ProveedorFacturaElectronica, ReferenciaDocumento } from "@/modulos/factura-electronica";
import { saveDocumentoElectronico } from "@/lib/storage/local-file-storage";

export interface ArchivosGuardados {
  /** URL de /api/uploads/…; null si no se pudo descargar o guardar. */
  xmlRuta: string | null;
  pdfRuta: string | null;
  errores: string[];
}

/** Mismo nombre que usa Nextpyme para sus archivos. */
const PREFIJO_NOMBRE = { FACTURA: "FES", NOTA_CREDITO: "NCS" } as const;

/**
 * Descarga del proveedor y guarda el XML y el PDF (Nextpyme los guarda solo un año; nosotros
 * siempre). Nunca lanza: un archivo que falle queda en null y el documento sigue ACEPTADO (spec §7).
 */
export async function guardarArchivosDocumento(
  proveedor: ProveedorFacturaElectronica,
  ref: ReferenciaDocumento,
  tenantSchema: string,
  documentoId: string,
): Promise<ArchivosGuardados> {
  const resultado: ArchivosGuardados = { xmlRuta: null, pdfRuta: null, errores: [] };
  for (const formato of ["XML", "PDF"] as const) {
    const nombre = `${PREFIJO_NOMBRE[ref.tipo]}-${ref.prefijo}${ref.numero}.${formato.toLowerCase()}`;
    try {
      const bytes = await proveedor.descargar(ref, formato);
      const guardado = await saveDocumentoElectronico(tenantSchema, documentoId, nombre, bytes);
      if (formato === "XML") resultado.xmlRuta = guardado.url;
      else resultado.pdfRuta = guardado.url;
    } catch (e) {
      resultado.errores.push(e instanceof Error ? e.message : String(e));
    }
  }
  return resultado;
}
```

Run: `npx vitest run --project unit src/lib/factura-electronica/almacenamiento.test.ts`
Expected: PASS (2 pruebas).

- [ ] **Step 7: Verificación de la tarea**

Run: `npx tsc --noEmit && npx vitest run --project unit src/lib/factura-electronica src/lib/storage "src/app/api/uploads" && npx eslint src/lib/factura-electronica src/lib/storage "src/app/api/uploads"`
Expected: sin errores; 39 pruebas en verde (15 + 16 + 8).

- [ ] **Step 8: Commit y push**

```bash
git add src/lib/factura-electronica src/lib/storage "src/app/api/uploads"
git commit -m "fase-fe-task 7: guardar y servir el XML y el PDF de los documentos electrónicos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 8: Servicio — emitir, enviar y reintentar (con pruebas `db`)

**Files:**
- Create: `src/lib/factura-electronica/servicio.ts`
- Create: `src/lib/factura-electronica/servicio-db.test.ts`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: tareas 4–7 (`calcularTotales`, `esDocumentoYaProcesado`, `traducirMensajeDian`, `validarDocumento`, `leerConfiguracionFe`, `resolucionDeConfig`, `crearProveedorDesdeConfig`, `ErrorConfiguracionFe`, `fechaHoraBogota`, `mapearFactura`, `guardarArchivosDocumento`, `crearFacturaDePrueba`), `montoExacto`, `roundMoney`, `TenantPrismaClient`.
- Produces (usado por la tarea 9 y por el Plan 2b):
  - `interface ContextoFe { db: TenantPrismaClient; tenantSchema: string; usuarioId: string; ahora?: () => Date; proveedor?: ProveedorFacturaElectronica }`
  - `type MotivoFallaFe = "INACTIVA" | "VALIDACION" | "RANGO_AGOTADO" | "EN_CURSO" | "NO_ENCONTRADO" | "ESTADO" | "AMBIENTE"`
  - `type ResultadoFe = { ok: true; documentoId: string; estado: EstadoDocumentoElectronico; mensajes: MensajeDian[] } | { ok: false; motivo: MotivoFallaFe; mensaje: string; errores: ErrorValidacion[] }`
  - `ENVIO_INTERRUMPIDO_MS = 120_000`
  - `emitirDocumentoFactura(ctx: ContextoFe, facturaId: string): Promise<ResultadoFe>` — botón "Enviar a la DIAN" (2b) y envío automático
  - `reintentarDocumento(ctx: ContextoFe, documentoId: string): Promise<ResultadoFe>` — botón "Reenviar" (2b)
  - `emitirTrasFacturar(ctx: ContextoFe, facturaId: string): Promise<ResultadoFe | null>` — nunca lanza

Reglas que implementa (spec §5.1, §5.2, §3.2, §11.1–11.3, §11.7):
1. Configuración inactiva → `INACTIVA`, no se toca nada.
2. Se mapea y valida **antes** de asignar número; con errores → `VALIDACION`, sin consecutivo ni llamada.
3. En una transacción: `FOR UPDATE` de la factura, (si ya tiene documento, no se crea otro), `UPDATE … RETURNING` del consecutivo, documento en `ENVIANDO` con su `payload` (fecha/hora congeladas), y la factura interna alineada al documento (IVA y desglose; total, subtotal y saldo si hay diferencia de centavos).
4. En `PRUEBAS`/`PRODUCCION` se llama `probarConexion` antes de enviar: si falla o el ambiente del proveedor no coincide (o no lo informa) → no se envía.
5. Resultados: `ACEPTADO` → CUFE, fecha, advertencias, XML+PDF; `RECHAZADO` → motivos; Regla 90 → histórico (mismo total: adopta CUFE; otro total: choque, `POR_CONFIRMAR`); `ERROR_TEMPORAL` → `POR_CONFIRMAR`; `ERROR_CONFIGURACION` → `PENDIENTE`.
6. Reintento: mismo número y mismo `payload`; desde `RECHAZADO`/`PENDIENTE` se vuelve a mapear conservando prefijo, número, fecha y hora; desde `POR_CONFIRMAR` (o `ENVIANDO` de más de 2 min) primero se confirma (consulta por CUFE si lo hay, si no histórico) y solo si `NO_ENCONTRADO` se reenvía.

- [ ] **Step 1: Pruebas `db` que fallan** — crear `src/lib/factura-electronica/servicio-db.test.ts`:

```ts
// src/lib/factura-electronica/servicio-db.test.ts
// Prueba "db": aprovisiona un taller desechable (10-20 s). Nunca toca taller_dev ni producción.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  crearProveedorSimulado,
  traducirMensajesDian,
  type FacturaVenta,
  type MemoriaSimulado,
  type MensajeDian,
  type ProveedorFacturaElectronica,
} from "@/modulos/factura-electronica";
import type { Prisma } from "@/generated/prisma-tenant";
import { publicDb } from "@/lib/db/public-client";
import { getTenantDb } from "@/lib/db/tenant-client";
import { provisionTenant } from "../../../scripts/provision-tenant";
import { crearFacturaDePrueba } from "./__pruebas__/fixtures-db";
import { emitirDocumentoFactura, emitirTrasFacturar, reintentarDocumento, type ContextoFe } from "./servicio";

const SLUG = "test-fe-servicio";
const SCHEMA = "test_fe_servicio";
const db = getTenantDb(SCHEMA);
/** 10:00:00 del 20 de noviembre en Bogotá. */
const AHORA = new Date("2026-11-20T15:00:00Z");
let usuarioId = "";
let uploadsDir = "";
const uploadsOriginal = process.env.UPLOADS_DIR;

async function configurar(datos: Partial<Prisma.ConfiguracionFacturaElectronicaCreateInput> = {}) {
  const base = {
    activa: true,
    envio: "AUTOMATICO",
    ambiente: "SIMULADO",
    resultadoSimulado: "ACEPTAR",
    nit: "901000123",
    razonSocial: "Taller de Prueba SAS",
    resolucionNumero: "18760000001",
    prefijo: "SETP",
    rangoDesde: 990000000,
    rangoHasta: 995000000,
    vigenciaDesde: new Date("2026-01-01"),
    vigenciaHasta: new Date("2027-12-31"),
  } satisfies Partial<Prisma.ConfiguracionFacturaElectronicaCreateInput>;
  await db.configuracionFacturaElectronica.upsert({
    where: { id: "singleton" },
    create: { ...base, ...datos },
    update: { ...base, ...datos },
  });
}

function ctx(proveedor: ProveedorFacturaElectronica, ahora: Date = AHORA): ContextoFe {
  return { db, tenantSchema: SCHEMA, usuarioId, ahora: () => ahora, proveedor };
}

const docDe = (facturaId: string) => db.documentoElectronico.findFirstOrThrow({ where: { facturaId, tipo: "FACTURA" } });
const mensajesDe = (valor: unknown) => valor as MensajeDian[];

describe("servicio de factura electrónica", () => {
  beforeAll(async () => {
    await provisionTenant({ slug: SLUG, schemaName: SCHEMA });
    uploadsDir = await mkdtemp(path.join(tmpdir(), "torqueflow-fe-servicio-"));
    process.env.UPLOADS_DIR = uploadsDir;
    usuarioId = (await crearFacturaDePrueba(db, "FES000")).usuarioId;
  });

  afterAll(async () => {
    process.env.UPLOADS_DIR = uploadsOriginal;
    await rm(uploadsDir, { recursive: true, force: true });
    await publicDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await publicDb.tenant.deleteMany({ where: { slug: SLUG } });
  });

  beforeEach(async () => {
    await configurar();
  });

  it("acepta, guarda CUFE y archivos, congela fecha y hora y avanza el consecutivo", async () => {
    const { facturaId } = await crearFacturaDePrueba(db, "FES001");
    const r = await emitirDocumentoFactura(ctx(crearProveedorSimulado()), facturaId);
    expect(r).toMatchObject({ ok: true, estado: "ACEPTADO" });

    const doc = await docDe(facturaId);
    expect(doc.cufe).toMatch(/^[0-9a-f]{96}$/);
    expect(doc.numero).toBeGreaterThanOrEqual(990000000);
    expect(doc.intentos).toBe(1);
    expect(doc.payload as unknown as FacturaVenta).toMatchObject({ prefijo: "SETP", numero: doc.numero, fecha: "2026-11-20", hora: "10:00:00" });
    expect(doc.xmlRuta).toBe(`/api/uploads/${SCHEMA}/facturas-electronicas/${doc.id}/FES-SETP${doc.numero}.xml`);
    expect(doc.pdfRuta).toBe(`/api/uploads/${SCHEMA}/facturas-electronicas/${doc.id}/FES-SETP${doc.numero}.pdf`);
    const config = await db.configuracionFacturaElectronica.findUniqueOrThrow({ where: { id: "singleton" } });
    expect(config.siguienteConsecutivo).toBe(doc.numero + 1);
  });

  it("con datos incompletos no gasta número ni llama al proveedor", async () => {
    const { facturaId, clienteId } = await crearFacturaDePrueba(db, "FES002");
    await db.cliente.update({ where: { id: clienteId }, data: { tipoPersona: "JURIDICA" } });
    const antes = await db.configuracionFacturaElectronica.findUniqueOrThrow({ where: { id: "singleton" } });
    const proveedor = crearProveedorSimulado();
    const enviar = vi.spyOn(proveedor, "enviar");

    const r = await emitirDocumentoFactura(ctx(proveedor), facturaId);

    expect(r).toMatchObject({ ok: false, motivo: "VALIDACION" });
    if (!r.ok) {
      expect(r.errores.map((e) => e.campo)).toEqual(
        expect.arrayContaining(["cliente.tipoDocumento", "adquirente.municipioDane", "adquirente.direccion"]),
      );
    }
    expect(enviar).not.toHaveBeenCalled();
    expect(await db.documentoElectronico.count({ where: { facturaId } })).toBe(0);
    const despues = await db.configuracionFacturaElectronica.findUniqueOrThrow({ where: { id: "singleton" } });
    expect(despues.siguienteConsecutivo).toBe(antes.siguienteConsecutivo);
  });

  it("un rechazo guarda los motivos y el reintento usa el mismo número y la misma fecha", async () => {
    const { facturaId } = await crearFacturaDePrueba(db, "FES003");
    const memoria: MemoriaSimulado = new Map();
    const r1 = await emitirDocumentoFactura(ctx(crearProveedorSimulado({ resultado: "RECHAZAR", memoria })), facturaId);
    expect(r1).toMatchObject({ ok: true, estado: "RECHAZADO" });
    const rechazado = await docDe(facturaId);
    expect(mensajesDe(rechazado.mensajes)[0].codigo).toBe("FAU14");

    const manana = new Date("2026-11-21T15:00:00Z");
    const r2 = await reintentarDocumento(ctx(crearProveedorSimulado({ memoria }), manana), rechazado.id);
    expect(r2).toMatchObject({ ok: true, estado: "ACEPTADO" });
    const aceptado = await docDe(facturaId);
    expect(aceptado.numero).toBe(rechazado.numero);
    expect((aceptado.payload as unknown as FacturaVenta).fecha).toBe("2026-11-20");
    expect(aceptado.intentos).toBe(2);
  });

  it("caída con recibo: queda POR_CONFIRMAR y el reintento recupera el CUFE del histórico sin reenviar", async () => {
    const { facturaId } = await crearFacturaDePrueba(db, "FES004");
    const memoria: MemoriaSimulado = new Map();
    const r1 = await emitirDocumentoFactura(ctx(crearProveedorSimulado({ resultado: "CAIDA_RECIBIDO", memoria })), facturaId);
    expect(r1).toMatchObject({ ok: true, estado: "POR_CONFIRMAR" });
    const doc = await docDe(facturaId);

    const proveedor = crearProveedorSimulado({ memoria });
    const enviar = vi.spyOn(proveedor, "enviar");
    const r2 = await reintentarDocumento(ctx(proveedor), doc.id);

    expect(r2).toMatchObject({ ok: true, estado: "ACEPTADO" });
    expect(enviar).not.toHaveBeenCalled();
    expect((await docDe(facturaId)).cufe).toBe(memoria.get(`FACTURA:SETP${doc.numero}`)?.cufe);
  });

  it("Regla 90: con el mismo total adopta el CUFE del histórico; con otro total avisa un choque", async () => {
    const regla90 = traducirMensajesDian("Regla: 90, Rechazo: Documento procesado anteriormente.");
    const conHistorico = (total: number): ProveedorFacturaElectronica => ({
      ...crearProveedorSimulado(),
      enviar: async () => ({ estado: "RECHAZADO", motivos: regla90 }),
      buscarEmitido: async () => ({ estado: "ENCONTRADO", cufe: "cufe-del-historico", total }),
    });

    const a = await crearFacturaDePrueba(db, "FES005");
    expect(await emitirDocumentoFactura(ctx(conHistorico(11900000)), a.facturaId)).toMatchObject({ ok: true, estado: "ACEPTADO" });
    expect((await docDe(a.facturaId)).cufe).toBe("cufe-del-historico");

    const b = await crearFacturaDePrueba(db, "FES006");
    expect(await emitirDocumentoFactura(ctx(conHistorico(100)), b.facturaId)).toMatchObject({ ok: true, estado: "POR_CONFIRMAR" });
    const choque = await docDe(b.facturaId);
    expect(choque.cufe).toBeNull();
    expect(mensajesDe(choque.mensajes)[0].explicacion).toMatch(/choque de numeración/);
  });

  it("token inválido: queda PENDIENTE (seguro no llegó a la DIAN)", async () => {
    const { facturaId } = await crearFacturaDePrueba(db, "FES007");
    const proveedor: ProveedorFacturaElectronica = {
      ...crearProveedorSimulado(),
      enviar: async () => ({ estado: "ERROR_CONFIGURACION", mensaje: "La conexión con el proveedor no es válida." }),
    };
    expect(await emitirDocumentoFactura(ctx(proveedor), facturaId)).toMatchObject({ ok: true, estado: "PENDIENTE" });
  });

  it("si el ambiente del proveedor no coincide con el del taller no envía y deja PENDIENTE", async () => {
    await configurar({ ambiente: "PRUEBAS" });
    const { facturaId } = await crearFacturaDePrueba(db, "FES008");
    const enviar = vi.fn();
    const proveedor: ProveedorFacturaElectronica = {
      ...crearProveedorSimulado(),
      enviar,
      probarConexion: async () => ({ ok: true, ambiente: "PRODUCCION" }),
    };

    const r = await emitirDocumentoFactura(ctx(proveedor), facturaId);

    expect(r).toMatchObject({ ok: true, estado: "PENDIENTE" });
    if (r.ok) expect(r.mensajes[0].explicacion).toMatch(/ambiente de producción/);
    expect(enviar).not.toHaveBeenCalled();
  });

  it("si el total electrónico difiere un centavo, la factura interna se ajusta al documento", async () => {
    const { facturaId } = await crearFacturaDePrueba(db, "FES009", { valor: 11900.03 });
    expect(await emitirDocumentoFactura(ctx(crearProveedorSimulado()), facturaId)).toMatchObject({ ok: true, estado: "ACEPTADO" });
    const f = await db.factura.findUniqueOrThrow({ where: { id: facturaId } });
    expect(Number(f.total)).toBe(11900.02);
    expect(Number(f.subtotal)).toBe(11900.02);
    expect(Number(f.saldoPendiente)).toBe(11900.02);
    expect(Number(f.iva)).toBe(1900);
  });

  it("envíos concurrentes reciben números consecutivos sin huecos", async () => {
    const ids: string[] = [];
    for (const placa of ["FES010", "FES011", "FES012", "FES013"]) ids.push((await crearFacturaDePrueba(db, placa)).facturaId);
    const proveedor = crearProveedorSimulado();

    const resultados = await Promise.all(ids.map((id) => emitirDocumentoFactura(ctx(proveedor), id)));

    expect(resultados.every((r) => r.ok && r.estado === "ACEPTADO")).toBe(true);
    const docs = await db.documentoElectronico.findMany({ where: { facturaId: { in: ids } }, orderBy: { numero: "asc" } });
    const numeros = docs.map((d) => d.numero);
    expect(numeros).toEqual([numeros[0], numeros[0] + 1, numeros[0] + 2, numeros[0] + 3]);
    const config = await db.configuracionFacturaElectronica.findUniqueOrThrow({ where: { id: "singleton" } });
    expect(config.siguienteConsecutivo).toBe(numeros[3] + 1);
  });

  it("la misma factura enviada dos veces a la vez crea un solo documento", async () => {
    const { facturaId } = await crearFacturaDePrueba(db, "FES014");
    const proveedor = crearProveedorSimulado();

    const resultados = await Promise.all([
      emitirDocumentoFactura(ctx(proveedor), facturaId),
      emitirDocumentoFactura(ctx(proveedor), facturaId),
    ]);

    expect(await db.documentoElectronico.count({ where: { facturaId } })).toBe(1);
    expect(resultados.some((r) => r.ok && r.estado === "ACEPTADO")).toBe(true);
  });

  it("emitirTrasFacturar solo actúa con la configuración activa y envío automático", async () => {
    const { facturaId } = await crearFacturaDePrueba(db, "FES015");
    await configurar({ envio: "MANUAL" });
    expect(await emitirTrasFacturar(ctx(crearProveedorSimulado()), facturaId)).toBeNull();
    await configurar({ activa: false });
    expect(await emitirTrasFacturar(ctx(crearProveedorSimulado()), facturaId)).toBeNull();
    expect(await db.documentoElectronico.count({ where: { facturaId } })).toBe(0);

    await configurar();
    expect(await emitirTrasFacturar(ctx(crearProveedorSimulado()), facturaId)).toMatchObject({ ok: true, estado: "ACEPTADO" });
  });
});
```

- [ ] **Step 2: Registrar la prueba en el proyecto `db`** — en `vitest.config.ts`, reemplazar

```ts
  "src/lib/factura-electronica/migracion-db.test.ts",
```

por

```ts
  "src/lib/factura-electronica/migracion-db.test.ts",
  "src/lib/factura-electronica/servicio-db.test.ts",
```

- [ ] **Step 3: Correr y ver que falla**

Run: `npx vitest run --project db src/lib/factura-electronica/servicio-db.test.ts`
Expected: FAIL — no se encuentra `./servicio` (falla antes de aprovisionar).

- [ ] **Step 4: Implementar `servicio.ts`**

```ts
// src/lib/factura-electronica/servicio.ts
import {
  calcularTotales,
  esDocumentoYaProcesado,
  traducirMensajeDian,
  validarDocumento,
  type ErrorValidacion,
  type FacturaVenta,
  type MensajeDian,
  type ProveedorFacturaElectronica,
  type ReferenciaDocumento,
  type ResultadoEnvio,
} from "@/modulos/factura-electronica";
import type { EstadoDocumentoElectronico, EstadoFactura, Prisma } from "@/generated/prisma-tenant";
import type { TenantPrismaClient } from "@/lib/db/tenant-client";
import { montoExacto } from "@/lib/money/monto-exacto";
import { roundMoney } from "@/lib/money/round";
import { guardarArchivosDocumento } from "./almacenamiento";
import {
  crearProveedorDesdeConfig,
  ErrorConfiguracionFe,
  leerConfiguracionFe,
  resolucionDeConfig,
  type ConfiguracionFe,
} from "./configuracion";
import { fechaHoraBogota } from "./hora-bogota";
import { mapearFactura, type Numerico, type ResultadoMapeo } from "./mapear";

export interface ContextoFe {
  db: TenantPrismaClient;
  tenantSchema: string;
  usuarioId: string;
  /** Para pruebas: reloj fijo. */
  ahora?: () => Date;
  /** Para pruebas: proveedor fijo (si no, se crea desde la configuración). */
  proveedor?: ProveedorFacturaElectronica;
}

export type MotivoFallaFe = "INACTIVA" | "VALIDACION" | "RANGO_AGOTADO" | "EN_CURSO" | "NO_ENCONTRADO" | "ESTADO" | "AMBIENTE";

/** ok: true = el documento existe y quedó en `estado` (aceptado o no); ok: false = no se hizo nada. */
export type ResultadoFe =
  | { ok: true; documentoId: string; estado: EstadoDocumentoElectronico; mensajes: MensajeDian[] }
  | { ok: false; motivo: MotivoFallaFe; mensaje: string; errores: ErrorValidacion[] };

/** Un envío en ENVIANDO más viejo que esto se da por interrumpido (se trata como POR_CONFIRMAR). */
export const ENVIO_INTERRUMPIDO_MS = 2 * 60_000;

const RANGO_AGOTADO = "RANGO_AGOTADO";
const TX = { maxWait: 10_000, timeout: 20_000 };
const INCLUDE_MAPEO = {
  cliente: true,
  orden: { include: { items: true, manoDeObra: true } },
} satisfies Prisma.FacturaInclude;

const reloj = (ctx: ContextoFe) => (ctx.ahora ?? (() => new Date()))();
const comoJson = (v: unknown) => v as Prisma.InputJsonValue;
const mensaje = (texto: string): MensajeDian[] => [traducirMensajeDian(texto)];
const falla = (motivo: MotivoFallaFe, texto: string, errores: ErrorValidacion[] = []): ResultadoFe => ({
  ok: false,
  motivo,
  mensaje: texto,
  errores,
});
const pesos = (c: number) => (c / 100).toLocaleString("es-CO", { style: "currency", currency: "COP" });
const nombreAmbiente = (a: string | null) => (a === "PRUEBAS" ? "pruebas" : a === "PRODUCCION" ? "producción" : "sin informar");

/**
 * El documento legal manda (spec §11.3): el IVA y el desglose de la factura interna quedan
 * iguales a los del documento electrónico, y si el total difiere en centavos se ajustan
 * subtotal, total y saldo.
 */
async function alinearFactura(tx: Prisma.TransactionClient, facturaId: string, mapeo: ResultadoMapeo): Promise<void> {
  const f: { subtotal: Numerico; total: Numerico; saldoPendiente: Numerico } = await tx.factura.findUniqueOrThrow({
    where: { id: facturaId },
    select: { subtotal: true, total: true, saldoPendiente: true },
  });
  const totales = calcularTotales(mapeo.documento.lineas);
  const desgloseIva = totales.impuestos.map((i) => ({ ivaPct: i.tarifa, base: i.base / 100, iva: i.valor / 100 }));
  const ajuste = mapeo.diferencia / 100;
  const saldo = roundMoney(Number(f.saldoPendiente) + ajuste);
  const estado: EstadoFactura = saldo <= 0 ? "PAGADA" : "PENDIENTE";
  await tx.factura.update({
    where: { id: facturaId },
    data: {
      iva: montoExacto(totales.totalImpuestos / 100),
      desgloseIva,
      ...(mapeo.diferencia !== 0
        ? {
            subtotal: montoExacto(Number(f.subtotal) + ajuste),
            total: montoExacto(Number(f.total) + ajuste),
            saldoPendiente: montoExacto(Math.max(saldo, 0)),
            estado,
          }
        : {}),
    },
  });
}

async function terminar(
  ctx: ContextoFe,
  id: string,
  estado: EstadoDocumentoElectronico,
  mensajes: MensajeDian[],
): Promise<ResultadoFe> {
  await ctx.db.documentoElectronico.update({ where: { id }, data: { estado, mensajes: comoJson(mensajes) } });
  return { ok: true, documentoId: id, estado, mensajes };
}

async function aceptar(
  ctx: ContextoFe,
  proveedor: ProveedorFacturaElectronica,
  id: string,
  ref: ReferenciaDocumento,
  cufe: string,
  fechaValidacion: string | null,
  advertencias: MensajeDian[],
): Promise<ResultadoFe> {
  const fecha = fechaValidacion ? new Date(fechaValidacion) : null;
  await ctx.db.documentoElectronico.update({
    where: { id },
    data: {
      estado: "ACEPTADO",
      cufe,
      fechaValidacion: fecha && !Number.isNaN(fecha.getTime()) ? fecha : null,
      mensajes: comoJson(advertencias),
    },
  });
  const archivos = await guardarArchivosDocumento(proveedor, { ...ref, cufe }, ctx.tenantSchema, id);
  if (archivos.xmlRuta || archivos.pdfRuta) {
    await ctx.db.documentoElectronico.update({ where: { id }, data: { xmlRuta: archivos.xmlRuta, pdfRuta: archivos.pdfRuta } });
  }
  if (archivos.errores.length > 0) console.error("[factura-electronica] archivos sin guardar", id, archivos.errores);
  return { ok: true, documentoId: id, estado: "ACEPTADO", mensajes: advertencias };
}

type Previo =
  | { tipo: "ACEPTADO"; cufe: string; fechaValidacion: string | null; advertencias: MensajeDian[] }
  | { tipo: "RECHAZADO"; motivos: MensajeDian[] }
  | { tipo: "NO_ENCONTRADO" }
  | { tipo: "SIN_CONFIRMAR"; mensaje: string };

/** Histórico DIAN (spec §11.1): solo se adopta el CUFE si el total coincide. */
async function buscarEnHistorico(
  proveedor: ProveedorFacturaElectronica,
  ref: ReferenciaDocumento,
  fecha: string,
  total: number,
): Promise<Previo> {
  const b = await proveedor.buscarEmitido(ref, fecha);
  if (b.estado === "NO_ENCONTRADO") return { tipo: "NO_ENCONTRADO" };
  if (b.estado !== "ENCONTRADO") return { tipo: "SIN_CONFIRMAR", mensaje: b.mensaje };
  if (b.total !== total) {
    return {
      tipo: "SIN_CONFIRMAR",
      mensaje: `Posible choque de numeración: la DIAN ya tiene el documento ${ref.prefijo}${ref.numero} por ${pesos(b.total)} y esta factura es por ${pesos(total)}. Revisa la resolución y el consecutivo antes de seguir.`,
    };
  }
  return { tipo: "ACEPTADO", cufe: b.cufe, fechaValidacion: null, advertencias: [] };
}

/** Antes de reenviar algo que pudo llegar: consulta por CUFE si lo hay y, si no, el histórico. */
async function confirmarPrevio(
  proveedor: ProveedorFacturaElectronica,
  ref: ReferenciaDocumento,
  fecha: string,
  total: number,
): Promise<Previo> {
  if (ref.cufe) {
    const c = await proveedor.consultarEstado(ref);
    if (c.estado === "ACEPTADO") return { tipo: "ACEPTADO", cufe: c.cufe, fechaValidacion: c.fechaValidacion, advertencias: c.advertencias };
    if (c.estado === "RECHAZADO") return { tipo: "RECHAZADO", motivos: c.motivos };
    if (c.estado !== "NO_ENCONTRADO") return { tipo: "SIN_CONFIRMAR", mensaje: c.mensaje };
  }
  return buscarEnHistorico(proveedor, ref, fecha, total);
}

async function resolverEnvio(
  ctx: ContextoFe,
  proveedor: ProveedorFacturaElectronica,
  id: string,
  ref: ReferenciaDocumento,
  fecha: string,
  total: number,
  r: ResultadoEnvio,
): Promise<ResultadoFe> {
  switch (r.estado) {
    case "ACEPTADO":
      return aceptar(ctx, proveedor, id, ref, r.cufe, r.fechaValidacion, r.advertencias);
    case "ERROR_TEMPORAL":
      return terminar(ctx, id, "POR_CONFIRMAR", mensaje(r.mensaje));
    case "ERROR_CONFIGURACION":
      return terminar(ctx, id, "PENDIENTE", mensaje(r.mensaje));
    case "RECHAZADO": {
      if (!esDocumentoYaProcesado(r.motivos)) return terminar(ctx, id, "RECHAZADO", r.motivos);
      const h = await buscarEnHistorico(proveedor, ref, fecha, total);
      if (h.tipo === "ACEPTADO") return aceptar(ctx, proveedor, id, ref, h.cufe, null, []);
      return terminar(
        ctx,
        id,
        "POR_CONFIRMAR",
        mensaje(
          h.tipo === "SIN_CONFIRMAR"
            ? h.mensaje
            : "La DIAN dice que ya recibió este número, pero todavía no aparece en su histórico. Reintenta más tarde para recuperar el CUFE.",
        ),
      );
    }
  }
}

interface DocumentoEnCurso {
  id: string;
  documento: FacturaVenta;
  cufe: string | null;
}

/** El documento ya está en ENVIANDO (lo marcó quien llama). */
async function enviarConProveedor(
  ctx: ContextoFe,
  config: ConfiguracionFe,
  doc: DocumentoEnCurso,
  consultarPrimero: boolean,
): Promise<ResultadoFe> {
  const ref: ReferenciaDocumento = {
    tipo: "FACTURA",
    prefijo: doc.documento.prefijo,
    numero: doc.documento.numero,
    ...(doc.cufe ? { cufe: doc.cufe } : {}),
  };
  const total = calcularTotales(doc.documento.lineas).totalAPagar;
  /** Si no se llega a enviar: lo que pudo haber llegado sigue por confirmar; lo demás, pendiente. */
  const sinEnviar: EstadoDocumentoElectronico = consultarPrimero ? "POR_CONFIRMAR" : "PENDIENTE";

  let proveedor: ProveedorFacturaElectronica;
  try {
    proveedor = ctx.proveedor ?? crearProveedorDesdeConfig(config, ctx.tenantSchema);
  } catch (e) {
    if (e instanceof ErrorConfiguracionFe) return terminar(ctx, doc.id, sinEnviar, mensaje(e.message));
    throw e;
  }

  // Spec §11.2: nunca enviar si el ambiente de Nextpyme no es el configurado en el taller.
  if (config.ambiente !== "SIMULADO") {
    const conexion = await proveedor.probarConexion();
    if (!conexion.ok) return terminar(ctx, doc.id, sinEnviar, mensaje(conexion.mensaje));
    if (conexion.ambiente !== config.ambiente) {
      return terminar(
        ctx,
        doc.id,
        sinEnviar,
        mensaje(
          `El proveedor tiene esta empresa en ambiente de ${nombreAmbiente(conexion.ambiente)} y el taller está configurado en ${nombreAmbiente(config.ambiente)}. No se envió nada; revisa la configuración.`,
        ),
      );
    }
  }

  if (consultarPrimero) {
    const previo = await confirmarPrevio(proveedor, ref, doc.documento.fecha, total);
    if (previo.tipo === "ACEPTADO") {
      return aceptar(ctx, proveedor, doc.id, ref, previo.cufe, previo.fechaValidacion, previo.advertencias);
    }
    if (previo.tipo === "RECHAZADO") return terminar(ctx, doc.id, "RECHAZADO", previo.motivos);
    if (previo.tipo === "SIN_CONFIRMAR") return terminar(ctx, doc.id, "POR_CONFIRMAR", mensaje(previo.mensaje));
  }

  const r = await proveedor.enviar(doc.documento);
  return resolverEnvio(ctx, proveedor, doc.id, ref, doc.documento.fecha, total, r);
}

async function ejecutarEnvio(
  ctx: ContextoFe,
  config: ConfiguracionFe,
  doc: DocumentoEnCurso,
  consultarPrimero: boolean,
): Promise<ResultadoFe> {
  try {
    return await enviarConProveedor(ctx, config, doc, consultarPrimero);
  } catch (e) {
    console.error("[factura-electronica] error inesperado al enviar", doc.id, e);
    return terminar(
      ctx,
      doc.id,
      "POR_CONFIRMAR",
      mensaje("Ocurrió un error inesperado al enviar. Reintenta: primero se confirmará con la DIAN si lo recibió."),
    );
  }
}

function validar(mapeo: ResultadoMapeo, config: ConfiguracionFe, hoy: string): ErrorValidacion[] {
  return [...mapeo.errores, ...validarDocumento(mapeo.documento, { resolucion: resolucionDeConfig(config) ?? undefined, hoy })];
}

/**
 * Crea la factura electrónica de una factura y la envía (spec §5.1). Si ya tiene documento,
 * es un reintento. Lo usa el envío automático y el botón "Enviar a la DIAN".
 */
export async function emitirDocumentoFactura(ctx: ContextoFe, facturaId: string): Promise<ResultadoFe> {
  const ahora = reloj(ctx);
  const config = await leerConfiguracionFe(ctx.db);
  if (!config?.activa) return falla("INACTIVA", "La facturación electrónica no está activa en este taller.");

  const existente = await ctx.db.documentoElectronico.findFirst({ where: { facturaId, tipo: "FACTURA" }, select: { id: true } });
  if (existente) return reintentarDocumento(ctx, existente.id);

  const factura = await ctx.db.factura.findUnique({ where: { id: facturaId }, include: INCLUDE_MAPEO });
  if (!factura) return falla("NO_ENCONTRADO", "La factura no existe.");

  const { fecha, hora } = fechaHoraBogota(ahora);
  const provisional = Math.max(config.siguienteConsecutivo, config.rangoDesde ?? 1);
  const mapeo = mapearFactura(factura, {
    prefijo: config.prefijo ?? "",
    numero: provisional,
    resolucionNumero: config.resolucionNumero ?? "",
    fecha,
    hora,
  });
  const errores = validar(mapeo, config, fecha);
  if (errores.length > 0) return falla("VALIDACION", "Faltan datos para la factura electrónica.", errores);

  let creado: DocumentoEnCurso | null;
  try {
    creado = await ctx.db.$transaction(async (tx) => {
      // Serializa por factura: dos envíos a la vez de la misma factura no crean dos documentos.
      await tx.$queryRaw`SELECT id FROM facturas WHERE id = ${facturaId} FOR UPDATE`;
      const otro = await tx.documentoElectronico.findFirst({ where: { facturaId, tipo: "FACTURA" }, select: { id: true } });
      if (otro) return null;
      // Consecutivo atómico: la fila de configuración queda bloqueada hasta el commit.
      const [fila] = await tx.$queryRaw<{ asignado: number }[]>`
        UPDATE configuracion_factura_electronica
        SET siguiente_consecutivo = GREATEST(siguiente_consecutivo, COALESCE(rango_desde, 1)) + 1, updated_at = NOW()
        WHERE id = 'singleton'
        RETURNING siguiente_consecutivo - 1 AS asignado`;
      if (!fila || (config.rangoHasta !== null && fila.asignado > config.rangoHasta)) throw new Error(RANGO_AGOTADO);
      const documento: FacturaVenta = { ...mapeo.documento, numero: fila.asignado };
      const doc = await tx.documentoElectronico.create({
        data: {
          tipo: "FACTURA",
          facturaId,
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
      await alinearFactura(tx, facturaId, mapeo);
      return { id: doc.id, documento, cufe: null };
    }, TX);
  } catch (e) {
    if (e instanceof Error && e.message === RANGO_AGOTADO) {
      return falla("RANGO_AGOTADO", "Se acabaron los números de la resolución de facturación. Registra una resolución nueva.");
    }
    throw e;
  }

  if (!creado) {
    const ganador = await ctx.db.documentoElectronico.findFirst({ where: { facturaId, tipo: "FACTURA" }, select: { id: true } });
    return ganador ? reintentarDocumento(ctx, ganador.id) : falla("NO_ENCONTRADO", "La factura no existe.");
  }
  return ejecutarEnvio(ctx, config, creado, false);
}

/**
 * Reenvía un documento con el mismo prefijo y número (spec §5.2). Desde RECHAZADO o PENDIENTE
 * se vuelve a mapear (por si corrigieron datos) conservando número, fecha y hora; desde
 * POR_CONFIRMAR primero se confirma con la DIAN.
 */
export async function reintentarDocumento(ctx: ContextoFe, documentoId: string): Promise<ResultadoFe> {
  const ahora = reloj(ctx);
  const config = await leerConfiguracionFe(ctx.db);
  if (!config?.activa) return falla("INACTIVA", "La facturación electrónica no está activa en este taller.");

  const doc = await ctx.db.documentoElectronico.findUnique({ where: { id: documentoId } });
  if (!doc) return falla("NO_ENCONTRADO", "El documento electrónico no existe.");
  if (doc.estado === "ACEPTADO" || doc.estado === "ANULADO") return falla("ESTADO", "Este documento ya fue aceptado por la DIAN.");
  if (doc.ambiente !== config.ambiente) {
    return falla(
      "AMBIENTE",
      `Este documento se creó en ambiente ${nombreAmbiente(doc.ambiente)} y el taller está en ${nombreAmbiente(config.ambiente)}; no se puede reenviar con el mismo número.`,
    );
  }

  const interrumpido =
    doc.estado === "ENVIANDO" && (!doc.ultimoIntentoAt || ahora.getTime() - doc.ultimoIntentoAt.getTime() > ENVIO_INTERRUMPIDO_MS);
  if (doc.estado === "ENVIANDO" && !interrumpido) return falla("EN_CURSO", "Este documento se está enviando. Espera un momento.");

  // Solo uno gana el reintento: si otro lo tomó primero, updatedAt ya cambió.
  const { count } = await ctx.db.documentoElectronico.updateMany({
    where: { id: doc.id, estado: doc.estado, updatedAt: doc.updatedAt },
    data: { estado: "ENVIANDO", intentos: { increment: 1 }, ultimoIntentoAt: ahora },
  });
  if (count === 0) return falla("EN_CURSO", "Este documento se está enviando. Espera un momento.");

  let documento = doc.payload as unknown as FacturaVenta;
  if (doc.estado === "RECHAZADO" || doc.estado === "PENDIENTE") {
    const factura = await ctx.db.factura.findUnique({ where: { id: doc.facturaId }, include: INCLUDE_MAPEO });
    const mapeo = factura
      ? mapearFactura(factura, {
          prefijo: documento.prefijo,
          numero: documento.numero,
          resolucionNumero: documento.resolucionNumero,
          fecha: documento.fecha,
          hora: documento.hora,
        })
      : null;
    const errores = mapeo ? validar(mapeo, config, fechaHoraBogota(ahora).fecha) : [{ campo: "factura", mensaje: "La factura no existe." }];
    if (!mapeo || errores.length > 0) {
      await ctx.db.documentoElectronico.update({
        where: { id: doc.id },
        data: { estado: doc.estado, mensajes: comoJson(errores.map((e) => traducirMensajeDian(e.mensaje))) },
      });
      return falla("VALIDACION", "Faltan datos para la factura electrónica.", errores);
    }
    documento = mapeo.documento;
    await ctx.db.$transaction(async (tx) => {
      await alinearFactura(tx, doc.facturaId, mapeo);
      await tx.documentoElectronico.update({ where: { id: doc.id }, data: { payload: comoJson(documento) } });
    }, TX);
  }

  const consultarPrimero = doc.estado === "POR_CONFIRMAR" || interrumpido;
  return ejecutarEnvio(ctx, config, { id: doc.id, documento, cufe: doc.cufe }, consultarPrimero);
}

/**
 * Para crearFacturaAction: si la configuración está activa y en envío automático, crea y envía
 * el documento. Nunca lanza (un fallo no debe tumbar la factura ya creada).
 */
export async function emitirTrasFacturar(ctx: ContextoFe, facturaId: string): Promise<ResultadoFe | null> {
  try {
    const config = await leerConfiguracionFe(ctx.db);
    if (!config?.activa || config.envio !== "AUTOMATICO") return null;
    return await emitirDocumentoFactura(ctx, facturaId);
  } catch (e) {
    console.error("[factura-electronica] no se pudo emitir tras facturar", facturaId, e);
    return null;
  }
}
```

- [ ] **Step 5: Correr las pruebas `db`** (tenant desechable; tarda 30-60 s)

Run: `npx vitest run --project db src/lib/factura-electronica/servicio-db.test.ts`
Expected: PASS (11 pruebas). Se verán líneas `console.error` solo si alguna descarga falla; en estas pruebas no debería haber ninguna.

- [ ] **Step 6: Verificación de la tarea**

Run: `npx tsc --noEmit && npx vitest run --project unit src/lib/factura-electronica && npx eslint src/lib/factura-electronica vitest.config.ts`
Expected: sin errores; 15 pruebas `unit` en verde.

- [ ] **Step 7: Commit y push**

```bash
git add src/lib/factura-electronica vitest.config.ts
git commit -m "fase-fe-task 8: servicio de factura electrónica (consecutivo atómico, envío, reintento con histórico y Regla 90)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 9: Envío automático al crear la factura

**Files:**
- Modify: `src/app/actions/factura-actions.ts`
- Modify: `src/app/actions/factura-actions.test.ts`

**Interfaces:**
- Consumes: `emitirTrasFacturar(ctx: ContextoFe, facturaId: string): Promise<ResultadoFe | null>` (tarea 8); `session.user.{id, tenantSchema}`; `tenantDb`.
- Produces: `crearFacturaAction` sin cambios de firma ni de `FacturaFormState` (las pantallas de 2b mostrarán el estado leyendo `DocumentoElectronico`).

- [ ] **Step 1: Pruebas que fallan** — en `src/app/actions/factura-actions.test.ts`, reemplazar

```ts
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
```

por

```ts
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mockEmitirTrasFacturar = vi.fn();
vi.mock("@/lib/factura-electronica/servicio", () => ({
  emitirTrasFacturar: (...args: unknown[]) => mockEmitirTrasFacturar(...args),
}));
```

y agregar al final del archivo:

```ts
describe("crearFacturaAction: factura electrónica", () => {
  beforeEach(() => {
    mockRequirePermiso.mockReset().mockResolvedValue(SESSION_ADMIN);
    mockOrdenFindFirst.mockReset().mockResolvedValue(
      baseOrden({
        items: [{ id: "i1", repuestoId: "r1", cantidad: 1, precioUnitario: "119", ivaPct: "19" }],
        manoDeObra: [{ id: "m1", valor: "100", ivaPct: "19" }],
      }),
    );
    mockFacturaCreate.mockReset().mockResolvedValue({ id: "f1" });
    mockRepuestoUpdateMany.mockReset().mockResolvedValue({ count: 1 });
    mockAnticipoFindMany.mockReset().mockResolvedValue([]);
    mockEmitirTrasFacturar.mockReset().mockResolvedValue(null);
  });

  it("después de crear la factura pide emitir el documento electrónico con los datos de la sesión", async () => {
    const result = await crearFacturaAction("o1", initialState, new FormData());

    expect(result).toEqual({ error: null, success: true, facturaId: "f1" });
    expect(mockEmitirTrasFacturar).toHaveBeenCalledWith(
      { db: expect.anything(), tenantSchema: "taller_perez", usuarioId: "u1" },
      "f1",
    );
  });

  it("si la factura no se crea, no intenta emitir", async () => {
    mockRepuestoUpdateMany.mockResolvedValue({ count: 0 });

    const result = await crearFacturaAction("o1", initialState, new FormData());

    expect(result.success).toBe(false);
    expect(mockEmitirTrasFacturar).not.toHaveBeenCalled();
  });

  it("lo que pase con la factura electrónica no cambia la respuesta de la acción", async () => {
    mockEmitirTrasFacturar.mockResolvedValue({ ok: false, motivo: "VALIDACION", mensaje: "Faltan datos", errores: [] });

    const result = await crearFacturaAction("o1", initialState, new FormData());

    expect(result).toEqual({ error: null, success: true, facturaId: "f1" });
  });
});
```

Run: `npx vitest run --project unit src/app/actions/factura-actions.test.ts`
Expected: FAIL — la primera prueba nueva falla porque `mockEmitirTrasFacturar` no se llama; las 25 existentes y las otras dos nuevas pasan.

- [ ] **Step 2: Llamar al servicio tras la transacción** — en `src/app/actions/factura-actions.ts`, reemplazar

```ts
import { scopeFactura, scopeOrden } from "@/lib/sede/scope";
```

por

```ts
import { scopeFactura, scopeOrden } from "@/lib/sede/scope";
import { emitirTrasFacturar } from "@/lib/factura-electronica/servicio";
```

y reemplazar

```ts
    return { error: friendlyPrismaErrorMessage(err, "Error al generar la factura"), success: false, facturaId: null };
  }

  revalidatePath(`/ordenes/${ordenId}`);
```

por

```ts
    return { error: friendlyPrismaErrorMessage(err, "Error al generar la factura"), success: false, facturaId: null };
  }

  // Factura electrónica (solo si el taller la tiene activa y con envío automático). Va fuera de
  // la transacción de la factura: un fallo nunca la deshace; el documento queda para reintentar.
  await emitirTrasFacturar({ db: tenantDb, tenantSchema: session.user.tenantSchema, usuarioId: session.user.id }, facturaId);

  revalidatePath(`/ordenes/${ordenId}`);
```

Run: `npx vitest run --project unit src/app/actions/factura-actions.test.ts`
Expected: PASS (28 pruebas).

- [ ] **Step 3: Verificación de la tarea**

Run: `npx tsc --noEmit && npx vitest run --project unit src/app/actions/factura-actions.test.ts src/lib/factura-electronica src/lib/factura src/modulos/factura-electronica && npx eslint src/app/actions/factura-actions.ts src/app/actions/factura-actions.test.ts`
Expected: sin errores; todas en verde.

- [ ] **Step 4: Commit y push**

```bash
git add src/app/actions/factura-actions.ts src/app/actions/factura-actions.test.ts
git commit -m "fase-fe-task 9: emitir la factura electrónica automáticamente al crear la factura

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

## Fuera de este plan (Plan 2b)

- Aplicar la migración `20261120130000_factura_electronica` a `taller_dev` y producción (**con permiso del usuario**).
- Pantallas: pestaña de configuración (incluye guardar `ambienteProveedor` y `ultimaPrueba*` al "Probar conexión"), tarjeta en la ficha de la factura (botones "Enviar a la DIAN" → `emitirDocumentoFactura`, "Reenviar" → `reintentarDocumento`, descargas por `xmlRuta`/`pdfRuta`), insignias y filtro en la lista, datos del cliente, aviso en Inicio, super-admin.
- Permisos nuevos ("Anular con nota crédito", "Configurar facturación electrónica") y nota crédito total en la app (`documentoReferenciaId`, `siguienteConsecutivoNotaCredito`, `ANULADO`, saldo en 0).
- Bloquear la edición de una factura con documento `ACEPTADO` (spec §5.3).

## Pendiente de confirmar en el sandbox real (tarea 8 de la spec)

1. `type_filter` de `GET /dian/documents/get-uuids`: la ficha dice 1 = emitidos, el SDK dice 2. El adaptador usa 1 (`TIPO_FILTRO_EMITIDOS`, un solo lugar).
2. Que los parámetros de `get-uuids` vayan en la query string (es un GET) con fechas `YYYY-MM-DD` y rango máximo de 31 días (se piden 3 días).
3. `total_amount` del histórico: si es el total a pagar (`payable_amount`) y en pesos con decimales; la comparación con el total del `payload` depende de eso.
4. `document_type.id` de la nota crédito en el histórico (se asume `"91"`).
5. Que `GET /config/company` traiga `data.type_environment_id` (1 producción, 2 pruebas). Si no lo trae, el servicio **bloquea** todo envío real (ambiente "sin informar").
6. Que la DIAN acepte un reintento días después con la fecha y hora originales congeladas (posible regla de antigüedad de la fecha de emisión).
7. Que reenviar tras un rechazo con el mismo número no devuelva la Regla 90.
8. Los puntos 1–5 del Plan 1 siguen vigentes (`type_document_identification_id`, `type_document_id` de la nota crédito, `base_quantity`, respuesta de `/status/document` sin CUFE, plan Estudiantes).

## Autorrevisión

**Cobertura spec §5 (flujos):**
- §5.1.1 factura como hoy → Task 9 (la transacción actual no cambia; el servicio corre después).
- §5.1.2 validar antes de numerar → Task 8 `emitirDocumentoFactura` + prueba "datos incompletos".
- §5.1.3 consecutivo atómico y `ENVIANDO` con `payload` → Task 8 (`UPDATE … RETURNING`, `FOR UPDATE`) + pruebas de concurrencia.
- §5.1.4 automático/manual → `emitirTrasFacturar` (automático); manual = `emitirDocumentoFactura` desde el botón de 2b.
- §5.1.5 resultados (CUFE, archivos, motivos, `POR_CONFIRMAR`) → Task 8 + Task 7.
- §5.2 mismo número y `payload`, remapeo al corregir, consultar antes de reenviar desde `POR_CONFIRMAR` → `reintentarDocumento` + pruebas de rechazo y caída con recibo. Aviso en Inicio → 2b.
- §5.3 nota crédito → 2b (el esquema ya tiene `documentoReferenciaId`, `NOTA_CREDITO`, `ANULADO` y numeración de notas).

**Cobertura spec §11:**
- §11.1 histórico DIAN, comparar total, choque → Task 4 (`buscarEmitido`, `interpretarEmitidos`) + Task 8 (`buscarEnHistorico`, prueba Regla 90 y caída con recibo).
- §11.2 ambiente real y bloqueo → Task 4 (`probarConexion` con `ambiente`) + Task 8 (prueba "ambiente no coincide"); columna `ambienteProveedor` para la pantalla de 2b.
- §11.3 IVA incluido y ajuste de la factura interna → Task 4 (`lineasDesdePreciosConIva`) + Task 6 (`diferencia`) + Task 8 (`alinearFactura`, prueba del centavo).
- §11.4 descuento repartido sin `allowance_charges` → Task 4 (líneas con `descuento: 0`). Cambio consciente: el resto se reparte por mayor residuo en vez de cargarlo todo a la última línea, para que ninguna quede negativa.
- §11.5 cantidades y unidades (`94`, `ZZ`) → Task 6 `mapearFactura`.
- §11.6 archivos y ruta con su tipo → Task 7.
- §11.7 fecha y hora congeladas → Task 8 (prueba "reintento usa la misma fecha").
- §11.8 división 2a/2b → este plan.

**Pendientes del Plan 1 atendidos:** CAIDA no registraba el documento (→ `CAIDA_RECIBIDO`); `consultarEstado` aceptado con fecha `""` (→ `null`); recuperar CUFE tras caída/Regla 90 (→ histórico); ambiente no verificado (→ `probarConexion` con ambiente y bloqueo). Los demás "minor (deferred)" quedan fuera (RULES.md §7).

**Placeholders:** ninguno; todo paso trae código o comando completo.

**Consistencia de tipos entre tareas:** `ResultadoConexion.ambiente` (T4) ↔ `enviarConProveedor` (T8); `ResultadoBusqueda.total: Centavos` (T4) ↔ comparación con `calcularTotales(...).totalAPagar` (T8); `MemoriaSimulado` (T4) ↔ `crearProveedorDesdeConfig` (T6) y pruebas db (T8); `ResultadoMapeo.{documento, errores, diferencia}` (T6) ↔ `validar` y `alinearFactura` (T8); `Numerico` exportado en T6 y usado en T8; `saveDocumentoElectronico` (T7) ↔ `guardarArchivosDocumento` (T7) ↔ `aceptar` (T8); `crearFacturaDePrueba` (T5) ↔ pruebas db (T5, T8); `emitirTrasFacturar(ctx, facturaId)` (T8) ↔ acción y su mock (T9).
