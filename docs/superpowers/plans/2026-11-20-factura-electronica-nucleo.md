# Factura electrónica — Plan 1: núcleo reutilizable

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el núcleo de facturación electrónica DIAN (modelo, cálculo, validación, mensajes DIAN, proveedor simulado y adaptador Nextpyme) como código TypeScript puro, sin dependencias de TorqueFlow.

**Architecture:** Carpeta `src/modulos/factura-electronica/` aislada por una regla de ESLint. El núcleo trabaja con códigos DIAN y montos en centavos enteros; cada proveedor traduce a su propio formato dentro de su adaptador. Este plan cubre las tareas 1–3 de la especificación; las tareas 4–8 (base de datos, servicio, pantallas, nota crédito en la app, sandbox real) van en el **Plan 2**, que se escribe al cerrar este.

**Tech Stack:** TypeScript estricto, Vitest 4 (proyecto `unit`, entorno `node` en estos archivos), Web Crypto (`crypto.subtle`), `fetch` nativo. Sin librerías nuevas.

**Spec:** `docs/superpowers/specs/2026-11-20-factura-electronica-design.md`

## Global Constraints

- Rama: `fase-fe-factura-electronica`. Commit y push al terminar **cada** tarea con el mensaje `fase-fe-task N: descripción breve` y la línea final `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Nada dentro de `src/modulos/factura-electronica/` puede importar `@/…`, `next`, `react`, `@prisma/*` ni carpetas de la app (`lib`, `app`, `components`, `generated`). Solo TypeScript, `fetch` y Web Crypto.
- Montos: **centavos enteros** (`Centavos = number`). Hacia Nextpyme se envían como texto con dos decimales (`"1190000.00"`).
- Catálogos en el núcleo: **códigos DIAN** (tipo de documento `"13"`, `"31"`; municipio DANE `"05001"`; unidad `"94"`; medio de pago `"10"`). Los IDs de Nextpyme solo existen dentro de `proveedores/nextpyme/`.
- Mensajes para el usuario: español sencillo, términos de Colombia.
- Cada archivo de prueba del núcleo empieza con `// @vitest-environment node` (el proyecto usa jsdom por defecto).
- Verificación por tarea (RULES.md §4): al final de cada tarea `npx tsc --noEmit`, `npx vitest run --project unit src/modulos/factura-electronica` y `npx eslint src/modulos/factura-electronica`.
- RULES.md §1: si un comando falla, máximo un intento de corrección; si vuelve a fallar, parar y reportar.
- No tocar base de datos, migraciones ni pantallas en este plan.

## Mapa de archivos

```
src/modulos/factura-electronica/
  index.ts                         API pública del núcleo (re-exporta)
  modelo.ts                        tipos y catálogos DIAN propios del núcleo
  dinero.ts                        centavos → texto decimal
  dv-nit.ts                        dígito de verificación del NIT
  calculo.ts                       totales por línea y del documento
  validacion.ts                    validación previa al envío
  mensajes-dian.ts                 traducción de reglas DIAN
  proveedor.ts                     contrato ProveedorFacturaElectronica
  fabrica.ts                       crearProveedor según ambiente
  catalogos/municipios.json        municipios DANE (generado)
  proveedores/simulado.ts          proveedor falso
  proveedores/nextpyme/
    catalogos.json                 código DIAN → ID Nextpyme (generado)
    catalogos.ts                   búsqueda tipada en catalogos.json
    mapear.ts                      DocumentoElectronico → JSON Nextpyme
    interpretar.ts                 respuesta Nextpyme → ResultadoEnvio
    proveedor.ts                   crearProveedorNextpyme (HTTP)
    __fixtures__/*.json            respuestas reales de la documentación
scripts/generar-catalogos-nextpyme.mjs   genera los dos JSON
eslint.config.mjs                  (modificar) regla de frontera
```

---

### Task 1: Modelo, cálculo, validación y frontera de importación

**Files:**
- Create: `src/modulos/factura-electronica/modelo.ts`
- Create: `src/modulos/factura-electronica/dinero.ts`
- Create: `src/modulos/factura-electronica/dv-nit.ts`
- Create: `src/modulos/factura-electronica/calculo.ts`
- Create: `src/modulos/factura-electronica/validacion.ts`
- Create: `src/modulos/factura-electronica/index.ts`
- Modify: `eslint.config.mjs` (agregar bloque antes de `globalIgnores`)
- Test: `src/modulos/factura-electronica/dinero.test.ts`, `dv-nit.test.ts`, `calculo.test.ts`, `validacion.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces (usados por las tareas 2 y 3 y por el Plan 2):
  - Tipos de `modelo.ts`: `Centavos`, `TipoDocumentoIdentidad`, `TipoPersona`, `RegimenIva`, `ResponsabilidadFiscal`, `AdquirenteIdentificado`, `ConsumidorFinal`, `Adquirente`, `Linea`, `FormaPago`, `MedioPago`, `Pago`, `ConceptoNotaCredito`, `FacturaVenta`, `NotaCredito`, `DocumentoElectronico`, `ReferenciaFactura`, `Resolucion`, `Emisor`, `TotalesLinea`, `ImpuestoTotal`, `Totales`, `MensajeDian`, `ErrorValidacion`; constantes `TIPOS_DOCUMENTO_IDENTIDAD`, `RESPONSABILIDADES_FISCALES`, `UNIDADES`, `MEDIOS_PAGO`, `CONCEPTOS_NOTA_CREDITO`, `NUMERO_CONSUMIDOR_FINAL`.
  - `aTextoDecimal(c: Centavos): string`
  - `calcularDvNit(nit: string): string`
  - `calcularLinea(l: Linea): TotalesLinea`, `calcularTotales(lineas: Linea[]): Totales`
  - `validarDocumento(doc: DocumentoElectronico, ctx: ContextoValidacion): ErrorValidacion[]` con `ContextoValidacion = { resolucion?: Resolucion; hoy: string }`

- [ ] **Step 1: Escribir `modelo.ts`** (solo tipos y constantes, no lleva prueba propia)

```ts
// src/modulos/factura-electronica/modelo.ts
// Núcleo de facturación electrónica DIAN. No importa nada de la app.

/** Montos en centavos enteros (COP). $1.234,56 = 123456. */
export type Centavos = number;

/** Tipos de documento de identidad (códigos DIAN). */
export const TIPOS_DOCUMENTO_IDENTIDAD = {
  "11": "Registro civil",
  "12": "Tarjeta de identidad",
  "13": "Cédula de ciudadanía",
  "21": "Tarjeta de extranjería",
  "22": "Cédula de extranjería",
  "31": "NIT",
  "41": "Pasaporte",
  "42": "Documento de identificación extranjero",
  "47": "PEP",
  "50": "NIT de otro país",
  "91": "NUIP",
} as const;
export type TipoDocumentoIdentidad = keyof typeof TIPOS_DOCUMENTO_IDENTIDAD;

export type TipoPersona = "JURIDICA" | "NATURAL";

/** 48 = responsable de IVA, 49 = no responsable de IVA. */
export type RegimenIva = "48" | "49";

export const RESPONSABILIDADES_FISCALES = {
  "O-13": "Gran contribuyente",
  "O-15": "Autorretenedor",
  "O-23": "Agente de retención en el impuesto sobre las ventas",
  "O-47": "Régimen simple de tributación",
  "R-99-PN": "No responsable",
} as const;
export type ResponsabilidadFiscal = keyof typeof RESPONSABILIDADES_FISCALES;

export interface AdquirenteIdentificado {
  tipo: "IDENTIFICADO";
  tipoDocumento: TipoDocumentoIdentidad;
  numeroDocumento: string;
  /** Obligatorio cuando tipoDocumento = "31" (NIT). */
  dv?: string;
  nombre: string;
  tipoPersona: TipoPersona;
  regimen: RegimenIva;
  responsabilidad: ResponsabilidadFiscal;
  /** Código DANE de 5 dígitos, p. ej. "05001" (Medellín). */
  municipioDane: string;
  direccion: string;
  telefono?: string;
  email?: string;
}

export interface ConsumidorFinal {
  tipo: "CONSUMIDOR_FINAL";
}

export type Adquirente = AdquirenteIdentificado | ConsumidorFinal;

export const NUMERO_CONSUMIDOR_FINAL = "222222222222";

/** Unidades de medida DIAN más usadas en talleres. */
export const UNIDADES = { UNIDAD: "94", HORA: "HUR", SERVICIO: "ZZ" } as const;

export interface Linea {
  codigo: string;
  descripcion: string;
  /** Hasta 2 decimales (p. ej. 1.5 horas). */
  cantidad: number;
  /** Código DIAN de unidad de medida (ver UNIDADES). */
  unidad: string;
  /** Precio unitario SIN IVA, en centavos. */
  precioUnitario: Centavos;
  /** Descuento de la línea en centavos (sobre precio × cantidad). */
  descuento: Centavos;
  /** null = excluido (no lleva IVA); { tarifa: 0 } = exento (IVA 0 %). */
  iva: { tarifa: number } | null;
}

export type FormaPago = "CONTADO" | "CREDITO";

export const MEDIOS_PAGO = {
  EFECTIVO: "10",
  TRANSFERENCIA: "47",
  TARJETA_CREDITO: "48",
  TARJETA_DEBITO: "49",
  OTRO: "1",
} as const;
export type MedioPago = (typeof MEDIOS_PAGO)[keyof typeof MEDIOS_PAGO];

export interface Pago {
  forma: FormaPago;
  medio: MedioPago;
  /** YYYY-MM-DD. En contado, la misma fecha del documento. */
  vencimiento: string;
}

export const CONCEPTOS_NOTA_CREDITO = {
  "1": "Devolución parcial de los bienes o no aceptación parcial del servicio",
  "2": "Anulación de factura electrónica",
  "3": "Rebaja o descuento parcial o total",
  "4": "Ajuste de precio",
  "5": "Otros",
} as const;
export type ConceptoNotaCredito = keyof typeof CONCEPTOS_NOTA_CREDITO;

interface DocumentoBase {
  prefijo: string;
  numero: number;
  /** YYYY-MM-DD (hora de Colombia). */
  fecha: string;
  /** HH:mm:ss (hora de Colombia). */
  hora: string;
  adquirente: Adquirente;
  lineas: Linea[];
  pago: Pago;
  notas?: string;
  /** Pedir al proveedor que envíe el documento al correo del adquirente. */
  enviarCorreo: boolean;
}

export interface FacturaVenta extends DocumentoBase {
  tipo: "FACTURA";
  resolucionNumero: string;
}

export interface ReferenciaFactura {
  /** Prefijo + número, p. ej. "SETP990000001". */
  numeroCompleto: string;
  cufe: string;
  /** YYYY-MM-DD de emisión de la factura. */
  fecha: string;
}

export interface NotaCredito extends DocumentoBase {
  tipo: "NOTA_CREDITO";
  concepto: ConceptoNotaCredito;
  motivo: string;
  facturaReferencia: ReferenciaFactura;
}

export type DocumentoElectronico = FacturaVenta | NotaCredito;

export interface Resolucion {
  numero: string;
  prefijo: string;
  desde: number;
  hasta: number;
  /** YYYY-MM-DD */
  vigenciaDesde: string;
  /** YYYY-MM-DD */
  vigenciaHasta: string;
}

export interface Emisor {
  nit: string;
  dv: string;
  razonSocial: string;
}

export interface TotalesLinea {
  /** precio × cantidad, redondeado a centavos */
  bruto: Centavos;
  descuento: Centavos;
  /** bruto − descuento (line_extension_amount) */
  neto: Centavos;
  iva: Centavos;
}

export interface ImpuestoTotal {
  tarifa: number;
  base: Centavos;
  valor: Centavos;
}

export interface Totales {
  lineas: TotalesLinea[];
  /** Suma de netos de todas las líneas (line_extension_amount). */
  bruto: Centavos;
  /** Suma de netos de las líneas con IVA, incluidas las exentas (tax_exclusive_amount). */
  baseGravable: Centavos;
  /** Consolidado por tarifa, de mayor a menor. */
  impuestos: ImpuestoTotal[];
  totalImpuestos: Centavos;
  /** bruto + impuestos (tax_inclusive_amount). */
  totalConImpuestos: Centavos;
  /** payable_amount (v1: sin descuentos ni cargos globales, igual a totalConImpuestos). */
  totalAPagar: Centavos;
}

