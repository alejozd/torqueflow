import { describe, expect, it } from "vitest";
import { destinosArrastrables, ofreceMenu, puedeAnular, puedeEntregar, requiereConfirmacion } from "./estado-tono";

describe("destinosArrastrables", () => {
  it("solo ofrece transiciones válidas y nunca Entregada ni Anular", () => {
    expect(destinosArrastrables("BORRADOR")).toEqual(["EN_PROCESO"]);
    expect(destinosArrastrables("EN_PROCESO")).toEqual(["TERMINADA"]);
    // Terminada solo va a Entregada, que se hace desde el acta: no se arrastra.
    expect(destinosArrastrables("TERMINADA")).toEqual([]);
    expect(destinosArrastrables("ENTREGADA")).toEqual([]);
    expect(destinosArrastrables("ANULADA")).toEqual([]);
  });
});

describe("puedeEntregar, puedeAnular y ofreceMenu", () => {
  it("una orden terminada y editable puede entregarse aunque no haya nada que arrastrar", () => {
    expect(puedeEntregar("TERMINADA")).toBe(true);
    expect(destinosArrastrables("TERMINADA")).toEqual([]);
    // Este es el caso que ocultaba el menú justo donde más falta hace.
    expect(ofreceMenu("TERMINADA", true)).toBe(true);
  });

  it("solo se anula desde un estado que lo permita", () => {
    expect(puedeAnular("BORRADOR", true)).toBe(true);
    expect(puedeAnular("EN_PROCESO", true)).toBe(true);
    expect(puedeAnular("TERMINADA", true)).toBe(false);
    expect(puedeAnular("ENTREGADA", true)).toBe(false);
  });

  it("si la orden ya no es editable no se mueve ni se anula", () => {
    for (const estado of ["BORRADOR", "EN_PROCESO", "ENTREGADA", "ANULADA"] as const) {
      expect(ofreceMenu(estado, false)).toBe(false);
      expect(puedeEntregar(estado)).toBe(false);
      expect(puedeAnular(estado, false)).toBe(false);
    }
  });

  it("una orden terminada y ya facturada sigue ofreciendo entregar (la factura no bloquea la entrega)", () => {
    // "No editable" en una TERMINADA solo puede ser por la factura.
    expect(puedeEntregar("TERMINADA")).toBe(true);
    expect(ofreceMenu("TERMINADA", false)).toBe(true);
    expect(puedeAnular("TERMINADA", false)).toBe(false);
  });

  it("anular es el único movimiento que pide confirmación", () => {
    expect(requiereConfirmacion("ANULADA")).toBe(true);
    for (const destino of ["EN_PROCESO", "TERMINADA", "ENTREGADA"] as const) {
      expect(requiereConfirmacion(destino)).toBe(false);
    }
  });
});
