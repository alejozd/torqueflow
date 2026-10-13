import { describe, expect, it } from "vitest";
import {
  DIAS_ESTANCADA_MAX,
  DIAS_ESTANCADA_MIN,
  PRIORIDAD_ORDEN_POR_DEFECTO,
  diasEstancadaSchema,
  prioridadOrdenSchema,
} from "./orden";

describe("prioridadOrdenSchema", () => {
  it("acepta los cuatro niveles", () => {
    expect(prioridadOrdenSchema.options).toEqual(["BAJA", "NORMAL", "ALTA", "URGENTE"]);
    expect(PRIORIDAD_ORDEN_POR_DEFECTO).toBe("NORMAL");
  });

  it("rechaza cualquier otra cosa", () => {
    expect(prioridadOrdenSchema.safeParse("URGENTISIMA").success).toBe(false);
    expect(prioridadOrdenSchema.safeParse("").success).toBe(false);
    expect(prioridadOrdenSchema.safeParse(1).success).toBe(false);
  });
});

describe("diasEstancadaSchema", () => {
  it("acepta el rango y convierte el texto del formulario", () => {
    expect(diasEstancadaSchema.parse("3")).toBe(3);
    expect(diasEstancadaSchema.parse(DIAS_ESTANCADA_MIN)).toBe(DIAS_ESTANCADA_MIN);
    expect(diasEstancadaSchema.parse(DIAS_ESTANCADA_MAX)).toBe(DIAS_ESTANCADA_MAX);
  });

  it("rechaza fuera de rango y decimales", () => {
    expect(diasEstancadaSchema.safeParse(DIAS_ESTANCADA_MIN - 1).success).toBe(false);
    expect(diasEstancadaSchema.safeParse(DIAS_ESTANCADA_MAX + 1).success).toBe(false);
    expect(diasEstancadaSchema.safeParse(2.5).success).toBe(false);
  });

  it("el mensaje del error está en español", () => {
    const resultado = diasEstancadaSchema.safeParse(0);

    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.message).toContain("días entre");
  });
});
