import { describe, expect, it } from "vitest";
import { pestanaInicial, resumenEntrega, resumenInspeccion } from "./pestanas";

describe("pestanaInicial", () => {
  it("abre donde está el trabajo según el estado", () => {
    expect(pestanaInicial("BORRADOR")).toBe("recepcion");
    expect(pestanaInicial("EN_PROCESO")).toBe("trabajo");
    expect(pestanaInicial("TERMINADA")).toBe("entrega");
    expect(pestanaInicial("ENTREGADA")).toBe("entrega");
    expect(pestanaInicial("ANULADA")).toBe("trabajo");
  });

  it("una pestaña válida en la URL manda; una inválida se ignora", () => {
    expect(pestanaInicial("BORRADOR", "inspeccion")).toBe("inspeccion");
    expect(pestanaInicial("BORRADOR", "informacion")).toBe("recepcion");
    expect(pestanaInicial("BORRADOR", null)).toBe("recepcion");
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