export type TipoMensajeDian = "RECHAZO" | "NOTIFICACION";

export interface MensajeDian {
  /** Código de la regla ("FAU02", "90"…); null si el texto no trae regla. */
  codigo: string | null;
  tipo: TipoMensajeDian;
  /** Texto original de la DIAN o del proveedor. */
  textoDian: string;
  /** Qué pasó, en español sencillo. */
  explicacion: string;
  /** Qué hacer; null si no aplica o no se conoce. */
  comoCorregir: string | null;
}

export interface ErrorValidacion {
  /** Ruta del dato, p. ej. "adquirente.dv" o "lineas[0].cantidad". */
  campo: string;
  mensaje: string;
}
```

- [ ] **Step 2: Pruebas que fallan para `dinero` y `dv-nit`**

```ts
// src/modulos/factura-electronica/dinero.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { aTextoDecimal } from "./dinero";

describe("aTextoDecimal", () => {
  it("convierte centavos a texto con dos decimales", () => {
    expect(aTextoDecimal(0)).toBe("0.00");
    expect(aTextoDecimal(5)).toBe("0.05");
    expect(aTextoDecimal(119000000)).toBe("1190000.00");
    expect(aTextoDecimal(142853)).toBe("1428.53");
  });
  it("rechaza montos que no son enteros", () => {
    expect(() => aTextoDecimal(10.5)).toThrow(/centavos enteros/);
  });
});
```

```ts
// src/modulos/factura-electronica/dv-nit.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { calcularDvNit } from "./dv-nit";

describe("calcularDvNit", () => {
  it("calcula el DV con el algoritmo de la DIAN", () => {
    expect(calcularDvNit("800197268")).toBe("4"); // NIT de la DIAN
    expect(calcularDvNit("901249232")).toBe("0"); // Nextpyme Colombia SAS
    expect(calcularDvNit("900123456")).toBe("8");
  });
  it("ignora puntos, espacios y guiones", () => {
    expect(calcularDvNit("800.197.268")).toBe("4");
  });
  it("falla si no hay dígitos", () => {
    expect(() => calcularDvNit("abc")).toThrow(/NIT/);
  });
});
```

- [ ] **Step 3: Correr y ver que fallan**

Run: `npx vitest run --project unit src/modulos/factura-electronica/dinero.test.ts src/modulos/factura-electronica/dv-nit.test.ts`
Expected: FAIL — no se encuentran los módulos `./dinero` y `./dv-nit`.

- [ ] **Step 4: Implementar `dinero.ts` y `dv-nit.ts`**

```ts
// src/modulos/factura-electronica/dinero.ts
import type { Centavos } from "./modelo";

/** 119000000 → "1190000.00". Solo acepta enteros no negativos. */
export function aTextoDecimal(centavos: Centavos): string {
  if (!Number.isInteger(centavos)) {
    throw new Error(`Se esperaban centavos enteros y llegó ${centavos}`);
  }
  const signo = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  const pesos = Math.trunc(abs / 100);
  const resto = String(abs % 100).padStart(2, "0");
  return `${signo}${pesos}.${resto}`;
}
```

```ts
// src/modulos/factura-electronica/dv-nit.ts
const PESOS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

/** Dígito de verificación de un NIT colombiano (algoritmo módulo 11 de la DIAN). */
export function calcularDvNit(nit: string): string {
  const digitos = nit.replace(/\D/g, "");
  if (digitos.length === 0 || digitos.length > PESOS.length) {
    throw new Error(`NIT inválido: "${nit}"`);
  }
  let suma = 0;
  const invertido = digitos.split("").reverse();
  invertido.forEach((d, i) => {
    suma += Number(d) * PESOS[i];
  });
  const residuo = suma % 11;
  return String(residuo > 1 ? 11 - residuo : residuo);
}
```

- [ ] **Step 5: Correr y ver que pasan**

Run: `npx vitest run --project unit src/modulos/factura-electronica/dinero.test.ts src/modulos/factura-electronica/dv-nit.test.ts`
Expected: PASS (5 pruebas).

- [ ] **Step 6: Prueba que falla para `calculo`**

```ts
// src/modulos/factura-electronica/calculo.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { calcularLinea, calcularTotales } from "./calculo";
import type { Linea } from "./modelo";

const linea = (p: Partial<Linea>): Linea => ({
  codigo: "X",
  descripcion: "Concepto",
  cantidad: 1,
  unidad: "94",
  precioUnitario: 0,
  descuento: 0,
  iva: { tarifa: 19 },
  ...p,
});

describe("calcularLinea", () => {
  it("multiplica precio por cantidad y aplica IVA", () => {
    expect(calcularLinea(linea({ precioUnitario: 100000, cantidad: 2 }))).toEqual({
      bruto: 200000,
      descuento: 0,
      neto: 200000,
      iva: 38000,
    });
  });
  it("aplica el IVA sobre el valor con descuento", () => {
    expect(calcularLinea(linea({ precioUnitario: 100000, descuento: 10000 }))).toEqual({
      bruto: 100000,
      descuento: 10000,
      neto: 90000,
      iva: 17100,
    });
  });
  it("redondea a centavos", () => {
    // 3333 × 3 = 9999; IVA 19 % = 1899,81 → 1900
    expect(calcularLinea(linea({ precioUnitario: 3333, cantidad: 3 })).iva).toBe(1900);
    // 3333 × 1,5 = 4999,5 → 5000
    expect(calcularLinea(linea({ precioUnitario: 3333, cantidad: 1.5 })).bruto).toBe(5000);
  });
  it("una línea excluida no lleva IVA", () => {
    expect(calcularLinea(linea({ precioUnitario: 20000, iva: null })).iva).toBe(0);
  });
});

describe("calcularTotales", () => {
  it("consolida tarifas mezcladas; la excluida no entra en la base gravable", () => {
    const t = calcularTotales([
      linea({ precioUnitario: 1000000 }), // 19 %
      linea({ precioUnitario: 50000, iva: { tarifa: 5 } }),
      linea({ precioUnitario: 30000, iva: { tarifa: 0 } }), // exenta
      linea({ precioUnitario: 20000, iva: null }), // excluida
      linea({ precioUnitario: 500000 }), // 19 %
    ]);
    expect(t.bruto).toBe(1600000);
    expect(t.baseGravable).toBe(1580000);
    expect(t.impuestos).toEqual([
      { tarifa: 19, base: 1500000, valor: 285000 },
      { tarifa: 5, base: 50000, valor: 2500 },
      { tarifa: 0, base: 30000, valor: 0 },
    ]);
    expect(t.totalImpuestos).toBe(287500);
    expect(t.totalConImpuestos).toBe(1887500);
    expect(t.totalAPagar).toBe(1887500);
    expect(t.lineas).toHaveLength(5);
  });
  it("sin líneas todo es cero", () => {
    const t = calcularTotales([]);
    expect(t).toEqual({
      lineas: [],
      bruto: 0,
      baseGravable: 0,
      impuestos: [],
      totalImpuestos: 0,
      totalConImpuestos: 0,
      totalAPagar: 0,
    });
  });
});
```

- [ ] **Step 7: Correr y ver que falla**

Run: `npx vitest run --project unit src/modulos/factura-electronica/calculo.test.ts`
Expected: FAIL — no se encuentra `./calculo`.

- [ ] **Step 8: Implementar `calculo.ts`**

```ts
// src/modulos/factura-electronica/calculo.ts
import type { ImpuestoTotal, Linea, Totales, TotalesLinea } from "./modelo";

export function calcularLinea(l: Linea): TotalesLinea {
  const bruto = Math.round(l.precioUnitario * l.cantidad);
  const neto = bruto - l.descuento;
  const iva = l.iva ? Math.round((neto * l.iva.tarifa) / 100) : 0;
  return { bruto, descuento: l.descuento, neto, iva };
}

/**
 * Totales del documento según las reglas DIAN: el impuesto del documento es la
 * suma de los impuestos de sus líneas (consolidado por tarifa) y la base
 * gravable solo suma las líneas que llevan IVA (las exentas al 0 % sí cuentan,
 * las excluidas no).
 */
export function calcularTotales(lineas: Linea[]): Totales {
  const totalesLineas = lineas.map(calcularLinea);
  const porTarifa = new Map<number, ImpuestoTotal>();
  let bruto = 0;
  let baseGravable = 0;
  let totalImpuestos = 0;

  lineas.forEach((l, i) => {
    const t = totalesLineas[i];
    bruto += t.neto;
    if (!l.iva) return;
    baseGravable += t.neto;
    totalImpuestos += t.iva;
    const acumulado = porTarifa.get(l.iva.tarifa) ?? { tarifa: l.iva.tarifa, base: 0, valor: 0 };
    acumulado.base += t.neto;
    acumulado.valor += t.iva;
    porTarifa.set(l.iva.tarifa, acumulado);
  });

  const impuestos = [...porTarifa.values()].sort((a, b) => b.tarifa - a.tarifa);
  const totalConImpuestos = bruto + totalImpuestos;
  return {
    lineas: totalesLineas,
    bruto,
    baseGravable,
    impuestos,
    totalImpuestos,
    totalConImpuestos,
    totalAPagar: totalConImpuestos,
  };
}
```

- [ ] **Step 9: Correr y ver que pasa**

Run: `npx vitest run --project unit src/modulos/factura-electronica/calculo.test.ts`
Expected: PASS (6 pruebas).

- [ ] **Step 10: Prueba que falla para `validacion`**

```ts
// src/modulos/factura-electronica/validacion.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { validarDocumento } from "./validacion";
import type { AdquirenteIdentificado, FacturaVenta, NotaCredito, Resolucion } from "./modelo";

const resolucion: Resolucion = {
  numero: "18760000001",
  prefijo: "SETP",
  desde: 990000000,
  hasta: 995000000,
  vigenciaDesde: "2026-01-01",
  vigenciaHasta: "2027-12-31",
};

const empresa: AdquirenteIdentificado = {
  tipo: "IDENTIFICADO",
  tipoDocumento: "31",
  numeroDocumento: "901249232",
  dv: "0",
  nombre: "NEXTPYME COLOMBIA SAS",
  tipoPersona: "JURIDICA",
  regimen: "48",
  responsabilidad: "R-99-PN",
  municipioDane: "23417",
  direccion: "CLL 18A 11 20",
};

const factura = (p: Partial<FacturaVenta> = {}): FacturaVenta => ({
  tipo: "FACTURA",
  prefijo: "SETP",
  numero: 990000001,
  resolucionNumero: "18760000001",
  fecha: "2026-11-20",
  hora: "10:00:00",
  adquirente: empresa,
  lineas: [
    {
      codigo: "MO1",
      descripcion: "Cambio de aceite",
      cantidad: 1,
      unidad: "94",
      precioUnitario: 8000000,
      descuento: 0,
      iva: { tarifa: 19 },
    },
  ],
  pago: { forma: "CONTADO", medio: "10", vencimiento: "2026-11-20" },
  enviarCorreo: false,
  ...p,
});

const ctx = { resolucion, hoy: "2026-11-20" };
const campos = (errores: { campo: string }[]) => errores.map((e) => e.campo);

