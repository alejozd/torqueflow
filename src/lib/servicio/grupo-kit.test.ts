import { describe, expect, it } from "vitest";
import { grupoKitParaServicio } from "./grupo-kit";

describe("grupoKitParaServicio", () => {
  it("un servicio sin repuestos guarda el servicio pero no forma grupo", () => {
    expect(grupoKitParaServicio({ id: "s1", nombre: "Alineación", repuestos: [] })).toEqual({
      grupoKitId: null,
      grupoKitNombre: null,
      servicioId: "s1",
    });
  });

  it("un kit forma grupo con el nombre copiado y un id distinto en cada aplicación", () => {
    const kit = { id: "s2", nombre: "Cambio de aceite", repuestos: [{}, {}] };
    const primero = grupoKitParaServicio(kit);
    const segundo = grupoKitParaServicio(kit);

    expect(primero).toMatchObject({ grupoKitNombre: "Cambio de aceite", servicioId: "s2" });
    expect(primero.grupoKitId).toEqual(expect.any(String));
    expect(segundo.grupoKitId).not.toBe(primero.grupoKitId);
  });
});
