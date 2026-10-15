import { describe, expect, it } from "vitest";
import { resumirKitsDeOrden } from "./kits-orden";

const ACEITE = { grupoKitId: "g1", grupoKitNombre: "Cambio de aceite" };
const SUELTO = { grupoKitId: null, grupoKitNombre: null };

describe("resumirKitsDeOrden", () => {
  it("junta repuestos y mano de obra del mismo kit con su subtotal", () => {
    const kits = resumirKitsDeOrden(
      [
        { ...ACEITE, cantidad: 4, precioUnitario: 38000 },
        { ...SUELTO, cantidad: 1, precioUnitario: 192840 },
      ],
      [{ ...ACEITE, valor: 98000 }],
    );

    expect(kits).toEqual([{ grupoKitId: "g1", nombre: "Cambio de aceite", conceptos: 2, subtotal: 250000 }]);
  });

  it("el mismo kit aplicado dos veces cuenta como dos", () => {
    const kits = resumirKitsDeOrden(
      [
        { ...ACEITE, cantidad: 1, precioUnitario: 100 },
        { grupoKitId: "g2", grupoKitNombre: "Cambio de aceite", cantidad: 1, precioUnitario: 100 },
      ],
      [],
    );

    expect(kits.map((kit) => kit.grupoKitId)).toEqual(["g1", "g2"]);
  });

  it("sin kits no devuelve nada", () => {
    expect(resumirKitsDeOrden([{ ...SUELTO, cantidad: 1, precioUnitario: 1 }], [{ ...SUELTO, valor: 1 }])).toEqual([]);
  });
});
