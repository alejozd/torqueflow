import { describe, expect, it } from "vitest";
import {
  abrirCajaInputSchema,
  anticipoInputSchema,
  cerrarCajaInputSchema,
  devolverAnticipoInputSchema,
} from "./caja";

describe("abrirCajaInputSchema", () => {
  it("acepta una base válida y la convierte a número", () => {
    expect(abrirCajaInputSchema.parse({ baseInicial: "50000" }).baseInicial).toBe(50000);
  });
  it("acepta base cero", () => {
    expect(abrirCajaInputSchema.safeParse({ baseInicial: 0 }).success).toBe(true);
  });
  it("rechaza base negativa", () => {
    const r = abrirCajaInputSchema.safeParse({ baseInicial: -1 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("La base no puede ser negativa");
  });
  it("rechaza montos demasiado altos", () => {
    expect(abrirCajaInputSchema.safeParse({ baseInicial: 10_000_000_000 }).success).toBe(false);
  });
});

describe("cerrarCajaInputSchema", () => {
  it("acepta efectivo contado y recorta las notas", () => {
    const r = cerrarCajaInputSchema.parse({ efectivoContado: "120000", notas: "  todo ok  " });
    expect(r).toEqual({ efectivoContado: 120000, notas: "todo ok" });
  });
  it("notas vacías pasan a undefined", () => {
    expect(cerrarCajaInputSchema.parse({ efectivoContado: 0, notas: "   " }).notas).toBeUndefined();
  });
  it("rechaza efectivo negativo y notas largas", () => {
    expect(cerrarCajaInputSchema.safeParse({ efectivoContado: -5 }).success).toBe(false);
    expect(cerrarCajaInputSchema.safeParse({ efectivoContado: 5, notas: "x".repeat(301) }).success).toBe(false);
  });
});

describe("anticipoInputSchema", () => {
  it("acepta un anticipo válido", () => {
    const r = anticipoInputSchema.parse({ monto: "200000", metodoPago: "TRANSFERENCIA", referencia: " ref1 " });
    expect(r).toEqual({ monto: 200000, metodoPago: "TRANSFERENCIA", referencia: "ref1" });
  });
  it("referencia vacía pasa a undefined", () => {
    expect(anticipoInputSchema.parse({ monto: 1, metodoPago: "EFECTIVO", referencia: "" }).referencia).toBeUndefined();
  });
  it("rechaza monto 0", () => {
    const r = anticipoInputSchema.safeParse({ monto: 0, metodoPago: "EFECTIVO" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("El monto debe ser mayor que cero");
  });
  it("rechaza el método ANTICIPO", () => {
    expect(anticipoInputSchema.safeParse({ monto: 10, metodoPago: "ANTICIPO" }).success).toBe(false);
  });
  it("pide método de pago si falta", () => {
    const r = anticipoInputSchema.safeParse({ monto: 10 });
    expect(r.success).toBe(false);
  });
});

describe("devolverAnticipoInputSchema", () => {
  it("acepta métodos reales y rechaza ANTICIPO", () => {
    expect(devolverAnticipoInputSchema.safeParse({ metodoDevolucion: "EFECTIVO" }).success).toBe(true);
    expect(devolverAnticipoInputSchema.safeParse({ metodoDevolucion: "ANTICIPO" }).success).toBe(false);
  });
});
