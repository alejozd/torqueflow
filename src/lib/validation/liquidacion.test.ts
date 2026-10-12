import { describe, expect, it } from "vitest";
import {
  ajusteLiquidacionInputSchema,
  esquemaLiquidacionInputSchema,
  frecuenciaLiquidacionSchema,
  pagarLiquidacionInputSchema,
  periodoLiquidacionInputSchema,
} from "./liquidacion";

describe("frecuenciaLiquidacionSchema", () => {
  it("acepta las tres frecuencias y rechaza cualquier otra", () => {
    expect(frecuenciaLiquidacionSchema.parse("SEMANAL")).toBe("SEMANAL");
    expect(frecuenciaLiquidacionSchema.parse("QUINCENAL")).toBe("QUINCENAL");
    expect(frecuenciaLiquidacionSchema.parse("MENSUAL")).toBe("MENSUAL");
    expect(frecuenciaLiquidacionSchema.safeParse("DIARIA").success).toBe(false);
    expect(frecuenciaLiquidacionSchema.safeParse("mensual").success).toBe(false);
  });
});

describe("periodoLiquidacionInputSchema", () => {
  it("acepta el periodo con el formato de su frecuencia", () => {
    expect(periodoLiquidacionInputSchema.parse({ frecuencia: "MENSUAL", periodo: "2026-10" })).toEqual({
      frecuencia: "MENSUAL",
      periodo: "2026-10",
    });
    expect(periodoLiquidacionInputSchema.safeParse({ frecuencia: "QUINCENAL", periodo: "2026-10-Q2" }).success).toBe(true);
    expect(periodoLiquidacionInputSchema.safeParse({ frecuencia: "SEMANAL", periodo: "2026-W42" }).success).toBe(true);
  });

  it.each([
    ["MENSUAL", "2026-10-Q2"],
    ["MENSUAL", "2026-13"],
    ["MENSUAL", "2026-1"],
    ["QUINCENAL", "2026-10"],
    ["QUINCENAL", "2026-10-Q3"],
    ["SEMANAL", "2026-10"],
    ["SEMANAL", "2026-W54"],
    ["SEMANAL", "2026-W4"],
  ])("rechaza %s con periodo %s", (frecuencia, periodo) => {
    const r = periodoLiquidacionInputSchema.safeParse({ frecuencia, periodo });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["periodo"]);
  });

  it("explica el formato esperado de cada frecuencia", () => {
    expect(periodoLiquidacionInputSchema.safeParse({ frecuencia: "MENSUAL", periodo: "x" }).error?.issues[0]?.message).toBe(
      "El periodo debe tener el formato AAAA-MM",
    );
    expect(periodoLiquidacionInputSchema.safeParse({ frecuencia: "QUINCENAL", periodo: "x" }).error?.issues[0]?.message).toBe(
      "El periodo debe tener el formato AAAA-MM-Q1 o AAAA-MM-Q2",
    );
    expect(periodoLiquidacionInputSchema.safeParse({ frecuencia: "SEMANAL", periodo: "x" }).error?.issues[0]?.message).toBe(
      "El periodo debe tener el formato AAAA-Wnn (semana ISO)",
    );
  });

  it("rechaza un periodo vacío", () => {
    expect(periodoLiquidacionInputSchema.safeParse({ frecuencia: "MENSUAL", periodo: "  " }).success).toBe(false);
  });
});