describe("validarDocumento — factura", () => {
  it("una factura completa no tiene errores", () => {
    expect(validarDocumento(factura(), ctx)).toEqual([]);
  });

  it("exige al menos un concepto", () => {
    expect(campos(validarDocumento(factura({ lineas: [] }), ctx))).toContain("lineas");
  });

  it("revisa cantidad, decimales, precio y descuento de cada línea", () => {
    const base = factura().lineas[0];
    const errores = validarDocumento(
      factura({
        lineas: [
          { ...base, descripcion: " " },
          { ...base, cantidad: 0 },
          { ...base, cantidad: 1.234 },
          { ...base, precioUnitario: 10.5 },
          { ...base, descuento: 9000000 },
          { ...base, iva: { tarifa: 120 } },
        ],
      }),
      ctx,
    );
    expect(campos(errores)).toEqual([
      "lineas[0].descripcion",
      "lineas[1].cantidad",
      "lineas[2].cantidad",
      "lineas[3].precioUnitario",
      "lineas[4].descuento",
      "lineas[5].iva",
    ]);
  });

  it("revisa el DV del NIT y lo sugiere", () => {
    const errores = validarDocumento(factura({ adquirente: { ...empresa, dv: "7" } }), ctx);
    expect(errores).toEqual([
      { campo: "adquirente.dv", mensaje: "El dígito de verificación del NIT no corresponde (debería ser 0)." },
    ]);
    expect(campos(validarDocumento(factura({ adquirente: { ...empresa, dv: undefined } }), ctx))).toEqual([
      "adquirente.dv",
    ]);
  });

  it("exige documento, nombre, municipio y dirección del cliente", () => {
    const errores = validarDocumento(
      factura({ adquirente: { ...empresa, tipoDocumento: "13", dv: undefined, numeroDocumento: "", nombre: "", municipioDane: "", direccion: "" } }),
      ctx,
    );
    expect(campos(errores)).toEqual([
      "adquirente.numeroDocumento",
      "adquirente.nombre",
      "adquirente.municipioDane",
      "adquirente.direccion",
    ]);
  });

  it("no permite vender a crédito al consumidor final", () => {
    const errores = validarDocumento(
      factura({ adquirente: { tipo: "CONSUMIDOR_FINAL" }, pago: { forma: "CREDITO", medio: "1", vencimiento: "2026-12-20" } }),
      ctx,
    );
    expect(campos(errores)).toEqual(["pago.forma"]);
  });

  it("revisa resolución: existencia, prefijo, número de resolución, rango y vigencia", () => {
    expect(campos(validarDocumento(factura(), { hoy: "2026-11-20" }))).toEqual(["resolucion"]);
    expect(campos(validarDocumento(factura({ prefijo: "FE" }), ctx))).toEqual(["prefijo"]);
    expect(campos(validarDocumento(factura({ resolucionNumero: "1" }), ctx))).toEqual(["resolucionNumero"]);
    expect(validarDocumento(factura({ numero: 995000001 }), ctx)).toEqual([
      { campo: "numero", mensaje: "El número 995000001 está fuera del rango autorizado (990000000 a 995000000)." },
    ]);
    expect(validarDocumento(factura(), { resolucion, hoy: "2028-01-01" })).toEqual([
      { campo: "resolucion", mensaje: "La resolución de numeración venció el 2027-12-31." },
    ]);
    expect(campos(validarDocumento(factura(), { resolucion, hoy: "2025-12-31" }))).toEqual(["resolucion"]);
  });

  it("exige total mayor que cero", () => {
    const base = factura().lineas[0];
    expect(campos(validarDocumento(factura({ lineas: [{ ...base, precioUnitario: 0 }] }), ctx))).toEqual([
      "total",
    ]);
  });
});

describe("validarDocumento — nota crédito", () => {
  const nota = (p: Partial<NotaCredito> = {}): NotaCredito => {
    const { tipo: _t, resolucionNumero: _r, ...resto } = factura();
    return {
      ...resto,
      tipo: "NOTA_CREDITO",
      prefijo: "NC",
      numero: 1,
      concepto: "2",
      motivo: "Anulación de la factura",
      facturaReferencia: { numeroCompleto: "SETP990000001", cufe: "abc123", fecha: "2026-11-20" },
      ...p,
    };
  };

  it("una nota completa no tiene errores y no exige resolución", () => {
    expect(validarDocumento(nota(), { hoy: "2026-11-20" })).toEqual([]);
  });

  it("exige CUFE de la factura y motivo", () => {
    const errores = validarDocumento(
      nota({ motivo: "", facturaReferencia: { numeroCompleto: "SETP990000001", cufe: "", fecha: "2026-11-20" } }),
      { hoy: "2026-11-20" },
    );
    expect(campos(errores)).toEqual(["motivo", "facturaReferencia.cufe"]);
  });
});
```

- [ ] **Step 11: Correr y ver que falla**

Run: `npx vitest run --project unit src/modulos/factura-electronica/validacion.test.ts`
Expected: FAIL — no se encuentra `./validacion`.

- [ ] **Step 12: Implementar `validacion.ts`**

```ts
// src/modulos/factura-electronica/validacion.ts
import { calcularLinea, calcularTotales } from "./calculo";
import { calcularDvNit } from "./dv-nit";
import type { DocumentoElectronico, ErrorValidacion, Resolucion } from "./modelo";

export interface ContextoValidacion {
  /** Obligatoria para facturas; las notas crédito no la usan. */
  resolucion?: Resolucion;
  /** YYYY-MM-DD (hoy en Colombia). */
  hoy: string;
}

const tieneMaxDosDecimales = (n: number) => Math.abs(Math.round(n * 100) - n * 100) < 1e-9;

/** Revisa el documento antes de enviarlo. Lista vacía = listo para enviar. */
export function validarDocumento(doc: DocumentoElectronico, ctx: ContextoValidacion): ErrorValidacion[] {
  const errores: ErrorValidacion[] = [];
  const error = (campo: string, mensaje: string) => errores.push({ campo, mensaje });

  // Líneas
  if (doc.lineas.length === 0) error("lineas", "El documento no tiene ningún concepto.");
  doc.lineas.forEach((l, i) => {
    const c = `lineas[${i}]`;
    if (!l.descripcion.trim()) error(`${c}.descripcion`, `El concepto ${i + 1} no tiene descripción.`);
    else if (!(l.cantidad > 0)) error(`${c}.cantidad`, `La cantidad del concepto ${i + 1} debe ser mayor que cero.`);
    else if (!tieneMaxDosDecimales(l.cantidad))
      error(`${c}.cantidad`, `La cantidad del concepto ${i + 1} puede tener máximo dos decimales.`);
    else if (!Number.isInteger(l.precioUnitario) || l.precioUnitario < 0)
      error(`${c}.precioUnitario`, `El precio del concepto ${i + 1} no es válido.`);
    else if (!Number.isInteger(l.descuento) || l.descuento < 0 || l.descuento > calcularLinea(l).bruto)
      error(`${c}.descuento`, `El descuento del concepto ${i + 1} no puede ser mayor que su valor.`);
    else if (l.iva && (l.iva.tarifa < 0 || l.iva.tarifa > 100))
      error(`${c}.iva`, `La tarifa de IVA del concepto ${i + 1} no es válida.`);
  });

  // Adquirente
  const a = doc.adquirente;
  if (a.tipo === "IDENTIFICADO") {
    if (!a.numeroDocumento.trim()) error("adquirente.numeroDocumento", "Falta el número de documento del cliente.");
    else if (a.tipoDocumento === "31") {
      if (!/^\d{1,15}$/.test(a.numeroDocumento.replace(/[.\s-]/g, ""))) {
        error("adquirente.numeroDocumento", "El NIT del cliente solo puede tener números.");
      } else {
        const esperado = calcularDvNit(a.numeroDocumento);
        if (!a.dv) error("adquirente.dv", "Falta el dígito de verificación del NIT del cliente.");
        else if (a.dv !== esperado)
          error("adquirente.dv", `El dígito de verificación del NIT no corresponde (debería ser ${esperado}).`);
      }
    }
    if (!a.nombre.trim()) error("adquirente.nombre", "Falta el nombre o razón social del cliente.");
    if (!/^\d{5}$/.test(a.municipioDane)) error("adquirente.municipioDane", "Falta el municipio del cliente.");
    if (!a.direccion.trim()) error("adquirente.direccion", "Falta la dirección del cliente.");
  } else if (doc.pago.forma === "CREDITO") {
    error("pago.forma", "No se puede vender a crédito al consumidor final. Identifica al cliente o cambia a contado.");
  }

  // Específico por tipo
  if (doc.tipo === "FACTURA") {
    const r = ctx.resolucion;
    if (!r) {
      error("resolucion", "No hay resolución de numeración configurada.");
    } else {
      if (doc.prefijo !== r.prefijo)
        error("prefijo", `El prefijo ${doc.prefijo} no es el de la resolución (${r.prefijo}).`);
      if (doc.resolucionNumero !== r.numero)
        error("resolucionNumero", "El número de resolución no coincide con el configurado.");
      if (doc.numero < r.desde || doc.numero > r.hasta)
        error("numero", `El número ${doc.numero} está fuera del rango autorizado (${r.desde} a ${r.hasta}).`);
      if (ctx.hoy > r.vigenciaHasta) error("resolucion", `La resolución de numeración venció el ${r.vigenciaHasta}.`);
      else if (ctx.hoy < r.vigenciaDesde)
        error("resolucion", `La resolución de numeración rige desde el ${r.vigenciaDesde}.`);
    }
    if (doc.lineas.length > 0 && errores.length === 0 && calcularTotales(doc.lineas).totalAPagar <= 0)
      error("total", "El total de la factura debe ser mayor que cero.");
  } else {
    if (!doc.motivo.trim()) error("motivo", "Escribe el motivo de la nota crédito.");
    if (!doc.facturaReferencia.cufe.trim())
      error("facturaReferencia.cufe", "Falta el CUFE de la factura que se va a corregir.");
  }

  return errores;
}
```

Nota: el total solo se revisa si no hubo otros errores, para no repetir el mismo problema con dos mensajes.

- [ ] **Step 13: Correr y ver que pasa**

Run: `npx vitest run --project unit src/modulos/factura-electronica/validacion.test.ts`
Expected: PASS (10 pruebas).

- [ ] **Step 14: `index.ts` y regla de frontera en ESLint**

```ts
// src/modulos/factura-electronica/index.ts
export * from "./modelo";
export { aTextoDecimal } from "./dinero";
export { calcularDvNit } from "./dv-nit";
export { calcularLinea, calcularTotales } from "./calculo";
export { validarDocumento, type ContextoValidacion } from "./validacion";
```

En `eslint.config.mjs`, agregar este bloque **después** del bloque de `rules` existente y **antes** de `globalIgnores([...])`:

```js
  // Núcleo de factura electrónica: reutilizable fuera de TorqueFlow, no puede
  // depender de la app (ver docs/superpowers/specs/2026-11-20-factura-electronica-design.md).
  {
    files: ["src/modulos/factura-electronica/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/*", "**/lib/**", "**/app/**", "**/components/**", "**/generated/**"],
              message: "El núcleo de factura electrónica no puede importar código de la app.",
            },
            {
              group: ["next", "next/*", "react", "react-dom", "@prisma/*"],
              message: "El núcleo de factura electrónica solo usa TypeScript, fetch y Web Crypto.",
            },
          ],
        },
      ],
    },
  },
```

- [ ] **Step 15: Probar que la frontera funciona**

Crear temporalmente `src/modulos/factura-electronica/_frontera.ts` con:

```ts
import { cn } from "@/lib/utils";
export const x = cn;
```

Run: `npx eslint src/modulos/factura-electronica/_frontera.ts`
Expected: error `no-restricted-imports` con el mensaje "El núcleo de factura electrónica no puede importar código de la app."

Luego borrar el archivo: `rm src/modulos/factura-electronica/_frontera.ts`

- [ ] **Step 16: Verificación de la tarea**

Run: `npx tsc --noEmit && npx vitest run --project unit src/modulos/factura-electronica && npx eslint src/modulos/factura-electronica eslint.config.mjs`
Expected: sin errores de tipos, 21 pruebas en verde, ESLint limpio.

- [ ] **Step 17: Commit y push**

```bash
git add src/modulos/factura-electronica eslint.config.mjs
git commit -m "fase-fe-task 1: núcleo de factura electrónica (modelo, cálculo, validación y frontera)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 2: Mensajes DIAN, contrato del proveedor y proveedor simulado

**Files:**
- Create: `src/modulos/factura-electronica/mensajes-dian.ts`
- Create: `src/modulos/factura-electronica/proveedor.ts`
- Create: `src/modulos/factura-electronica/proveedores/simulado.ts`
- Modify: `src/modulos/factura-electronica/index.ts`
- Test: `src/modulos/factura-electronica/mensajes-dian.test.ts`, `src/modulos/factura-electronica/proveedores/simulado.test.ts`

