import { describe, expect, it } from "vitest";
import {
  actaEntregaInputSchema,
  danioInputSchema,
  garantiaInputSchema,
  KM_MAXIMO,
  nivelCombustibleSchema,
  recepcionInputSchema,
  zonaVehiculoSchema,
} from "./recepcion";

describe("recepcionInputSchema", () => {
  it("acepta kilometraje y nivel de combustible", () => {
    const r = recepcionInputSchema.safeParse({ kilometrajeIngreso: "85000", nivelCombustible: "MEDIO" });

    expect(r.success).toBe(true);
    expect(r.data).toEqual({ kilometrajeIngreso: 85000, nivelCombustible: "MEDIO" });
  });

  it("trata los campos vacíos como no enviados (no como cero)", () => {
    const r = recepcionInputSchema.safeParse({ kilometrajeIngreso: "", nivelCombustible: "" });

    expect(r.success).toBe(true);
    expect(r.data).toEqual({ kilometrajeIngreso: undefined, nivelCombustible: undefined });
  });

  it("rechaza kilometraje negativo, con decimales o disparatado", () => {
    expect(recepcionInputSchema.safeParse({ kilometrajeIngreso: "-1" }).error?.issues[0]?.message).toBe(
      "El kilometraje no puede ser negativo",
    );
    // El campo del formulario es type="number", así que el decimal llega con
    // punto; con coma (lo que se escribe a mano) Zod ni siquiera lo ve como número.
    expect(recepcionInputSchema.safeParse({ kilometrajeIngreso: "12.5" }).error?.issues[0]?.message).toBe(
      "Usa un número entero",
    );
    expect(recepcionInputSchema.safeParse({ kilometrajeIngreso: "12,5" }).error?.issues[0]?.message).toBe(
      "El kilometraje debe ser un número",
    );
    expect(recepcionInputSchema.safeParse({ kilometrajeIngreso: KM_MAXIMO + 1 }).error?.issues[0]?.message).toBe(
      "Ese kilometraje es demasiado alto",
    );
  });

  it("rechaza un nivel de combustible inventado", () => {
    expect(recepcionInputSchema.safeParse({ nivelCombustible: "MEDIO_TANQUE" }).success).toBe(false);
    expect(nivelCombustibleSchema.options).toContain("TRES_CUARTOS");
  });
});

describe("danioInputSchema", () => {
  it("acepta una marca con nota y sin ella", () => {
    expect(danioInputSchema.parse({ zona: "PUERTA_DERECHA", tipo: "GOLPE", nota: "  Golpe leve  " })).toEqual({
      zona: "PUERTA_DERECHA",
      tipo: "GOLPE",
      nota: "Golpe leve",
    });
    expect(danioInputSchema.parse({ zona: "CAPO", tipo: "RAYON", nota: "   " }).nota).toBeUndefined();
  });

  it("rechaza una zona fuera del catálogo y una nota larguísima", () => {
    expect(danioInputSchema.safeParse({ zona: "ALERON", tipo: "GOLPE" }).success).toBe(false);
    expect(danioInputSchema.safeParse({ zona: "CAPO", tipo: "GOLPE", nota: "x".repeat(201) }).error?.issues[0]?.message).toBe(
      "La nota admite máximo 200 caracteres",
    );
    expect(zonaVehiculoSchema.options).toContain("MANUBRIO");
  });
});

