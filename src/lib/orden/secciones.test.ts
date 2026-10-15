import { describe, expect, it } from "vitest";
import { seccionesAbiertas } from "./secciones";

describe("seccionesAbiertas", () => {
  it("mientras se arma la orden, todo abierto menos el acta (se usa al entregar)", () => {
    for (const estado of ["BORRADOR", "EN_PROCESO"] as const) {
      const abiertas = seccionesAbiertas(estado);
      expect([...abiertas].sort()).toEqual(["anticipos", "dvi", "items", "mano-obra", "recepcion"]);
      expect(abiertas.has("entrega")).toBe(false);
    }
  });

  it("terminada: el acta pasa al frente; recepción, ítems, mano de obra y DVI quedan para consulta", () => {
    expect([...seccionesAbiertas("TERMINADA")].sort()).toEqual(["anticipos", "entrega"]);
  });

  it("entregada: solo el acta (para firmar después si hace falta); anulada: todo plegado, solo de consulta", () => {
    expect([...seccionesAbiertas("ENTREGADA")]).toEqual(["entrega"]);
    expect([...seccionesAbiertas("ANULADA")]).toEqual([]);
  });
});
