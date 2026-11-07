import { describe, expect, it } from "vitest";
import { tipoSugeridoLibre } from "./tipo-sugerido-libre";

describe("tipoSugeridoLibre", () => {
  it("sugiere mano de obra cuando el texto lo dice o describe un trabajo", () => {
    expect(tipoSugeridoLibre("mano de obra de cambio de servicio")).toBe("MANO_OBRA");
    expect(tipoSugeridoLibre("Mano de Obra")).toBe("MANO_OBRA");
    expect(tipoSugeridoLibre("MO cambio de aceite")).toBe("MANO_OBRA");
    expect(tipoSugeridoLibre("m.o. frenos")).toBe("MANO_OBRA");
    expect(tipoSugeridoLibre("Revisión de suspensión")).toBe("MANO_OBRA");
    expect(tipoSugeridoLibre("diagnostico con escáner")).toBe("MANO_OBRA");
    expect(tipoSugeridoLibre("Alineación y balanceo")).toBe("MANO_OBRA");
    expect(tipoSugeridoLibre("Instalación de radio")).toBe("MANO_OBRA");
  });

  it("deja repuesto para piezas", () => {
    expect(tipoSugeridoLibre("Filtro de aire")).toBe("REPUESTO");
    expect(tipoSugeridoLibre("Bombillo H4")).toBe("REPUESTO");
    expect(tipoSugeridoLibre("Motor de arranque")).toBe("REPUESTO");
    expect(tipoSugeridoLibre("Amortiguador")).toBe("REPUESTO");
  });
});