**Interfaces:**
- Consumes: `MensajeDian`, `DocumentoElectronico` (Task 1).
- Produces:
  - `traducirMensajeDian(texto: string): MensajeDian`
  - `traducirMensajesDian(textos: string | string[] | null | undefined): MensajeDian[]`
  - `esDocumentoYaProcesado(motivos: MensajeDian[]): boolean`
  - `ReferenciaDocumento`, `ResultadoEnvio`, `ResultadoConsulta`, `ResultadoConexion`, `FormatoArchivo`, `ProveedorFacturaElectronica`, clase `ErrorProveedor`
  - `ResultadoSimulado = "ACEPTAR" | "RECHAZAR" | "CAIDA"`, `crearProveedorSimulado(opciones?: { resultado?: ResultadoSimulado }): ProveedorFacturaElectronica`

- [ ] **Step 1: Prueba que falla para `mensajes-dian`**

```ts
// src/modulos/factura-electronica/mensajes-dian.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { esDocumentoYaProcesado, traducirMensajeDian, traducirMensajesDian } from "./mensajes-dian";

describe("traducirMensajeDian", () => {
  it("separa regla, tipo y texto, y explica las reglas conocidas", () => {
    const m = traducirMensajeDian(
      "Regla: FAU02, Rechazo: El Valor Bruto antes de tributos no es igual a la suma de los valores de las líneas de la factura que contienen el valor comercial",
    );
    expect(m.codigo).toBe("FAU02");
    expect(m.tipo).toBe("RECHAZO");
    expect(m.textoDian).toMatch(/^El Valor Bruto/);
    expect(m.explicacion).toBe("El valor antes de impuestos no coincide con la suma de los conceptos.");
    expect(m.comoCorregir).toMatch(/cantidades, precios y descuentos/);
  });

  it("reconoce notificaciones con o sin tilde", () => {
    expect(traducirMensajeDian("Regla: RUT01, Notificación: La validación del estado del RUT próximamente estará disponible.").tipo).toBe(
      "NOTIFICACION",
    );
    expect(traducirMensajeDian("Regla: CBF04, Notificacion: La Descripción informada no se encuentra en la lista").tipo).toBe(
      "NOTIFICACION",
    );
  });

  it("una regla desconocida conserva el texto de la DIAN como explicación", () => {
    const m = traducirMensajeDian("Regla: ZZZ99, Rechazo: Algo nuevo");
    expect(m).toEqual({
      codigo: "ZZZ99",
      tipo: "RECHAZO",
      textoDian: "Algo nuevo",
      explicacion: "Algo nuevo",
      comoCorregir: null,
    });
  });

  it("un texto sin formato de regla se trata como rechazo sin código", () => {
    expect(traducirMensajeDian("El campo es requerido.")).toEqual({
      codigo: null,
      tipo: "RECHAZO",
      textoDian: "El campo es requerido.",
      explicacion: "El campo es requerido.",
      comoCorregir: null,
    });
  });
});

describe("traducirMensajesDian", () => {
  it("acepta texto suelto, lista o vacío", () => {
    expect(traducirMensajesDian(null)).toEqual([]);
    expect(traducirMensajesDian("Regla: 90, Rechazo: Documento procesado anteriormente.")).toHaveLength(1);
    expect(traducirMensajesDian(["Regla: FAU04, Rechazo: x", "Regla: FAU14, Rechazo: y"]).map((m) => m.codigo)).toEqual([
      "FAU04",
      "FAU14",
    ]);
  });
});

describe("esDocumentoYaProcesado", () => {
  it("detecta la Regla 90", () => {
    expect(esDocumentoYaProcesado(traducirMensajesDian("Regla: 90, Rechazo: Documento procesado anteriormente."))).toBe(true);
    expect(esDocumentoYaProcesado(traducirMensajesDian("Regla: FAU14, Rechazo: x"))).toBe(false);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run --project unit src/modulos/factura-electronica/mensajes-dian.test.ts`
Expected: FAIL — no se encuentra `./mensajes-dian`.

- [ ] **Step 3: Implementar `mensajes-dian.ts`**

```ts
// src/modulos/factura-electronica/mensajes-dian.ts
import type { MensajeDian } from "./modelo";

const CATALOGO: Record<string, { explicacion: string; comoCorregir: string | null }> = {
  FAU02: {
    explicacion: "El valor antes de impuestos no coincide con la suma de los conceptos.",
    comoCorregir: "Revisa cantidades, precios y descuentos de cada concepto y vuelve a enviar.",
  },
  FAU04: {
    explicacion: "La base del IVA no coincide con la suma de las bases de los conceptos.",
    comoCorregir: "Revisa la tarifa de IVA de cada concepto y vuelve a enviar.",
  },
  FAU14: {
    explicacion: "El total a pagar no coincide con el valor antes de impuestos más los impuestos.",
    comoCorregir: "Revisa descuentos e impuestos de la factura y vuelve a enviar.",
  },
  "90": {
    explicacion: "La DIAN ya había recibido un documento con este mismo número.",
    comoCorregir: null,
  },
  RUT01: {
    explicacion: "La DIAN todavía no valida el estado del RUT. Es solo un aviso.",
    comoCorregir: null,
  },
  CBF04: {
    explicacion: "La DIAN avisa que la descripción del motivo no está en su lista. Es solo un aviso.",
    comoCorregir: null,
  },
};

const PATRON = /^\s*Regla:\s*([^,]+),\s*(Rechazo|Notificaci[oó]n):\s*([\s\S]*)$/i;

export function traducirMensajeDian(texto: string): MensajeDian {
  const limpio = texto.trim();
  const m = PATRON.exec(limpio);
  if (!m) {
    return { codigo: null, tipo: "RECHAZO", textoDian: limpio, explicacion: limpio, comoCorregir: null };
  }
  const codigo = m[1].trim();
  const tipo = /^rechazo$/i.test(m[2]) ? "RECHAZO" : "NOTIFICACION";
  const textoDian = m[3].trim();
  const conocido = CATALOGO[codigo];
  return {
    codigo,
    tipo,
    textoDian,
    explicacion: conocido?.explicacion ?? textoDian,
    comoCorregir: conocido?.comoCorregir ?? null,
  };
}

export function traducirMensajesDian(textos: string | string[] | null | undefined): MensajeDian[] {
  if (!textos) return [];
  const lista = Array.isArray(textos) ? textos : [textos];
  return lista.filter((t) => t.trim()).map(traducirMensajeDian);
}

/** Regla 90: la DIAN ya tiene un documento con ese número (reenvío tras una caída). */
export function esDocumentoYaProcesado(motivos: MensajeDian[]): boolean {
  return motivos.some((m) => m.codigo === "90");
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run --project unit src/modulos/factura-electronica/mensajes-dian.test.ts`
Expected: PASS (6 pruebas).

- [ ] **Step 5: Escribir el contrato `proveedor.ts`** (solo tipos; lo prueban sus implementaciones)

```ts
// src/modulos/factura-electronica/proveedor.ts
import type { DocumentoElectronico, MensajeDian } from "./modelo";

export interface ReferenciaDocumento {
  tipo: "FACTURA" | "NOTA_CREDITO";
  prefijo: string;
  numero: number;
  cufe?: string;
}

export type ResultadoEnvio =
  | { estado: "ACEPTADO"; cufe: string; fechaValidacion: string; advertencias: MensajeDian[] }
  /** Rechazo de la DIAN o validación del proveedor: corregir y reenviar con el mismo número. */
  | { estado: "RECHAZADO"; motivos: MensajeDian[] }
  /** Caída, tiempo agotado o error 5xx: puede que la DIAN sí lo haya recibido. */
  | { estado: "ERROR_TEMPORAL"; mensaje: string }
  /** Token inválido o sin permiso: seguro no llegó a la DIAN. */
  | { estado: "ERROR_CONFIGURACION"; mensaje: string };

export type ResultadoConsulta = ResultadoEnvio | { estado: "NO_ENCONTRADO" };

export type ResultadoConexion = { ok: true } | { ok: false; mensaje: string };

export type FormatoArchivo = "PDF" | "XML";

export interface ProveedorFacturaElectronica {
  enviar(doc: DocumentoElectronico): Promise<ResultadoEnvio>;
  consultarEstado(ref: ReferenciaDocumento): Promise<ResultadoConsulta>;
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

- [ ] **Step 6: Prueba que falla para el proveedor simulado**

```ts
// src/modulos/factura-electronica/proveedores/simulado.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { crearProveedorSimulado } from "./simulado";
import type { FacturaVenta } from "../modelo";

const factura: FacturaVenta = {
  tipo: "FACTURA",
  prefijo: "SETP",
  numero: 990000001,
  resolucionNumero: "18760000001",
  fecha: "2026-11-20",
  hora: "10:00:00",
  adquirente: { tipo: "CONSUMIDOR_FINAL" },
  lineas: [
    { codigo: "A", descripcion: "Aceite", cantidad: 1, unidad: "94", precioUnitario: 5000000, descuento: 0, iva: { tarifa: 19 } },
  ],
  pago: { forma: "CONTADO", medio: "10", vencimiento: "2026-11-20" },
  enviarCorreo: false,
};
const ref = { tipo: "FACTURA" as const, prefijo: "SETP", numero: 990000001 };

describe("proveedor simulado", () => {
  it("por defecto acepta con un CUFE de 96 caracteres hexadecimales, siempre el mismo para el mismo número", async () => {
    const r1 = await crearProveedorSimulado().enviar(factura);
    const r2 = await crearProveedorSimulado().enviar(factura);
    expect(r1.estado).toBe("ACEPTADO");
    if (r1.estado !== "ACEPTADO" || r2.estado !== "ACEPTADO") return;
    expect(r1.cufe).toMatch(/^[0-9a-f]{96}$/);
    expect(r1.cufe).toBe(r2.cufe);
    expect(r1.fechaValidacion).toBe("2026-11-20T10:00:00-05:00");
  });

  it("reenviar el mismo número en la misma instancia devuelve la Regla 90", async () => {
    const p = crearProveedorSimulado();
    await p.enviar(factura);
    const r = await p.enviar(factura);
    expect(r.estado).toBe("RECHAZADO");
    if (r.estado === "RECHAZADO") expect(r.motivos[0].codigo).toBe("90");
  });

  it("consulta: encuentra lo aceptado y responde NO_ENCONTRADO para lo demás", async () => {
    const p = crearProveedorSimulado();
    expect(await p.consultarEstado(ref)).toEqual({ estado: "NO_ENCONTRADO" });
    await p.enviar(factura);
    expect((await p.consultarEstado(ref)).estado).toBe("ACEPTADO");
  });

  it("se puede forzar rechazo o caída", async () => {
    const rechazo = await crearProveedorSimulado({ resultado: "RECHAZAR" }).enviar(factura);
    expect(rechazo.estado).toBe("RECHAZADO");
    if (rechazo.estado === "RECHAZADO") expect(rechazo.motivos[0].codigo).toBe("FAU14");

    const caida = crearProveedorSimulado({ resultado: "CAIDA" });
    expect((await caida.enviar(factura)).estado).toBe("ERROR_TEMPORAL");
    expect((await caida.probarConexion()).ok).toBe(false);
  });

  it("descarga un PDF y un XML marcados como simulados", async () => {
    const p = crearProveedorSimulado();
    const pdf = new TextDecoder().decode(await p.descargar(ref, "PDF"));
    const xml = new TextDecoder().decode(await p.descargar(ref, "XML"));
    expect(pdf.startsWith("%PDF-")).toBe(true);
    expect(pdf).toMatch(/sin validez fiscal/);
    expect(xml).toMatch(/SETP990000001/);
  });

  it("la prueba de conexión responde bien", async () => {
    expect(await crearProveedorSimulado().probarConexion()).toEqual({ ok: true });
  });
});
```

- [ ] **Step 7: Correr y ver que falla**

Run: `npx vitest run --project unit src/modulos/factura-electronica/proveedores/simulado.test.ts`
Expected: FAIL — no se encuentra `./simulado`.

- [ ] **Step 8: Implementar `proveedores/simulado.ts`**

```ts
// src/modulos/factura-electronica/proveedores/simulado.ts
import { traducirMensajesDian } from "../mensajes-dian";
import type { DocumentoElectronico } from "../modelo";
import type { ProveedorFacturaElectronica, ReferenciaDocumento } from "../proveedor";

