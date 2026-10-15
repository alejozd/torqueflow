import { describe, expect, it } from "vitest";
import { pestanaInicial, pestanasGestionadas, resumenEntrega, resumenInspeccion } from "./pestanas";

describe("pestanaInicial", () => {
  it("al volver a una orden entra por Trabajo (lo que más se consulta); terminada, por la entrega", () => {
    expect(pestanaInicial("BORRADOR")).toBe("trabajo");
    expect(pestanaInicial("EN_PROCESO")).toBe("trabajo");
    expect(pestanaInicial("TERMINADA")).toBe("entrega");
    expect(pestanaInicial("ENTREGADA")).toBe("trabajo");
    expect(pestanaInicial("ANULADA")).toBe("trabajo");
  });

  it("una pestaña válida en la URL manda (recién creada llega con ?tab=recepcion); una inválida se ignora", () => {
    expect(pestanaInicial("BORRADOR", "recepcion")).toBe("recepcion");
    expect(pestanaInicial("BORRADOR", "informacion")).toBe("trabajo");
    expect(pestanaInicial("BORRADOR", null)).toBe("trabajo");
  });
});

describe("pestanasGestionadas", () => {
  it("marca lo que ya se hizo en cada pestaña", () => {
    expect(
      pestanasGestionadas({
        estado: "BORRADOR",
        kilometraje: 185210,
        combustible: null,
        lineasTrabajo: 2,
        revisados: 8,
        totalChecklist: 8,
        actaFirmada: false,
      }),
    ).toEqual({ recepcion: false, trabajo: true, inspeccion: true, entrega: false });
    expect(
      pestanasGestionadas({
        estado: "ENTREGADA",
        kilometraje: 185210,
        combustible: "MEDIO",
        lineasTrabajo: 0,
        revisados: 0,
        totalChecklist: 0,
        actaFirmada: false,
      }),
    ).toEqual({ recepcion: true, trabajo: false, inspeccion: false, entrega: true });
  });
});

describe("resumenInspeccion", () => {
  it("cuenta lo revisado y avisa lo crítico primero", () => {
    expect(resumenInspeccion([], 8)).toEqual({ texto: "0 de 8 revisados", tono: "gris" });
    expect(resumenInspeccion(["OK"], 8)).toEqual({ texto: "1 de 8 revisados", tono: "verde" });
    expect(resumenInspeccion(["OK", "ATENCION", "CRITICO", "CRITICO"], 8)).toEqual({
      texto: "4 de 8 revisados · 2 críticos · 1 atención",
      tono: "rojo",
    });
    expect(resumenInspeccion(["ATENCION"], 8).tono).toBe("ambar");
  });
});

describe("resumenEntrega", () => {
  it("dice en qué va el acta", () => {
    expect(resumenEntrega("BORRADOR", false)).toEqual({ texto: "Pendiente", tono: "gris" });
    expect(resumenEntrega("TERMINADA", false)).toEqual({ texto: "Lista para firmar", tono: "azul" });
    expect(resumenEntrega("TERMINADA", true)).toEqual({ texto: "Firmada", tono: "verde" });
    expect(resumenEntrega("ENTREGADA", false)).toEqual({ texto: "Entregada", tono: "verde" });
  });
});
