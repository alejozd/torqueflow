import { describe, expect, it } from "vitest";
import type { BloqueConceptos, ConceptoVista } from "@/lib/conceptos/conceptos";
import { motivoCitaDesdeCotizacion } from "./motivo-cita";

function suelto(descripcion: string): BloqueConceptos {
  return { clase: "suelto", concepto: { descripcion } as ConceptoVista };
}

describe("motivoCitaDesdeCotizacion", () => {
  it("lista los trabajos con el número de la cotización", () => {
    expect(motivoCitaDesdeCotizacion(46, [suelto("Amortiguador delantero Bosch")])).toBe(
      "Cotización #46: Amortiguador delantero Bosch",
    );
  });

  it("un kit cuenta como un trabajo y desde el cuarto se resume", () => {
    const kit: BloqueConceptos = { clase: "kit", grupoKitId: "k1", nombre: "Cambio de aceite", conceptos: [], subtotal: 0, sinExistencia: 0 };
    expect(motivoCitaDesdeCotizacion(43, [kit, suelto("A"), suelto("B"), suelto("C"), suelto("D")])).toBe(
      "Cotización #43: Cambio de aceite, A, B y 2 más",
    );
  });

  it("sin conceptos queda solo el número", () => {
    expect(motivoCitaDesdeCotizacion(7, [])).toBe("Cotización #7");
  });
});
