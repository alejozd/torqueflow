import { describe, expect, it } from "vitest";
import { agruparConceptos, contarConceptos, esConceptoLibre, type ConceptoVista } from "./agrupar-conceptos";

function concepto(overrides: Partial<ConceptoVista>): ConceptoVista {
  return {
    id: "i",
    tipo: "REPUESTO",
    descripcion: "x",
    repuestoId: "r",
    codigo: "C-1",
    cantidad: 1,
    precioUnitario: 1000,
    precioCatalogo: 1000,
    stockActual: 10,
    grupoKitId: null,
    grupoKitNombre: null,
    ...overrides,
  };
}

describe("agruparConceptos", () => {
  it("deja sueltas las líneas sin kit y en su orden", () => {
    const bloques = agruparConceptos([concepto({ id: "a" }), concepto({ id: "b" })]);

    expect(bloques.map((b) => (b.clase === "suelto" ? b.concepto.id : b.grupoKitId))).toEqual(["a", "b"]);
  });

  it("junta las líneas de un kit donde apareció la primera, con su subtotal", () => {
    const kit = { grupoKitId: "g1", grupoKitNombre: "Cambio de aceite" };
    const bloques = agruparConceptos([
      concepto({ id: "a" }),
      concepto({ id: "k1", cantidad: 4, precioUnitario: 38000, ...kit }),
      concepto({ id: "b" }),
      concepto({ id: "k2", tipo: "MANO_OBRA", repuestoId: null, stockActual: null, precioUnitario: 98000, ...kit }),
    ]);

    expect(bloques).toHaveLength(3);
    expect(bloques[1]).toMatchObject({ clase: "kit", nombre: "Cambio de aceite", subtotal: 250000, sinExistencia: 0 });
    expect(bloques[1].clase === "kit" && bloques[1].conceptos.map((c) => c.id)).toEqual(["k1", "k2"]);
  });

  it("el mismo kit aplicado dos veces da dos bloques", () => {
    const bloques = agruparConceptos([
      concepto({ grupoKitId: "g1", grupoKitNombre: "Cambio de aceite" }),
      concepto({ grupoKitId: "g2", grupoKitNombre: "Cambio de aceite" }),
    ]);

    expect(bloques.filter((b) => b.clase === "kit")).toHaveLength(2);
  });

  it("cuenta los repuestos del kit que no tienen existencia suficiente", () => {
    const kit = { grupoKitId: "g1", grupoKitNombre: "Frenos" };
    const [bloque] = agruparConceptos([
      concepto({ cantidad: 4, stockActual: 2, ...kit }),
      concepto({ cantidad: 1, stockActual: 0, ...kit }),
      concepto({ cantidad: 1, stockActual: 5, ...kit }),
    ]);

    expect(bloque).toMatchObject({ sinExistencia: 2 });
  });
});

describe("contarConceptos", () => {
  it("separa repuestos y mano de obra", () => {
    expect(contarConceptos([{ tipo: "REPUESTO" }, { tipo: "MANO_OBRA" }, { tipo: "REPUESTO" }])).toEqual({
      total: 3,
      repuestos: 2,
      manoDeObra: 1,
    });
  });
});

describe("esConceptoLibre", () => {
  it("solo lo que no viene del inventario ni de un kit es libre", () => {
    expect(esConceptoLibre({ repuestoId: null, grupoKitId: null })).toBe(true);
    expect(esConceptoLibre({ repuestoId: "r1", grupoKitId: null })).toBe(false);
    expect(esConceptoLibre({ repuestoId: null, grupoKitId: "g1" })).toBe(false);
  });
});
