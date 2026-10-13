import { describe, expect, it, vi } from "vitest";
import { FRECUENCIA_POR_DEFECTO, leerFrecuenciaLiquidacion } from "./configuracion";

function lector(fila: { frecuenciaLiquidacion: "SEMANAL" | "QUINCENAL" | "MENSUAL" } | null) {
  return { configuracionTaller: { findUnique: vi.fn().mockResolvedValue(fila) } };
}

describe("leerFrecuenciaLiquidacion", () => {
  it("usa el valor por defecto cuando el taller nunca guardó la configuración", async () => {
    await expect(leerFrecuenciaLiquidacion(lector(null) as never)).resolves.toBe(FRECUENCIA_POR_DEFECTO);
    expect(FRECUENCIA_POR_DEFECTO).toBe("MENSUAL");
  });

  it("devuelve la frecuencia guardada", async () => {
    await expect(leerFrecuenciaLiquidacion(lector({ frecuenciaLiquidacion: "QUINCENAL" }) as never)).resolves.toBe(
      "QUINCENAL",
    );
  });
});
