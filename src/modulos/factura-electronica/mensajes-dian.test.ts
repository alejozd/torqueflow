// @vitest-environment node
import { describe, expect, it } from "vitest";
import { esDocumentoYaProcesado, traducirMensajeDian, traducirMensajesDian } from "./mensajes-dian";

describe("traducirMensajeDian", () => {
  it("separa regla, tipo y texto, y explica las reglas conocidas", () => {
    const m = traducirMensajeDian(
      "Regla: FAU02, Rechazo: El Valor Bruto antes de tributos no es igual a la suma de los valores de las líneas de la factura que contienen el valor comercial",
    );
    expect(m.codigo).toBe("FAU02");
    expect(m.tipo).toBe("RECHAZO");
    expect(m.textoDian).toMatch(/^El Valor Bruto/);
    expect(m.explicacion).toBe("El valor antes de impuestos no coincide con la suma de los conceptos.");
    expect(m.comoCorregir).toMatch(/cantidades, precios y descuentos/);
  });

  it("reconoce notificaciones con o sin tilde", () => {
    expect(traducirMensajeDian("Regla: RUT01, Notificación: La validación del estado del RUT próximamente estará disponible.").tipo).toBe(
      "NOTIFICACION",
    );
    expect(traducirMensajeDian("Regla: CBF04, Notificacion: La Descripción informada no se encuentra en la lista").tipo).toBe(
      "NOTIFICACION",
    );
  });

  it("una regla desconocida conserva el texto de la DIAN como explicación", () => {
    const m = traducirMensajeDian("Regla: ZZZ99, Rechazo: Algo nuevo");
    expect(m).toEqual({
      codigo: "ZZZ99",
      tipo: "RECHAZO",
      textoDian: "Algo nuevo",
      explicacion: "Algo nuevo",
      comoCorregir: null,
    });
  });

  it("un texto sin formato de regla se trata como rechazo sin código", () => {
    expect(traducirMensajeDian("El campo es requerido.")).toEqual({
      codigo: null,
      tipo: "RECHAZO",
      textoDian: "El campo es requerido.",
      explicacion: "El campo es requerido.",
      comoCorregir: null,
    });
  });
});

describe("traducirMensajesDian", () => {
  it("acepta texto suelto, lista o vacío", () => {
    expect(traducirMensajesDian(null)).toEqual([]);
    expect(traducirMensajesDian("Regla: 90, Rechazo: Documento procesado anteriormente.")).toHaveLength(1);
    expect(traducirMensajesDian(["Regla: FAU04, Rechazo: x", "Regla: FAU14, Rechazo: y"]).map((m) => m.codigo)).toEqual([
      "FAU04",
      "FAU14",
    ]);
  });
});

describe("esDocumentoYaProcesado", () => {
  it("detecta la Regla 90", () => {
    expect(esDocumentoYaProcesado(traducirMensajesDian("Regla: 90, Rechazo: Documento procesado anteriormente."))).toBe(true);
    expect(esDocumentoYaProcesado(traducirMensajesDian("Regla: FAU14, Rechazo: x"))).toBe(false);
  });
});