export type ResultadoSimulado = "ACEPTAR" | "RECHAZAR" | "CAIDA";

const clave = (r: { tipo: string; prefijo: string; numero: number }) => `${r.tipo}:${r.prefijo}${r.numero}`;

async function cufeSimulado(texto: string): Promise<string> {
  const huella = await crypto.subtle.digest("SHA-384", new TextEncoder().encode(`simulado:${texto}`));
  return [...new Uint8Array(huella)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Proveedor falso para desarrollo y demostraciones: no habla con nadie.
 * Recuerda lo aceptado solo mientras viva la instancia.
 */
export function crearProveedorSimulado(opciones: { resultado?: ResultadoSimulado } = {}): ProveedorFacturaElectronica {
  const resultado = opciones.resultado ?? "ACEPTAR";
  const aceptados = new Map<string, { cufe: string; fechaValidacion: string }>();

  return {
    async enviar(doc: DocumentoElectronico) {
      if (resultado === "CAIDA") {
        return { estado: "ERROR_TEMPORAL", mensaje: "Simulación: el servicio de la DIAN no respondió." };
      }
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
      const aceptado = { cufe: await cufeSimulado(k), fechaValidacion: `${doc.fecha}T${doc.hora}-05:00` };
      aceptados.set(k, aceptado);
      return { estado: "ACEPTADO", ...aceptado, advertencias: [] };
    },

    async consultarEstado(ref: ReferenciaDocumento) {
      const a = aceptados.get(clave(ref));
      return a ? { estado: "ACEPTADO", ...a, advertencias: [] } : { estado: "NO_ENCONTRADO" };
    },

    async descargar(ref: ReferenciaDocumento, formato) {
      const numero = `${ref.prefijo}${ref.numero}`;
      const texto =
        formato === "PDF"
          ? `%PDF-1.4\n% Documento simulado ${numero} - sin validez fiscal\n%%EOF\n`
          : `<?xml version="1.0" encoding="UTF-8"?>\n<DocumentoSimulado numero="${numero}" validezFiscal="no"/>\n`;
      return new TextEncoder().encode(texto);
    },

    async probarConexion() {
      return resultado === "CAIDA" ? { ok: false, mensaje: "Simulación: sin conexión con el proveedor." } : { ok: true };
    },
  };
}
```

- [ ] **Step 9: Correr y ver que pasa**

Run: `npx vitest run --project unit src/modulos/factura-electronica/proveedores/simulado.test.ts`
Expected: PASS (6 pruebas).

- [ ] **Step 10: Exportar desde `index.ts`** — agregar al final:

```ts
export { traducirMensajeDian, traducirMensajesDian, esDocumentoYaProcesado } from "./mensajes-dian";
export {
  ErrorProveedor,
  type ProveedorFacturaElectronica,
  type ReferenciaDocumento,
  type ResultadoEnvio,
  type ResultadoConsulta,
  type ResultadoConexion,
  type FormatoArchivo,
} from "./proveedor";
export { crearProveedorSimulado, type ResultadoSimulado } from "./proveedores/simulado";
```

- [ ] **Step 11: Verificación de la tarea**

Run: `npx tsc --noEmit && npx vitest run --project unit src/modulos/factura-electronica && npx eslint src/modulos/factura-electronica`
Expected: sin errores; 33 pruebas en verde.

- [ ] **Step 12: Commit y push**

```bash
git add src/modulos/factura-electronica
git commit -m "fase-fe-task 2: mensajes DIAN, contrato del proveedor y proveedor simulado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 3: Catálogos y adaptador Nextpyme

Fuente de todo lo de esta tarea: la documentación pública https://developers.nextpyme.plus
(base `https://api.nextpyme.plus/api/ubl2.1`, `Authorization: Bearer {token}`, `Accept: application/json`).

| Acción | Método y ruta |
|---|---|
| Factura | `POST /invoice` |
| Nota crédito | `POST /credit-note` |
| Estado por CUFE | `POST /status/document/{cufe}` |
| Descarga | `GET /download/{nit}/{archivo}` — `FES-{prefijo}{numero}.pdf/.xml` (factura), `NCS-{prefijo}{numero}.pdf/.xml` (nota crédito) |
| Probar conexión | `GET /config/company` |

**Files:**
- Create: `scripts/generar-catalogos-nextpyme.mjs`
- Create (generados por el script): `src/modulos/factura-electronica/catalogos/municipios.json`, `src/modulos/factura-electronica/proveedores/nextpyme/catalogos.json`
- Create: `src/modulos/factura-electronica/proveedores/nextpyme/catalogos.ts`
- Create: `src/modulos/factura-electronica/proveedores/nextpyme/mapear.ts`
- Create: `src/modulos/factura-electronica/proveedores/nextpyme/interpretar.ts`
- Create: `src/modulos/factura-electronica/proveedores/nextpyme/proveedor.ts`
- Create: `src/modulos/factura-electronica/proveedores/nextpyme/__fixtures__/factura-aceptada.json`, `factura-rechazada.json`, `error-422.json`, `estado-aceptado.json`
- Create: `src/modulos/factura-electronica/fabrica.ts`
- Modify: `src/modulos/factura-electronica/index.ts`
- Test: `proveedores/nextpyme/mapear.test.ts`, `proveedores/nextpyme/interpretar.test.ts`, `proveedores/nextpyme/proveedor.test.ts`, `fabrica.test.ts`

**Interfaces:**
- Consumes: todo lo de las tareas 1 y 2.
- Produces:
  - `MUNICIPIOS: { codigo: string; nombre: string; departamento: string }[]` (exportado desde `index.ts`, para el buscador de municipios del Plan 2)
  - `mapearDocumentoNextpyme(doc: DocumentoElectronico): Record<string, unknown>`
  - `interpretarRespuestaEnvio(status: number, cuerpo: unknown): ResultadoEnvio`
  - `interpretarRespuestaEstado(status: number, cuerpo: unknown, cufe: string): ResultadoConsulta`
  - `OpcionesNextpyme = { token: string; nitEmisor: string; baseUrl?: string; timeoutMs?: number; fetch?: typeof fetch }`
  - `crearProveedorNextpyme(op: OpcionesNextpyme): ProveedorFacturaElectronica`
  - `Ambiente = "SIMULADO" | "PRUEBAS" | "PRODUCCION"`, `crearProveedor(config: ConfigProveedor): ProveedorFacturaElectronica` con `ConfigProveedor = { ambiente: Ambiente; resultadoSimulado?: ResultadoSimulado; nextpyme?: OpcionesNextpyme }`

- [ ] **Step 1: Escribir el generador de catálogos**

```js
// scripts/generar-catalogos-nextpyme.mjs
// Uso: node scripts/generar-catalogos-nextpyme.mjs
// Lee las tablas maestras públicas de Nextpyme (https://developers.nextpyme.plus/docs/tables)
// y escribe:
//   src/modulos/factura-electronica/catalogos/municipios.json          (núcleo: DANE + nombre)
//   src/modulos/factura-electronica/proveedores/nextpyme/catalogos.json (código DIAN → ID Nextpyme)
// Volver a correrlo si Nextpyme cambia sus tablas.
import { mkdir, writeFile } from "node:fs/promises";

const URL_TABLAS = "https://developers.nextpyme.plus/docs/tables";
const html = await (await fetch(URL_TABLAS)).text();
const coincidencia = html.match(/data-page="([^"]*)"/);
if (!coincidencia) throw new Error(`No se encontraron las tablas en ${URL_TABLAS}`);

const decodificar = (s) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
const tablas = JSON.parse(decodificar(coincidencia[1])).props.tables;

const tabla = (nombre) => {
  const t = tablas.find((x) => x.database_name === nombre);
  if (!t) throw new Error(`Falta la tabla ${nombre}`);
  return t.content;
};
const porCodigo = (nombre) =>
  Object.fromEntries(tabla(nombre).map((r) => [String(r.code).trim(), r.id]));

const departamentos = Object.fromEntries(tabla("departments").map((d) => [d.id, d.name.trim()]));
const municipios = tabla("municipalities")
  .map((r) => ({ codigo: String(r.code).trim(), nombre: r.name.trim(), departamento: departamentos[r.department_id] ?? "" }))
  .sort((a, b) => a.codigo.localeCompare(b.codigo));

const catalogos = {
  fuente: URL_TABLAS,
  municipios: porCodigo("municipalities"),
  tiposDocumentoIdentidad: porCodigo("type_document_identifications"),
  tributos: porCodigo("taxes"),
  unidades: porCodigo("unit_measures"),
  mediosPago: porCodigo("payment_methods"),
  formasPago: porCodigo("payment_forms"),
  responsabilidades: porCodigo("type_liabilities"),
  regimenes: porCodigo("type_regimes"),
  tiposOrganizacion: porCodigo("type_organizations"),
  conceptosNotaCredito: porCodigo("credit_note_discrepancy_responses"),
};

const raiz = "src/modulos/factura-electronica";
await mkdir(`${raiz}/catalogos`, { recursive: true });
await mkdir(`${raiz}/proveedores/nextpyme`, { recursive: true });
await writeFile(`${raiz}/catalogos/municipios.json`, JSON.stringify(municipios, null, 1) + "\n");
await writeFile(`${raiz}/proveedores/nextpyme/catalogos.json`, JSON.stringify(catalogos, null, 1) + "\n");
console.log(`Municipios: ${municipios.length}. Catálogos: ${Object.keys(catalogos).length - 1}.`);
```

- [ ] **Step 2: Generar y revisar los catálogos**

Run: `node scripts/generar-catalogos-nextpyme.mjs`
Expected: `Municipios: 1122. Catálogos: 10.`

Comprobar valores conocidos (si alguno no coincide, **parar y reportar**: Nextpyme cambió sus tablas):

Run: `node -e "const c=require('./src/modulos/factura-electronica/proveedores/nextpyme/catalogos.json');console.log(c.municipios['05001'],c.municipios['11001'],c.tiposDocumentoIdentidad['13'],c.tiposDocumentoIdentidad['31'],c.tributos['01'],c.unidades['94'],c.mediosPago['10'],c.regimenes['48'],c.responsabilidades['R-99-PN'],c.conceptosNotaCredito['2'])"`
Expected: `1 149 3 6 1 70 10 1 117 2`

Anotar además los valores de `c.unidades['HUR']` (se espera `730`) y `c.mediosPago['47']` (se espera `47`); la prueba de `mapear` (Step 4) los usa. Si difieren, la prueba se ajusta al valor generado: el catálogo manda.

- [ ] **Step 3: Escribir `catalogos.ts`**

```ts
// src/modulos/factura-electronica/proveedores/nextpyme/catalogos.ts
import datos from "./catalogos.json";

type NombreCatalogo = Exclude<keyof typeof datos, "fuente">;

const NOMBRES: Record<NombreCatalogo, string> = {
  municipios: "municipio",
  tiposDocumentoIdentidad: "tipo de documento",
  tributos: "impuesto",
  unidades: "unidad de medida",
  mediosPago: "medio de pago",
  formasPago: "forma de pago",
  responsabilidades: "responsabilidad fiscal",
  regimenes: "régimen de IVA",
  tiposOrganizacion: "tipo de persona",
  conceptosNotaCredito: "concepto de nota crédito",
};

/** Código DIAN → ID de Nextpyme. Lanza si el código no existe en sus tablas. */
export function idNextpyme(catalogo: NombreCatalogo, codigoDian: string): number {
  const id = (datos[catalogo] as Record<string, number>)[codigoDian];
  if (id === undefined) {
    throw new Error(`Nextpyme no reconoce el ${NOMBRES[catalogo]} con código DIAN "${codigoDian}".`);
  }
  return id;
}
```

- [ ] **Step 4: Prueba que falla para `mapear`**

```ts
// src/modulos/factura-electronica/proveedores/nextpyme/mapear.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mapearDocumentoNextpyme } from "./mapear";
import type { AdquirenteIdentificado, FacturaVenta, NotaCredito } from "../../modelo";

const cliente: AdquirenteIdentificado = {
  tipo: "IDENTIFICADO",
  tipoDocumento: "31",
  numeroDocumento: "901249232",
  dv: "0",
  nombre: "NEXTPYME COLOMBIA SAS",
  tipoPersona: "JURIDICA",
  regimen: "48",
  responsabilidad: "R-99-PN",
  municipioDane: "23417",
  direccion: "CLL 18A 11 20",
  telefono: "3017882489",
  email: "soporte@nextpyme.plus",
};

const factura: FacturaVenta = {
  tipo: "FACTURA",
  prefijo: "SETP",
  numero: 990000001,
  resolucionNumero: "18760000001",
  fecha: "2026-11-20",
  hora: "10:30:00",
  adquirente: cliente,
  lineas: [
    { codigo: "MO1", descripcion: "Mano de obra", cantidad: 1.5, unidad: "HUR", precioUnitario: 6000000, descuento: 1000000, iva: { tarifa: 19 } },
    { codigo: "R1", descripcion: "Filtro", cantidad: 1, unidad: "94", precioUnitario: 2000000, descuento: 0, iva: null },
  ],
  pago: { forma: "CREDITO", medio: "47", vencimiento: "2026-12-20" },
  enviarCorreo: true,
};

describe("mapearDocumentoNextpyme — factura", () => {
  const json = mapearDocumentoNextpyme(factura);

  it("encabezado, cliente y forma de pago con IDs de Nextpyme", () => {
    expect(json).toMatchObject({
      type_document_id: 1,
      date: "2026-11-20",
      time: "10:30:00",
      prefix: "SETP",
      number: 990000001,
      resolution_number: "18760000001",
      sendmail: true,
      customer: {
        identification_number: "901249232",
        dv: "0",
        name: "NEXTPYME COLOMBIA SAS",
        phone: "3017882489",
        address: "CLL 18A 11 20",
        email: "soporte@nextpyme.plus",
        merchant_registration: "0000000-00",
        type_document_identification_id: 6,
        type_organization_id: 1,
        type_liability_id: 117,
        municipality_id: 439,
        type_regime_id: 1,
      },
      payment_form: { payment_form_id: 2, payment_method_id: 47, payment_due_date: "2026-12-20", duration_measure: "30" },
    });
  });

  it("totales en texto con dos decimales; la línea excluida no entra en la base", () => {
    // MO: 60.000 × 1,5 = 90.000 − 10.000 = 80.000; IVA 15.200. Filtro: 20.000 sin IVA.
    expect(json.legal_monetary_totals).toEqual({
      line_extension_amount: "100000.00",
      tax_exclusive_amount: "80000.00",
      tax_inclusive_amount: "115200.00",
      allowance_total_amount: "0.00",
      charge_total_amount: "0.00",
      payable_amount: "115200.00",
    });
    expect(json.tax_totals).toEqual([{ tax_id: 1, tax_amount: "15200.00", percent: "19.00", taxable_amount: "80000.00" }]);
  });

  it("líneas con descuento, IVA y unidad", () => {
    expect(json.invoice_lines).toEqual([
      {
        unit_measure_id: 730,
        invoiced_quantity: "1.50",
        line_extension_amount: "80000.00",
        free_of_charge_indicator: false,
        allowance_charges: [
          { charge_indicator: false, allowance_charge_reason: "DESCUENTO", amount: "10000.00", base_amount: "90000.00" },
        ],
        tax_totals: [{ tax_id: 1, tax_amount: "15200.00", percent: "19.00", taxable_amount: "80000.00" }],
        description: "Mano de obra",
        code: "MO1",
        type_item_identification_id: 4,
        price_amount: "60000.00",
        base_quantity: "1.00",
      },
      {
        unit_measure_id: 70,
        invoiced_quantity: "1.00",
        line_extension_amount: "20000.00",
        free_of_charge_indicator: false,
        description: "Filtro",
        code: "R1",
        type_item_identification_id: 4,
        price_amount: "20000.00",
        base_quantity: "1.00",
      },
    ]);
  });

  it("consumidor final: solo los tres campos y sin correo", () => {
    const cf = mapearDocumentoNextpyme({
      ...factura,
      adquirente: { tipo: "CONSUMIDOR_FINAL" },
      pago: { forma: "CONTADO", medio: "10", vencimiento: "2026-11-20" },
    });
    expect(cf.customer).toEqual({ identification_number: 222222222222, name: "CONSUMIDOR FINAL", merchant_registration: "0000000-00" });
    expect(cf.sendmail).toBe(false);
    expect(cf.payment_form).toMatchObject({ payment_form_id: 1, payment_method_id: 10, duration_measure: "0" });
  });

  it("sin líneas con IVA no envía tax_totals", () => {
    const sinIva = mapearDocumentoNextpyme({ ...factura, lineas: [factura.lineas[1]] });
    expect(sinIva).not.toHaveProperty("tax_totals");
  });

  it("falla con un mensaje claro si el municipio no existe", () => {
    expect(() => mapearDocumentoNextpyme({ ...factura, adquirente: { ...cliente, municipioDane: "99999" } })).toThrow(
      'Nextpyme no reconoce el municipio con código DIAN "99999".',
    );
  });
});

describe("mapearDocumentoNextpyme — nota crédito", () => {
  const nota: NotaCredito = {
    tipo: "NOTA_CREDITO",
    prefijo: "NC",
    numero: 54,
    fecha: "2026-11-21",
    hora: "09:00:00",
    adquirente: cliente,
    lineas: factura.lineas,
    pago: factura.pago,
    enviarCorreo: false,
    concepto: "2",
    motivo: "Anulación total de la factura",
    facturaReferencia: { numeroCompleto: "SETP990000001", cufe: "3571981e", fecha: "2026-11-20" },
  };
  const json = mapearDocumentoNextpyme(nota);

  it("usa credit_note_lines, el concepto y la referencia a la factura", () => {
    expect(json).toMatchObject({
      type_document_id: 4,
      prefix: "NC",
      number: 54,
      discrepancyresponsecode: 2,
      discrepancyresponsedescription: "Anulación total de la factura",
      billing_reference: { number: "SETP990000001", uuid: "3571981e", issue_date: "2026-11-20" },
    });
    expect(json).toHaveProperty("credit_note_lines");
    expect(json).not.toHaveProperty("invoice_lines");
    expect(json).not.toHaveProperty("resolution_number");
  });
});
```

- [ ] **Step 5: Correr y ver que falla**

Run: `npx vitest run --project unit src/modulos/factura-electronica/proveedores/nextpyme/mapear.test.ts`
Expected: FAIL — no se encuentra `./mapear`.

- [ ] **Step 6: Implementar `mapear.ts`**

```ts
// src/modulos/factura-electronica/proveedores/nextpyme/mapear.ts
import { calcularTotales } from "../../calculo";
import { aTextoDecimal as dinero } from "../../dinero";
import { NUMERO_CONSUMIDOR_FINAL, type Adquirente, type DocumentoElectronico, type Linea, type TotalesLinea } from "../../modelo";
import { idNextpyme } from "./catalogos";

const IVA = () => idNextpyme("tributos", "01");
/** 999 = estándar de adopción del contribuyente (código propio del producto). */
const TIPO_IDENTIFICACION_ITEM = 4;
const SIN_MATRICULA = "0000000-00";

const cantidad = (n: number) => n.toFixed(2);
const porcentaje = (n: number) => n.toFixed(2);

function dias(desde: string, hasta: string): number {
  const ms = Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

function mapearCliente(a: Adquirente) {
  if (a.tipo === "CONSUMIDOR_FINAL") {
    return { identification_number: Number(NUMERO_CONSUMIDOR_FINAL), name: "CONSUMIDOR FINAL", merchant_registration: SIN_MATRICULA };
  }
  return {
    identification_number: a.numeroDocumento,
    ...(a.dv !== undefined ? { dv: a.dv } : {}),
    name: a.nombre,
    ...(a.telefono ? { phone: a.telefono } : {}),
    address: a.direccion,
    ...(a.email ? { email: a.email } : {}),
    merchant_registration: SIN_MATRICULA,
    type_document_identification_id: idNextpyme("tiposDocumentoIdentidad", a.tipoDocumento),
    type_organization_id: idNextpyme("tiposOrganizacion", a.tipoPersona === "JURIDICA" ? "1" : "2"),
    type_liability_id: idNextpyme("responsabilidades", a.responsabilidad),
    municipality_id: idNextpyme("municipios", a.municipioDane),
    type_regime_id: idNextpyme("regimenes", a.regimen),
  };
}

function mapearLinea(l: Linea, t: TotalesLinea) {
  return {
    unit_measure_id: idNextpyme("unidades", l.unidad),
    invoiced_quantity: cantidad(l.cantidad),
    line_extension_amount: dinero(t.neto),
    free_of_charge_indicator: false,
    ...(l.descuento > 0
      ? {
          allowance_charges: [
            { charge_indicator: false, allowance_charge_reason: "DESCUENTO", amount: dinero(l.descuento), base_amount: dinero(t.bruto) },
          ],
        }
      : {}),
    ...(l.iva
      ? { tax_totals: [{ tax_id: IVA(), tax_amount: dinero(t.iva), percent: porcentaje(l.iva.tarifa), taxable_amount: dinero(t.neto) }] }
      : {}),
    description: l.descripcion,
    code: l.codigo,
    type_item_identification_id: TIPO_IDENTIFICACION_ITEM,
    price_amount: dinero(l.precioUnitario),
    base_quantity: "1.00",
  };
}

/** DocumentoElectronico (códigos DIAN, centavos) → cuerpo JSON de Nextpyme. */
export function mapearDocumentoNextpyme(doc: DocumentoElectronico): Record<string, unknown> {
  const totales = calcularTotales(doc.lineas);
  const lineas = doc.lineas.map((l, i) => mapearLinea(l, totales.lineas[i]));
  const conCorreo = doc.enviarCorreo && doc.adquirente.tipo === "IDENTIFICADO" && Boolean(doc.adquirente.email);

  const base = {
    type_document_id: doc.tipo === "FACTURA" ? 1 : 4,
    date: doc.fecha,
    time: doc.hora,
    prefix: doc.prefijo,
    number: doc.numero,
    sendmail: conCorreo,
    customer: mapearCliente(doc.adquirente),
    payment_form: {
      payment_form_id: idNextpyme("formasPago", doc.pago.forma === "CONTADO" ? "1" : "2"),
      payment_method_id: idNextpyme("mediosPago", doc.pago.medio),
      payment_due_date: doc.pago.vencimiento,
      duration_measure: String(dias(doc.fecha, doc.pago.vencimiento)),
    },
    legal_monetary_totals: {
      line_extension_amount: dinero(totales.bruto),
      tax_exclusive_amount: dinero(totales.baseGravable),
      tax_inclusive_amount: dinero(totales.totalConImpuestos),
      allowance_total_amount: "0.00",
      charge_total_amount: "0.00",
      payable_amount: dinero(totales.totalAPagar),
    },
    ...(totales.impuestos.length > 0
      ? {
          tax_totals: totales.impuestos.map((i) => ({
            tax_id: IVA(),
            tax_amount: dinero(i.valor),
            percent: porcentaje(i.tarifa),
            taxable_amount: dinero(i.base),
          })),
        }
      : {}),
    ...(doc.notas ? { notes: doc.notas } : {}),
  };

  if (doc.tipo === "FACTURA") {
    return { ...base, resolution_number: doc.resolucionNumero, invoice_lines: lineas };
  }
  return {
    ...base,
    credit_note_lines: lineas,
    discrepancyresponsecode: idNextpyme("conceptosNotaCredito", doc.concepto),
    discrepancyresponsedescription: doc.motivo,
    billing_reference: {
      number: doc.facturaReferencia.numeroCompleto,
      uuid: doc.facturaReferencia.cufe,
      issue_date: doc.facturaReferencia.fecha,
    },
  };
}
```

- [ ] **Step 7: Correr y ver que pasa**

Run: `npx vitest run --project unit src/modulos/factura-electronica/proveedores/nextpyme/mapear.test.ts`
Expected: PASS (7 pruebas). Si falla solo por `unit_measure_id: 730` o `payment_method_id: 47`, usar en **la prueba** los valores anotados en el Step 2 (el catálogo manda) y dejar nota en el commit.

- [ ] **Step 8: Fixtures de respuestas** (recortadas de los ejemplos de https://developers.nextpyme.plus; no inventar campos)

`__fixtures__/factura-aceptada.json`:

```json
{
  "success": true,
  "message": "AttachedDocument #SETP990095240 generada con éxito",
  "send_email_success": false,
  "ResponseDian": {
    "Envelope": {
      "Body": {
        "SendBillSyncResponse": {
          "SendBillSyncResult": {
            "ErrorMessage": { "string": "Regla: RUT01, Notificación: La validación del estado del RUT próximamente estará disponible." },
            "IsValid": "true",
            "StatusCode": "00",
            "StatusDescription": "Procesado Correctamente.",
            "StatusMessage": "La Factura electrónica SETP990095240, ha sido autorizada.",
            "XmlDocumentKey": "3571981e718c3566a9f62bf2a4fb6bef50dc0364beebcc86c81d52a7f7bce38d7a87a3ec7f2102f77545b8f65a2c5a21"
          }
        }
      }
    }
  },
  "urlinvoicexml": "FES-SETP990095240.xml",
  "urlinvoicepdf": "FES-SETP990095240.pdf",
  "cufe": "3571981e718c3566a9f62bf2a4fb6bef50dc0364beebcc86c81d52a7f7bce38d7a87a3ec7f2102f77545b8f65a2c5a21",
  "dian_validation_date_time": { "date": "2026-07-23 16:25:28.000000", "timezone_type": 1, "timezone": "-05:00" },
  "certificate_days_left": 8,
  "resolution_days_left": 1276
}
```

`__fixtures__/factura-rechazada.json`:

```json
{
  "success": true,
  "message": "Documento con errores",
  "ResponseDian": {
    "Envelope": {
      "Body": {
        "SendBillSyncResponse": {
          "SendBillSyncResult": {
            "ErrorMessage": {
              "string": [
                "Regla: FAU02, Rechazo: El Valor Bruto antes de tributos no es igual a la suma de los valores de las líneas de la factura que contienen el valor comercial",
                "Regla: FAU14, Rechazo: Valor a Pagar de Factura es distinto de la Suma de Valor Bruto más tributos - Valor del Descuento Total + Valor del Cargo Total",
                "Regla: RUT01, Notificación: La validación del estado del RUT próximamente estará disponible."
              ]
            },
            "IsValid": "false",
            "StatusCode": "99",
            "StatusDescription": "Validación contiene errores en campos mandatorios.",
            "StatusMessage": "Documento con errores en campos mandatorios."
          }
        }
      }
    }
  }
}
```

`__fixtures__/error-422.json`:

```json
{
  "message": "The given data was invalid.",
  "errors": {
    "prefix": ["Error, este prefijo no es valido para esta empresa."],
    "number": ["El número debe estar entre X y Y."]
  }
}
```

`__fixtures__/estado-aceptado.json`:

```json
{
  "success": true,
  "ResponseDian": {
    "Envelope": {
      "Body": {
        "GetStatusZipResponse": {
          "GetStatusZipResult": {
            "ErrorMessage": {},
            "IsValid": "true",
            "StatusCode": "00",
            "StatusDescription": "Procesado Correctamente.",
            "StatusMessage": "La Factura electrónica FE212, ha sido autorizada."
          }
        }
      }
    }
  }
}
```

- [ ] **Step 9: Prueba que falla para `interpretar`**

```ts
// src/modulos/factura-electronica/proveedores/nextpyme/interpretar.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { interpretarRespuestaEnvio, interpretarRespuestaEstado } from "./interpretar";
import aceptada from "./__fixtures__/factura-aceptada.json";
import rechazada from "./__fixtures__/factura-rechazada.json";
import error422 from "./__fixtures__/error-422.json";
import estadoAceptado from "./__fixtures__/estado-aceptado.json";

describe("interpretarRespuestaEnvio", () => {
  it("aceptada: CUFE, fecha con zona horaria y avisos como advertencias", () => {
    const r = interpretarRespuestaEnvio(200, aceptada);
    expect(r).toEqual({
      estado: "ACEPTADO",
      cufe: aceptada.cufe,
      fechaValidacion: "2026-07-23T16:25:28-05:00",
      advertencias: [expect.objectContaining({ codigo: "RUT01", tipo: "NOTIFICACION" })],
    });
  });

  it("rechazada: solo los rechazos como motivos, ya traducidos", () => {
    const r = interpretarRespuestaEnvio(200, rechazada);
    expect(r.estado).toBe("RECHAZADO");
    if (r.estado !== "RECHAZADO") return;
    expect(r.motivos.map((m) => m.codigo)).toEqual(["FAU02", "FAU14"]);
    expect(r.motivos[0].explicacion).toBe("El valor antes de impuestos no coincide con la suma de los conceptos.");
  });

  it("422 de Nextpyme: rechazo con los mensajes de validación", () => {
    const r = interpretarRespuestaEnvio(422, error422);
    expect(r.estado).toBe("RECHAZADO");
    if (r.estado !== "RECHAZADO") return;
    expect(r.motivos.map((m) => m.textoDian)).toEqual([
      "Error, este prefijo no es valido para esta empresa.",
      "El número debe estar entre X y Y.",
    ]);
  });

  it("401/403: error de configuración", () => {
    expect(interpretarRespuestaEnvio(401, { message: "Unauthenticated." })).toEqual({
      estado: "ERROR_CONFIGURACION",
      mensaje: "La conexión con el proveedor no es válida. Revisa el token en Configuración del taller.",
    });
    expect(interpretarRespuestaEnvio(403, {}).estado).toBe("ERROR_CONFIGURACION");
  });

  it("5xx, sin respuesta o respuesta rara: error temporal", () => {
    expect(interpretarRespuestaEnvio(502, null).estado).toBe("ERROR_TEMPORAL");
    expect(interpretarRespuestaEnvio(0, null).estado).toBe("ERROR_TEMPORAL");
    expect(interpretarRespuestaEnvio(200, { success: true }).estado).toBe("ERROR_TEMPORAL");
  });
});

describe("interpretarRespuestaEstado", () => {
  it("aceptado: usa el CUFE consultado", () => {
    expect(interpretarRespuestaEstado(200, estadoAceptado, "abc")).toEqual({
      estado: "ACEPTADO",
      cufe: "abc",
      fechaValidacion: "",
      advertencias: [],
    });
  });

  it("404: no encontrado", () => {
    expect(interpretarRespuestaEstado(404, {}, "abc")).toEqual({ estado: "NO_ENCONTRADO" });
  });
});
```

- [ ] **Step 10: Correr y ver que falla**

Run: `npx vitest run --project unit src/modulos/factura-electronica/proveedores/nextpyme/interpretar.test.ts`
Expected: FAIL — no se encuentra `./interpretar`.

- [ ] **Step 11: Implementar `interpretar.ts`**

```ts
// src/modulos/factura-electronica/proveedores/nextpyme/interpretar.ts
import { traducirMensajeDian, traducirMensajesDian } from "../../mensajes-dian";
import type { MensajeDian } from "../../modelo";
import type { ResultadoConsulta, ResultadoEnvio } from "../../proveedor";

type Objeto = Record<string, unknown>;
const esObjeto = (v: unknown): v is Objeto => typeof v === "object" && v !== null && !Array.isArray(v);

const MENSAJE_TOKEN = "La conexión con el proveedor no es válida. Revisa el token en Configuración del taller.";

/** Busca dentro de ResponseDian.Envelope.Body el primer objeto que tenga IsValid. */
function resultadoDian(cuerpo: unknown): Objeto | null {
  if (!esObjeto(cuerpo)) return null;
  const respuesta = cuerpo.ResponseDian;
  const sobre = esObjeto(respuesta) ? respuesta.Envelope : undefined;
  const body = esObjeto(sobre) ? sobre.Body : undefined;
  if (!esObjeto(body)) return null;
  for (const envoltura of Object.values(body)) {
    if (!esObjeto(envoltura)) continue;
    for (const resultado of Object.values(envoltura)) {
      if (esObjeto(resultado) && "IsValid" in resultado) return resultado;
    }
  }
  return null;
}

/** ErrorMessage llega como {string: "…"}, {string: ["…"]}, [] o {}. */
function mensajesDe(resultado: Objeto): MensajeDian[] {
  const em = resultado.ErrorMessage;
  if (!esObjeto(em)) return [];
  const s = em.string;
  if (typeof s === "string") return traducirMensajesDian(s);
  if (Array.isArray(s)) return traducirMensajesDian(s.filter((x): x is string => typeof x === "string"));
  return [];
}

/** {date: "2026-07-23 16:25:28.000000", timezone: "-05:00"} → "2026-07-23T16:25:28-05:00" */
function fechaValidacion(cuerpo: Objeto): string {
  const f = cuerpo.dian_validation_date_time;
  if (!esObjeto(f) || typeof f.date !== "string") return "";
  const [dia, hora = "00:00:00"] = f.date.split(" ");
  const zona = typeof f.timezone === "string" ? f.timezone : "-05:00";
  return `${dia}T${hora.slice(0, 8)}${zona}`;
}

function erroresDeValidacion(cuerpo: unknown): MensajeDian[] {
  if (!esObjeto(cuerpo)) return [];
  if (esObjeto(cuerpo.errors)) {
    return Object.values(cuerpo.errors)
      .flatMap((v) => (Array.isArray(v) ? v : [v]))
      .filter((x): x is string => typeof x === "string")
      .map(traducirMensajeDian);
  }
  return typeof cuerpo.message === "string" ? [traducirMensajeDian(cuerpo.message)] : [];
}

export function interpretarRespuestaEnvio(status: number, cuerpo: unknown): ResultadoEnvio {
  if (status === 401 || status === 403) return { estado: "ERROR_CONFIGURACION", mensaje: MENSAJE_TOKEN };
  if (status === 422) {
    const motivos = erroresDeValidacion(cuerpo);
    return { estado: "RECHAZADO", motivos: motivos.length ? motivos : [traducirMensajeDian("El proveedor rechazó los datos enviados.")] };
  }
  if (status < 200 || status >= 300) {
    return { estado: "ERROR_TEMPORAL", mensaje: `El proveedor no respondió correctamente (código ${status || "sin respuesta"}).` };
  }
  const r = resultadoDian(cuerpo);
  if (!r || !esObjeto(cuerpo)) return { estado: "ERROR_TEMPORAL", mensaje: "El proveedor respondió algo inesperado." };

  const mensajes = mensajesDe(r);
  if (r.IsValid === "true") {
    const cufe = typeof cuerpo.cufe === "string" ? cuerpo.cufe : String(r.XmlDocumentKey ?? "");
    return { estado: "ACEPTADO", cufe, fechaValidacion: fechaValidacion(cuerpo), advertencias: mensajes };
  }
  const rechazos = mensajes.filter((m) => m.tipo === "RECHAZO");
  const motivos = rechazos.length
    ? rechazos
    : [traducirMensajeDian(String(r.StatusMessage ?? r.StatusDescription ?? "La DIAN rechazó el documento."))];
  return { estado: "RECHAZADO", motivos };
}

export function interpretarRespuestaEstado(status: number, cuerpo: unknown, cufe: string): ResultadoConsulta {
  if (status === 404) return { estado: "NO_ENCONTRADO" };
  if (status === 401 || status === 403) return { estado: "ERROR_CONFIGURACION", mensaje: MENSAJE_TOKEN };
  if (status < 200 || status >= 300) {
    return { estado: "ERROR_TEMPORAL", mensaje: `El proveedor no respondió correctamente (código ${status || "sin respuesta"}).` };
  }
  const r = resultadoDian(cuerpo);
  if (!r) return { estado: "NO_ENCONTRADO" };
  const mensajes = mensajesDe(r);
  if (r.IsValid === "true") return { estado: "ACEPTADO", cufe, fechaValidacion: "", advertencias: mensajes };
  const rechazos = mensajes.filter((m) => m.tipo === "RECHAZO");
  return rechazos.length ? { estado: "RECHAZADO", motivos: rechazos } : { estado: "NO_ENCONTRADO" };
}
```

- [ ] **Step 12: Correr y ver que pasa**

Run: `npx vitest run --project unit src/modulos/factura-electronica/proveedores/nextpyme/interpretar.test.ts`
Expected: PASS (7 pruebas).

- [ ] **Step 13: Prueba que falla para el proveedor HTTP**

```ts
// src/modulos/factura-electronica/proveedores/nextpyme/proveedor.test.ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { crearProveedorNextpyme } from "./proveedor";
import aceptada from "./__fixtures__/factura-aceptada.json";
import type { FacturaVenta } from "../../modelo";

const factura: FacturaVenta = {
  tipo: "FACTURA",
  prefijo: "SETP",
  numero: 990095240,
  resolucionNumero: "18760000001",
  fecha: "2026-11-20",
  hora: "10:00:00",
  adquirente: { tipo: "CONSUMIDOR_FINAL" },
  lineas: [{ codigo: "A", descripcion: "Aceite", cantidad: 1, unidad: "94", precioUnitario: 5000000, descuento: 0, iva: { tarifa: 19 } }],
  pago: { forma: "CONTADO", medio: "10", vencimiento: "2026-11-20" },
  enviarCorreo: false,
};

const respuesta = (status: number, cuerpo: unknown) =>
  new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });

function crear(fetchFalso: typeof fetch) {
  return crearProveedorNextpyme({ token: "tok-123", nitEmisor: "901000123", fetch: fetchFalso, timeoutMs: 1000 });
}

describe("crearProveedorNextpyme", () => {
  it("envía la factura con el token y devuelve ACEPTADO", async () => {
    const f = vi.fn(async () => respuesta(200, aceptada));
    const r = await crear(f as unknown as typeof fetch).enviar(factura);
    expect(r.estado).toBe("ACEPTADO");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.nextpyme.plus/api/ubl2.1/invoice");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok-123");
    expect(JSON.parse(String(init.body)).number).toBe(990095240);
  });

  it("la nota crédito va a /credit-note", async () => {
    const f = vi.fn(async () => respuesta(200, aceptada));
    const { tipo: _t, resolucionNumero: _r, ...resto } = factura;
    await crear(f as unknown as typeof fetch).enviar({
      ...resto,
      tipo: "NOTA_CREDITO",
      prefijo: "NC",
      numero: 1,
      concepto: "2",
      motivo: "Anulación",
      facturaReferencia: { numeroCompleto: "SETP990095240", cufe: "abc", fecha: "2026-11-20" },
    });
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("https://api.nextpyme.plus/api/ubl2.1/credit-note");
  });

  it("un fallo de red o tiempo agotado es ERROR_TEMPORAL", async () => {
    const f = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect((await crear(f as unknown as typeof fetch).enviar(factura)).estado).toBe("ERROR_TEMPORAL");
  });

  it("un catálogo desconocido no llama al proveedor y queda como rechazo", async () => {
    const f = vi.fn(async () => respuesta(200, aceptada));
    const r = await crear(f as unknown as typeof fetch).enviar({
      ...factura,
      lineas: [{ ...factura.lineas[0], unidad: "NO-EXISTE" }],
    });
    expect(r.estado).toBe("RECHAZADO");
    expect(f).not.toHaveBeenCalled();
  });

  it("consultarEstado sin CUFE responde NO_ENCONTRADO sin llamar", async () => {
    const f = vi.fn();
    expect(await crear(f as unknown as typeof fetch).consultarEstado({ tipo: "FACTURA", prefijo: "SETP", numero: 1 })).toEqual({
      estado: "NO_ENCONTRADO",
    });
    expect(f).not.toHaveBeenCalled();
  });

  it("consultarEstado con CUFE usa POST /status/document/{cufe}", async () => {
    const f = vi.fn(async () => respuesta(404, {}));
    await crear(f as unknown as typeof fetch).consultarEstado({ tipo: "FACTURA", prefijo: "SETP", numero: 1, cufe: "abc" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.nextpyme.plus/api/ubl2.1/status/document/abc");
    expect(init.method).toBe("POST");
  });

  it("descarga con el nombre de archivo según el tipo", async () => {
    const f = vi.fn(async () => new Response(new Uint8Array([37, 80, 68, 70]), { status: 200 }));
    const p = crear(f as unknown as typeof fetch);
    const pdf = await p.descargar({ tipo: "FACTURA", prefijo: "SETP", numero: 990095240 }, "PDF");
    expect([...pdf]).toEqual([37, 80, 68, 70]);
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe(
      "https://api.nextpyme.plus/api/ubl2.1/download/901000123/FES-SETP990095240.pdf",
    );
    await p.descargar({ tipo: "NOTA_CREDITO", prefijo: "NC", numero: 54 }, "XML");
    expect((f.mock.calls[1] as unknown as [string])[0]).toBe("https://api.nextpyme.plus/api/ubl2.1/download/901000123/NCS-NC54.xml");
  });

  it("descarga fallida lanza ErrorProveedor", async () => {
    const f = vi.fn(async () => respuesta(404, {}));
    await expect(crear(f as unknown as typeof fetch).descargar({ tipo: "FACTURA", prefijo: "S", numero: 1 }, "PDF")).rejects.toThrow(
      /No se pudo descargar/,
    );
  });

  it("probarConexion: GET /config/company; 401 explica el token", async () => {
    const ok = vi.fn(async () => respuesta(200, { success: true }));
    expect(await crear(ok as unknown as typeof fetch).probarConexion()).toEqual({ ok: true });
    expect((ok.mock.calls[0] as unknown as [string])[0]).toBe("https://api.nextpyme.plus/api/ubl2.1/config/company");

    const malo = vi.fn(async () => respuesta(401, {}));
    expect(await crear(malo as unknown as typeof fetch).probarConexion()).toEqual({
      ok: false,
      mensaje: "La conexión con el proveedor no es válida. Revisa el token en Configuración del taller.",
    });
  });
});
```

- [ ] **Step 14: Correr y ver que falla**

Run: `npx vitest run --project unit src/modulos/factura-electronica/proveedores/nextpyme/proveedor.test.ts`
Expected: FAIL — no se encuentra `./proveedor`.

- [ ] **Step 15: Implementar `proveedores/nextpyme/proveedor.ts`**

```ts
// src/modulos/factura-electronica/proveedores/nextpyme/proveedor.ts
import { traducirMensajeDian } from "../../mensajes-dian";
import type { DocumentoElectronico } from "../../modelo";
import { ErrorProveedor, type FormatoArchivo, type ProveedorFacturaElectronica, type ReferenciaDocumento } from "../../proveedor";
import { interpretarRespuestaEnvio, interpretarRespuestaEstado } from "./interpretar";
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
      const { status } = await llamarJson("GET", "/config/company");
      if (status >= 200 && status < 300) return { ok: true };
      if (status === 401 || status === 403) {
        return { ok: false, mensaje: "La conexión con el proveedor no es válida. Revisa el token en Configuración del taller." };
      }
      return { ok: false, mensaje: `El proveedor no respondió correctamente (código ${status || "sin respuesta"}).` };
    },
  };
}
```

- [ ] **Step 16: Correr y ver que pasa**

Run: `npx vitest run --project unit src/modulos/factura-electronica/proveedores/nextpyme/proveedor.test.ts`
Expected: PASS (9 pruebas).

- [ ] **Step 17: Prueba que falla para la fábrica**

```ts
// src/modulos/factura-electronica/fabrica.test.ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { crearProveedor } from "./fabrica";

describe("crearProveedor", () => {
  it("SIMULADO no necesita token y respeta el resultado forzado", async () => {
    const p = crearProveedor({ ambiente: "SIMULADO", resultadoSimulado: "CAIDA" });
    expect((await p.probarConexion()).ok).toBe(false);
  });

  it("PRUEBAS y PRODUCCION exigen token", () => {
    expect(() => crearProveedor({ ambiente: "PRUEBAS" })).toThrow("Falta el token del proveedor de facturación electrónica.");
    expect(() => crearProveedor({ ambiente: "PRODUCCION", nextpyme: { token: "", nitEmisor: "1" } })).toThrow();
  });

  it("con token devuelve el adaptador de Nextpyme", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    const p = crearProveedor({ ambiente: "PRUEBAS", nextpyme: { token: "t", nitEmisor: "1", fetch: f as unknown as typeof fetch } });
    await p.probarConexion();
    expect((f.mock.calls[0] as unknown as [string])[0]).toMatch(/nextpyme\.plus\/api\/ubl2\.1\/config\/company$/);
  });
});
```

- [ ] **Step 18: Correr y ver que falla**

Run: `npx vitest run --project unit src/modulos/factura-electronica/fabrica.test.ts`
Expected: FAIL — no se encuentra `./fabrica`.

- [ ] **Step 19: Implementar `fabrica.ts` y completar `index.ts`**

```ts
// src/modulos/factura-electronica/fabrica.ts
import type { ProveedorFacturaElectronica } from "./proveedor";
import { crearProveedorNextpyme, type OpcionesNextpyme } from "./proveedores/nextpyme/proveedor";
import { crearProveedorSimulado, type ResultadoSimulado } from "./proveedores/simulado";

export type Ambiente = "SIMULADO" | "PRUEBAS" | "PRODUCCION";

export interface ConfigProveedor {
  ambiente: Ambiente;
  /** Solo para SIMULADO. */
  resultadoSimulado?: ResultadoSimulado;
  /** Obligatorio en PRUEBAS y PRODUCCION. */
  nextpyme?: OpcionesNextpyme;
}

export function crearProveedor(config: ConfigProveedor): ProveedorFacturaElectronica {
  if (config.ambiente === "SIMULADO") {
    return crearProveedorSimulado({ resultado: config.resultadoSimulado });
  }
  if (!config.nextpyme?.token) {
    throw new Error("Falta el token del proveedor de facturación electrónica.");
  }
  return crearProveedorNextpyme(config.nextpyme);
}
```

En `index.ts`, agregar como **primera línea** del archivo:

```ts
import municipios from "./catalogos/municipios.json";
```

y al final:

```ts
export { crearProveedor, type Ambiente, type ConfigProveedor } from "./fabrica";
export { crearProveedorNextpyme, type OpcionesNextpyme } from "./proveedores/nextpyme/proveedor";
/** Municipios de Colombia (código DANE, nombre, departamento), para buscadores. */
export const MUNICIPIOS: { codigo: string; nombre: string; departamento: string }[] = municipios;
```

- [ ] **Step 20: Correr y ver que pasa**

Run: `npx vitest run --project unit src/modulos/factura-electronica/fabrica.test.ts`
Expected: PASS (3 pruebas).

- [ ] **Step 21: Verificación de la tarea y de la frontera completa**

Run: `npx tsc --noEmit && npx vitest run --project unit src/modulos/factura-electronica && npx eslint src/modulos/factura-electronica scripts/generar-catalogos-nextpyme.mjs`
Expected: sin errores; 59 pruebas en verde.

Run: `grep -rnE "from \"(@/|next|react|@prisma)" src/modulos/factura-electronica || echo "frontera limpia"`
Expected: `frontera limpia`

- [ ] **Step 22: Commit y push**

```bash
git add scripts/generar-catalogos-nextpyme.mjs src/modulos/factura-electronica
git commit -m "fase-fe-task 3: catálogos y adaptador Nextpyme con respuestas grabadas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

## Pendiente de confirmar en el sandbox real (tarea 8, Plan 2)

Puntos donde la documentación de Nextpyme es ambigua; el adaptador los concentra en un solo lugar:

1. `type_document_identification_id`: la tabla maestra dice NIT = 6 y cédula = 3, pero un ejemplo de su skill manda `3` para una empresa con NIT. El adaptador usa la tabla.
2. `type_document_id` de la nota crédito: la tabla dice 4; un ejemplo genérico muestra 1. El adaptador usa 4.
3. `base_quantity` = `"1.00"` con `price_amount` = precio unitario (semántica UBL).
4. Respuesta de `/status/document/{cufe}` cuando el CUFE no existe (hoy: 404 o sin `IsValid` → `NO_ENCONTRADO`).
5. Si el plan Estudiantes emite en producción.
