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
