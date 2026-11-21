// src/modulos/factura-electronica/proveedores/nextpyme/interpretar.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { interpretarRespuestaEnvio, interpretarRespuestaEstado } from "./interpretar";
import aceptada from "./__fixtures__/factura-aceptada.json";
import rechazada from "./__fixtures__/factura-rechazada.json";
import error422 from "./__fixtures__/error-422.json";
import estadoAceptado from "./__fixtures__/estado-aceptado.json";

describe("interpretarRespuestaEnvio", () => {
  it("aceptada: CUFE, fecha con zona horaria y avisos como advertencias", () => {
    const r = interpretarRespuestaEnvio(200, aceptada);
    expect(r).toEqual({
      estado: "ACEPTADO",
      cufe: aceptada.cufe,
      fechaValidacion: "2026-07-23T16:25:28-05:00",
      advertencias: [expect.objectContaining({ codigo: "RUT01", tipo: "NOTIFICACION" })],
    });
  });

  it("rechazada: solo los rechazos como motivos, ya traducidos", () => {
    const r = interpretarRespuestaEnvio(200, rechazada);
    expect(r.estado).toBe("RECHAZADO");
    if (r.estado !== "RECHAZADO") return;
    expect(r.motivos.map((m) => m.codigo)).toEqual(["FAU02", "FAU14"]);
    expect(r.motivos[0].explicacion).toBe("El valor antes de impuestos no coincide con la suma de los conceptos.");
  });

  it("422 de Nextpyme: rechazo con los mensajes de validación", () => {
    const r = interpretarRespuestaEnvio(422, error422);
    expect(r.estado).toBe("RECHAZADO");
    if (r.estado !== "RECHAZADO") return;
    expect(r.motivos.map((m) => m.textoDian)).toEqual([
      "Error, este prefijo no es valido para esta empresa.",
      "El número debe estar entre X y Y.",
    ]);
  });

  it("401/403: error de configuración", () => {
    expect(interpretarRespuestaEnvio(401, { message: "Unauthenticated." })).toEqual({
      estado: "ERROR_CONFIGURACION",
      mensaje: "La conexión con el proveedor no es válida. Revisa el token en Configuración del taller.",
    });
    expect(interpretarRespuestaEnvio(403, {}).estado).toBe("ERROR_CONFIGURACION");
  });

  it("5xx, sin respuesta o respuesta rara: error temporal", () => {
    expect(interpretarRespuestaEnvio(502, null).estado).toBe("ERROR_TEMPORAL");
    expect(interpretarRespuestaEnvio(0, null).estado).toBe("ERROR_TEMPORAL");
    expect(interpretarRespuestaEnvio(200, { success: true }).estado).toBe("ERROR_TEMPORAL");
  });
});

describe("interpretarRespuestaEstado", () => {
  it("aceptado: usa el CUFE consultado", () => {
    expect(interpretarRespuestaEstado(200, estadoAceptado, "abc")).toEqual({
      estado: "ACEPTADO",
      cufe: "abc",
      fechaValidacion: "",
      advertencias: [],
    });
  });

  it("404: no encontrado", () => {
    expect(interpretarRespuestaEstado(404, {}, "abc")).toEqual({ estado: "NO_ENCONTRADO" });
  });
});
