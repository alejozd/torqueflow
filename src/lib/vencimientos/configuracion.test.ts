import { describe, expect, it, vi } from "vitest";
import { leerDiasAviso } from "./configuracion";

type Lector = Parameters<typeof leerDiasAviso>[0];

describe("leerDiasAviso", () => {
  it("usa 30 si no existe la fila", async () => {
    const tenantDb = { configuracionTaller: { findUnique: vi.fn().mockResolvedValue(null) } };
    expect(await leerDiasAviso(tenantDb as unknown as Lector)).toBe(30);
  });

  it("usa el valor guardado", async () => {
    const tenantDb = { configuracionTaller: { findUnique: vi.fn().mockResolvedValue({ diasAvisoVencimiento: 45 }) } };
    expect(await leerDiasAviso(tenantDb as unknown as Lector)).toBe(45);
  });
});
