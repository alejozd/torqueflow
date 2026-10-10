import { describe, expect, it } from "vitest";
import { calcularRecurrentesPendientes, type PlantillaParaPendientes } from "./recurrentes-pendientes";

function plantilla(overrides: Partial<PlantillaParaPendientes> = {}): PlantillaParaPendientes {
  return {
    id: "r1", descripcion: "Arriendo", categoriaNombre: "Arriendo", montoEstimado: 1500000,
    diaDelMes: 5, desde: "2026-08", activo: true, periodosResueltos: [], ...overrides,
  };
}

describe("calcularRecurrentesPendientes", () => {
  it("lista cada mes sin resolver desde `desde` hasta el actual", () => {
    const r = calcularRecurrentesPendientes([plantilla({ periodosResueltos: ["2026-09"] })], "2026-10");
    expect(r.map((p) => p.periodo)).toEqual(["2026-08", "2026-10"]);
    expect(r[0]).toMatchObject({ recurrenteId: "r1", montoEstimado: 1500000 });
    expect(r[0].fechaSugerida.toISOString()).toBe("2026-08-05T00:00:00.000Z");
  });

  it("ignora plantillas inactivas y las que empiezan en el futuro", () => {
    expect(
      calcularRecurrentesPendientes([plantilla({ activo: false }), plantilla({ id: "r2", desde: "2026-11" })], "2026-10"),
    ).toEqual([]);
  });

  it("ordena por periodo y luego por descripción", () => {
    const r = calcularRecurrentesPendientes(
      [plantilla({ id: "b", descripcion: "Internet", desde: "2026-10" }), plantilla({ id: "a", descripcion: "Arriendo", desde: "2026-10" })],
      "2026-10",
    );
    expect(r.map((p) => p.descripcion)).toEqual(["Arriendo", "Internet"]);
  });
});
