// src/modulos/factura-electronica/proveedores/nextpyme/interpretar.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { interpretarAmbiente, interpretarEmitidos, interpretarRespuestaEnvio, interpretarRespuestaEstado } from "./interpretar";
import emitidos from "./__fixtures__/emitidos.json";
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
      fechaValidacion: null,
      advertencias: [],
    });
  });

  it("404: no encontrado", () => {
    expect(interpretarRespuestaEstado(404, {}, "abc")).toEqual({ estado: "NO_ENCONTRADO" });
  });
});

describe("interpretarRespuestaEnvio — aceptado sin CUFE", () => {
  it("aceptado sin cufe ni XmlDocumentKey: error temporal, no ACEPTADO vacío", () => {
    const cuerpo = JSON.parse(JSON.stringify(aceptada).replace(/"XmlDocumentKey"/g, '"Otra"'));
    delete cuerpo.cufe;
    expect(interpretarRespuestaEnvio(200, cuerpo)).toEqual({
      estado: "ERROR_TEMPORAL",
      mensaje: "El proveedor confirmó el documento pero no devolvió el CUFE. Consulta el estado antes de reenviar.",
    });
  });
});

describe("interpretarRespuestaEnvio — aceptado sin fecha", () => {
  it("sin dian_validation_date_time la fecha queda en null", () => {
    const { dian_validation_date_time: _fecha, ...cuerpo } = aceptada;
    expect(interpretarRespuestaEnvio(200, cuerpo)).toMatchObject({ estado: "ACEPTADO", fechaValidacion: null });
  });
});

describe("interpretarAmbiente", () => {
  it("1 = producción, 2 = pruebas; sin dato, null", () => {
    expect(interpretarAmbiente({ success: true, data: { type_environment_id: 1 } })).toBe("PRODUCCION");
    expect(interpretarAmbiente({ success: true, data: { type_environment_id: 2 } })).toBe("PRUEBAS");
    expect(interpretarAmbiente({ success: true, data: {} })).toBeNull();
    expect(interpretarAmbiente(null)).toBeNull();
  });
});

describe("interpretarEmitidos", () => {
  const ref = { tipo: "FACTURA" as const, prefijo: "FE", numero: 585 };

  it("encuentra por prefijo y número y pasa el total a centavos", () => {
    expect(interpretarEmitidos(200, emitidos, ref)).toEqual({
      estado: "ENCONTRADO",
      cufe: emitidos.documents[0].cufe,
      total: 60000000,
    });
  });

  it("otro número u otro tipo de documento: NO_ENCONTRADO", () => {
    expect(interpretarEmitidos(200, emitidos, { ...ref, numero: 586 })).toEqual({ estado: "NO_ENCONTRADO" });
    expect(interpretarEmitidos(200, emitidos, { ...ref, tipo: "NOTA_CREDITO" })).toEqual({ estado: "NO_ENCONTRADO" });
  });

  it("401 es de configuración; 500 o cuerpo sin lista, temporal", () => {
    expect(interpretarEmitidos(401, {}, ref).estado).toBe("ERROR_CONFIGURACION");
    expect(interpretarEmitidos(500, {}, ref).estado).toBe("ERROR_TEMPORAL");
    expect(interpretarEmitidos(200, { success: true }, ref).estado).toBe("ERROR_TEMPORAL");
  });

  it("lista truncada sin el documento: ERROR_TEMPORAL (no se puede afirmar que no está)", () => {
    expect(interpretarEmitidos(200, { ...emitidos, truncated: true }, { ...ref, numero: 999 }).estado).toBe("ERROR_TEMPORAL");
  });
});
