import { describe, expect, it } from "vitest";
import { MENSAJE_VIN_INVALIDO, placaFormatoHabitual, vehiculoInputSchema } from "./vehiculo";

const base = { placa: "ABC123", marca: "Mazda", modelo: "3" };

describe("vehiculoInputSchema — campos de Fase 15", () => {
  it("usa CARRO como tipo por defecto", () => {
    expect(vehiculoInputSchema.parse(base).tipo).toBe("CARRO");
  });

  it("normaliza el VIN a mayúsculas y sin espacios", () => {
    const r = vehiculoInputSchema.parse({ ...base, vin: " 9bwzzz377vt004251 " });
    expect(r.vin).toBe("9BWZZZ377VT004251");
  });

  it("rechaza VIN con longitud distinta de 17 o con I/O/Q", () => {
    for (const vin of ["9BWZZZ377VT00425", "9BWZZZ377VT00425I", "OBWZZZ377VT004251"]) {
      const r = vehiculoInputSchema.safeParse({ ...base, vin });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0]?.message).toBe(MENSAJE_VIN_INVALIDO);
    }
  });

  it("acepta fechas de vencimiento como string YYYY-MM-DD", () => {
    const r = vehiculoInputSchema.parse({ ...base, soatVence: "2026-11-30", tecnomecanicaVence: "2027-01-15" });
    expect(r.soatVence?.toISOString()).toBe("2026-11-30T00:00:00.000Z");
    expect(r.tecnomecanicaVence?.toISOString()).toBe("2027-01-15T00:00:00.000Z");
  });
});

describe("placaFormatoHabitual", () => {
  it("valida carro/camioneta/camión como ABC123", () => {
    expect(placaFormatoHabitual("ABC123", "CARRO")).toBe(true);
    expect(placaFormatoHabitual("abc-123", "CAMION")).toBe(true);
    expect(placaFormatoHabitual("ABC12D", "CAMIONETA")).toBe(false);
  });

  it("valida moto como ABC12D", () => {
    expect(placaFormatoHabitual("ABC12D", "MOTO")).toBe(true);
    expect(placaFormatoHabitual("ABC123", "MOTO")).toBe(false);
  });
});
