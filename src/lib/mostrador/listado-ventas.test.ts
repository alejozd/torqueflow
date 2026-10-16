import { describe, expect, it } from "vitest";
import { estadoVentaMostrador, quedaPorDevolver, rangoDelFiltro, resumirProductos, ventanaDelRango } from "./listado-ventas";

describe("rangoDelFiltro", () => {
  // 00:30 del 17 en Bogotá (05:30Z): en UTC ya sería otro día distinto al de Bogotá a otras horas.
  const ahora = new Date("2026-10-17T05:30:00Z");

  it("hoy, ayer y los últimos 30 días en días de Bogotá", () => {
    expect(rangoDelFiltro("hoy", ahora)).toEqual({ desde: "2026-10-17", hasta: "2026-10-17" });
    expect(rangoDelFiltro("ayer", ahora)).toEqual({ desde: "2026-10-16", hasta: "2026-10-16" });
    expect(rangoDelFiltro("30dias", ahora)).toEqual({ desde: "2026-09-17", hasta: "2026-10-17" });
  });

  it("antes de la medianoche de Bogotá sigue siendo el día anterior aunque en UTC ya cambió", () => {
    expect(rangoDelFiltro("hoy", new Date("2026-10-17T04:59:00Z"))).toEqual({ desde: "2026-10-16", hasta: "2026-10-16" });
  });
});

describe("ventanaDelRango", () => {
  it("un día va de la medianoche de Bogotá a la siguiente", () => {
    expect(ventanaDelRango({ desde: "2026-10-17", hasta: "2026-10-17" })).toEqual({
      inicio: new Date("2026-10-17T05:00:00Z"),
      fin: new Date("2026-10-18T05:00:00Z"),
    });
  });

  it("acepta hasta 30 días y rechaza 31", () => {
    expect(ventanaDelRango({ desde: "2026-09-17", hasta: "2026-10-17" })).toHaveProperty("inicio");
    expect(ventanaDelRango({ desde: "2026-09-16", hasta: "2026-10-17" })).toEqual({
      error: "El rango puede ser de máximo 30 días",
    });
  });

  it("rechaza fechas mal escritas, inexistentes o al revés", () => {
    expect(ventanaDelRango({ desde: "17/10/2026", hasta: "2026-10-17" })).toEqual({ error: "Fechas inválidas" });
    expect(ventanaDelRango({ desde: "2026-02-31", hasta: "2026-03-01" })).toEqual({ error: "Fechas inválidas" });
    expect(ventanaDelRango({ desde: "2026-10-18", hasta: "2026-10-17" })).toEqual({
      error: "La fecha inicial va antes de la final",
    });
  });
});

describe("estadoVentaMostrador", () => {
  const item = (cantidad: number, devueltoCantidad: number) => ({ cantidad, devueltoCantidad });

  it("pagada o a crédito según el saldo", () => {
    expect(estadoVentaMostrador([item(2, 0)], 0)).toBe("PAGADA");
    expect(estadoVentaMostrador([item(2, 0)], 1000)).toBe("A_CREDITO");
  });

  it("lo devuelto manda: parcial si queda algo, devuelta si ya no queda nada", () => {
    expect(estadoVentaMostrador([item(2, 1)], 0)).toBe("DEVUELTA_PARCIAL");
    expect(estadoVentaMostrador([item(2, 2), item(1, 0)], 500)).toBe("DEVUELTA_PARCIAL");
    expect(estadoVentaMostrador([item(2, 2), item(1, 1)], 0)).toBe("DEVUELTA");
  });
});

describe("resumirProductos", () => {
  it("el primer producto con su cantidad y cuántos más hay", () => {
    expect(resumirProductos([{ descripcion: "Filtro aceite", cantidad: 2 }])).toBe("Filtro aceite ×2");
    expect(
      resumirProductos([
        { descripcion: "Filtro aceite", cantidad: 2 },
        { descripcion: "Bujía", cantidad: 4 },
        { descripcion: "Aceite", cantidad: 1 },
      ]),
    ).toBe("Filtro aceite ×2, +2 más");
    expect(resumirProductos([{ descripcion: "Bujía", cantidad: 1 }])).toBe("Bujía");
    expect(resumirProductos([])).toBe("—");
  });
});

describe("quedaPorDevolver", () => {
  it("sí mientras alguna línea tenga unidades sin devolver", () => {
    expect(quedaPorDevolver([{ cantidad: 2, devueltoCantidad: 2 }, { cantidad: 1, devueltoCantidad: 0 }])).toBe(true);
    expect(quedaPorDevolver([{ cantidad: 2, devueltoCantidad: 2 }])).toBe(false);
  });
});
