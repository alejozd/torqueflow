import { describe, expect, it, vi } from "vitest";
import { leerIvaPct, resolverIvaPct } from "./resolver";

function db(activas: { porcentaje: number; predeterminada: boolean }[]) {
  return { tarifaIva: { findMany: vi.fn().mockResolvedValue(activas) } };
}
const ACTIVAS = [
  { porcentaje: 0, predeterminada: false },
  { porcentaje: 19, predeterminada: true },
];

describe("resolverIvaPct", () => {
  it("sin valor usa la predeterminada", async () => {
    await expect(resolverIvaPct(db(ACTIVAS), undefined)).resolves.toEqual({ ok: true, ivaPct: 19 });
  });

  it("sin predeterminada cae en 19 %", async () => {
    await expect(resolverIvaPct(db([]), undefined)).resolves.toEqual({ ok: true, ivaPct: 19 });
  });

  it("acepta una tarifa activa y rechaza una que no lo está", async () => {
    await expect(resolverIvaPct(db(ACTIVAS), 0)).resolves.toEqual({ ok: true, ivaPct: 0 });
    const r = await resolverIvaPct(db(ACTIVAS), 5);
    expect(r.ok).toBe(false);
  });

  it("respeta el valor que ya tenía aunque su tarifa esté inactiva, sin consultar", async () => {
    const lector = db(ACTIVAS);
    await expect(resolverIvaPct(lector, 5, 5)).resolves.toEqual({ ok: true, ivaPct: 5 });
    expect(lector.tarifaIva.findMany).not.toHaveBeenCalled();
  });
});

describe("leerIvaPct", () => {
  it("convierte el valor del formulario", () => {
    expect(leerIvaPct("19")).toBe(19);
    expect(leerIvaPct("2,5")).toBe(2.5);
    expect(leerIvaPct("")).toBeUndefined();
    expect(leerIvaPct(null)).toBeUndefined();
  });
});