describe("actaEntregaInputSchema", () => {
  const base = { recibidoPor: "  María Pérez ", documentoRecibe: " 1.020 ", observaciones: " Sin novedad " };

  it("exige el nombre de quien recibe y recorta los espacios", () => {
    const r = actaEntregaInputSchema.safeParse({ ...base, firmaUrl: "/api/uploads/t/ordenes/o1/firma/f.png" });

    expect(r.success).toBe(true);
    expect(r.data).toEqual({
      recibidoPor: "María Pérez",
      documentoRecibe: "1.020",
      observaciones: "Sin novedad",
      firmaUrl: "/api/uploads/t/ordenes/o1/firma/f.png",
    });
    expect(actaEntregaInputSchema.safeParse({ ...base, recibidoPor: "  ", firmaUrl: "x" }).error?.issues[0]?.message).toBe(
      "Escribe el nombre de quien recibe",
    );
  });

  it("acepta cualquiera de las dos firmas y solo una", () => {
    expect(actaEntregaInputSchema.safeParse({ ...base, firmaUrl: "x" }).success).toBe(true);
    expect(actaEntregaInputSchema.safeParse({ ...base, firmaFotoUrl: "y" }).success).toBe(true);

    expect(actaEntregaInputSchema.safeParse(base).error?.issues[0]?.message).toBe("Falta la firma de quien recibe");
    expect(actaEntregaInputSchema.safeParse({ ...base, firmaUrl: "x", firmaFotoUrl: "y" }).error?.issues[0]?.message).toBe(
      "Deja solo una firma: la de pantalla o la foto",
    );
  });

  it("acota el documento y las observaciones", () => {
    expect(actaEntregaInputSchema.safeParse({ ...base, documentoRecibe: "x".repeat(41), firmaUrl: "x" }).success).toBe(false);
    expect(actaEntregaInputSchema.safeParse({ ...base, observaciones: "x".repeat(501), firmaUrl: "x" }).success).toBe(false);
    expect(actaEntregaInputSchema.safeParse({ ...base, documentoRecibe: "", observaciones: "", firmaUrl: "x" }).data).toEqual({
      recibidoPor: "María Pérez",
      documentoRecibe: undefined,
      observaciones: undefined,
      firmaUrl: "x",
    });
  });

  it("no deja firmar sin firma ni con dos firmas", () => {
    const datos = { recibidoPor: "María Pérez", documentoRecibe: "", observaciones: "" };
    expect(actaEntregaInputSchema.safeParse(datos).success).toBe(false);
    expect(actaEntregaInputSchema.safeParse({ ...datos, firmaUrl: "a", firmaFotoUrl: "b" }).success).toBe(false);
    expect(actaEntregaInputSchema.safeParse({ ...datos, firmaUrl: "a" }).success).toBe(true);
    expect(actaEntregaInputSchema.safeParse({ ...datos, firmaFotoUrl: "a" }).success).toBe(true);
  });
});

describe("garantiaInputSchema", () => {
  const base = { descripcion: "  Cambio de aceite  " };

  it("una garantía de trabajo exige la línea de mano de obra", () => {
    const r = garantiaInputSchema.safeParse({ ...base, tipo: "TRABAJO", manoDeObraId: "m1" });

    expect(r.success).toBe(true);
    expect(r.data?.descripcion).toBe("Cambio de aceite");
    expect(garantiaInputSchema.safeParse({ ...base, tipo: "TRABAJO" }).error?.issues[0]?.message).toBe(
      "Elige el trabajo que cubre la garantía",
    );
    expect(garantiaInputSchema.safeParse({ ...base, tipo: "TRABAJO", itemOrdenId: "i1" }).error?.issues[0]?.message).toBe(
      "Elige el trabajo que cubre la garantía",
    );
  });

  it("una garantía de repuesto exige la línea del ítem", () => {
    expect(garantiaInputSchema.safeParse({ ...base, tipo: "REPUESTO", itemOrdenId: "i1" }).success).toBe(true);
    expect(garantiaInputSchema.safeParse({ ...base, tipo: "REPUESTO" }).error?.issues[0]?.message).toBe(
      "Elige el repuesto que cubre la garantía",
    );
  });

  it("valida la cobertura por fecha y por kilometraje", () => {
    const r = garantiaInputSchema.safeParse({
      ...base,
      tipo: "TRABAJO",
      manoDeObraId: "m1",
      cubreHasta: "2027-03-15",
      cubreHastaKm: "95000",
    });

    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ cubreHasta: "2027-03-15", cubreHastaKm: 95000 });

    expect(
      garantiaInputSchema.safeParse({ ...base, tipo: "TRABAJO", manoDeObraId: "m1", cubreHasta: "15/03/2027" }).error
        ?.issues[0]?.message,
    ).toBe("La fecha debe tener el formato AAAA-MM-DD");
    expect(
      garantiaInputSchema.safeParse({ ...base, tipo: "TRABAJO", manoDeObraId: "m1", cubreHasta: "2027-02-30" }).error
        ?.issues[0]?.message,
    ).toBe("La fecha no existe en el calendario");
    expect(
      garantiaInputSchema.safeParse({ ...base, tipo: "TRABAJO", manoDeObraId: "m1", cubreHastaKm: "-5" }).error?.issues[0]
        ?.message,
    ).toBe("El kilometraje no puede ser negativo");
  });

  it("sin cobertura sigue siendo válida (garantía informativa)", () => {
    const r = garantiaInputSchema.safeParse({ ...base, tipo: "REPUESTO", itemOrdenId: "i1", cubreHasta: "", cubreHastaKm: "" });

    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ cubreHasta: undefined, cubreHastaKm: undefined });
  });

  it("exige la descripción y acota la nota", () => {
    expect(garantiaInputSchema.safeParse({ tipo: "TRABAJO", manoDeObraId: "m1", descripcion: " " }).error?.issues[0]?.message).toBe(
      "Escribe qué cubre la garantía",
    );
    expect(
      garantiaInputSchema.safeParse({ ...base, tipo: "TRABAJO", manoDeObraId: "m1", nota: "x".repeat(301) }).error?.issues[0]
        ?.message,
    ).toBe("La nota admite máximo 300 caracteres");
  });
});