describe("esquemaLiquidacionInputSchema", () => {
  it("acepta un esquema por porcentaje", () => {
    expect(esquemaLiquidacionInputSchema.parse({ tipo: "PORCENTAJE", porcentaje: "40", montoFijo: "" })).toEqual({
      tipo: "PORCENTAJE",
      porcentaje: 40,
      montoFijo: undefined,
    });
  });

  it("acepta un esquema fijo y uno mixto", () => {
    expect(esquemaLiquidacionInputSchema.parse({ tipo: "FIJO", porcentaje: "", montoFijo: "1500000" })).toEqual({
      tipo: "FIJO",
      porcentaje: undefined,
      montoFijo: 1500000,
    });
    expect(esquemaLiquidacionInputSchema.parse({ tipo: "MIXTO", porcentaje: "10", montoFijo: "800000" })).toEqual({
      tipo: "MIXTO",
      porcentaje: 10,
      montoFijo: 800000,
    });
  });

  it.each([
    [{ tipo: "PORCENTAJE", porcentaje: "", montoFijo: "" }, "Un esquema por porcentaje necesita el porcentaje"],
    [{ tipo: "PORCENTAJE", porcentaje: "0", montoFijo: "" }, "El porcentaje debe ser mayor que cero"],
    [{ tipo: "PORCENTAJE", porcentaje: "101", montoFijo: "" }, "El porcentaje no puede pasar de 100"],
    [{ tipo: "FIJO", porcentaje: "", montoFijo: "" }, "Un esquema fijo necesita el monto base"],
    [{ tipo: "FIJO", porcentaje: "", montoFijo: "0" }, "El monto base debe ser mayor que cero"],
    [{ tipo: "MIXTO", porcentaje: "10", montoFijo: "" }, "Un esquema mixto necesita el porcentaje y el monto base"],
    [{ tipo: "MIXTO", porcentaje: "", montoFijo: "500000" }, "Un esquema mixto necesita el porcentaje y el monto base"],
    [{ tipo: "RARO", porcentaje: "10", montoFijo: "" }, "Tipo de esquema inválido"],
  ])("rechaza %o", (cambio, mensaje) => {
    const r = esquemaLiquidacionInputSchema.safeParse(cambio);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe(mensaje);
  });

  it("acepta los montos en los límites", () => {
    expect(esquemaLiquidacionInputSchema.safeParse({ tipo: "PORCENTAJE", porcentaje: "100", montoFijo: "" }).success).toBe(true);
    expect(esquemaLiquidacionInputSchema.safeParse({ tipo: "FIJO", porcentaje: "", montoFijo: "99999999.99" }).success).toBe(true);
  });
});

describe("pagarLiquidacionInputSchema", () => {
  it("acepta un pago con método, fecha y referencia opcional", () => {
    expect(
      pagarLiquidacionInputSchema.parse({ metodoPago: "EFECTIVO", fecha: "2026-10-31", referencia: "  recibo 12 " }),
    ).toEqual({ metodoPago: "EFECTIVO", fecha: "2026-10-31", referencia: "recibo 12" });
    expect(pagarLiquidacionInputSchema.parse({ metodoPago: "TRANSFERENCIA", fecha: "2026-10-31", referencia: "" }).referencia).toBeUndefined();
  });

  it.each([
    [{ metodoPago: "ANTICIPO", fecha: "2026-10-31" }, "Método de pago inválido"],
    [{ metodoPago: "EFECTIVO", fecha: "2026-02-31" }, "La fecha no existe en el calendario"],
    [{ metodoPago: "EFECTIVO", fecha: "" }, "La fecha debe tener el formato AAAA-MM-DD"],
  ])("rechaza %o", (cambio, mensaje) => {
    const r = pagarLiquidacionInputSchema.safeParse({ referencia: "", ...cambio });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe(mensaje);
  });
});

describe("ajusteLiquidacionInputSchema", () => {
  it("acepta un ajuste con su motivo", () => {
    expect(ajusteLiquidacionInputSchema.parse({ ajuste: "-50000", motivo: " Descuento de herramienta " })).toEqual({
      ajuste: -50000,
      motivo: "Descuento de herramienta",
    });
  });

  it("no exige motivo cuando el ajuste es 0", () => {
    expect(ajusteLiquidacionInputSchema.parse({ ajuste: "0", motivo: "" })).toEqual({ ajuste: 0, motivo: undefined });
  });

  it("exige motivo cuando hay ajuste", () => {
    const r = ajusteLiquidacionInputSchema.safeParse({ ajuste: "25000", motivo: "   " });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("Explica el motivo del ajuste");
  });

  it("rechaza un ajuste fuera de rango", () => {
    expect(ajusteLiquidacionInputSchema.safeParse({ ajuste: "100000000", motivo: "x" }).success).toBe(false);
    expect(ajusteLiquidacionInputSchema.safeParse({ ajuste: "", motivo: "" }).success).toBe(false);
  });
});
