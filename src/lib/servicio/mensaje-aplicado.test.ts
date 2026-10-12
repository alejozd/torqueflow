import { describe, expect, it } from "vitest";
import { mensajeServicioAplicado } from "./mensaje-aplicado";

describe("mensajeServicioAplicado", () => {
  it("nombra la mano de obra y los repuestos que se agregaron", () => {
    expect(mensajeServicioAplicado({ manoDeObra: true, repuestos: 2 })).toBe(
      "Servicio agregado: mano de obra y 2 repuestos",
    );
  });

  it("usa el singular con un solo repuesto", () => {
    expect(mensajeServicioAplicado({ manoDeObra: true, repuestos: 1 })).toBe("Servicio agregado: mano de obra y 1 repuesto");
  });

  it("no menciona la mano de obra cuando el kit no la trae", () => {
    expect(mensajeServicioAplicado({ manoDeObra: false, repuestos: 3 })).toBe("Servicio agregado: 3 repuestos");
  });

  it("no menciona repuestos cuando solo es mano de obra", () => {
    expect(mensajeServicioAplicado({ manoDeObra: true, repuestos: 0 })).toBe("Servicio agregado: mano de obra");
  });
});
