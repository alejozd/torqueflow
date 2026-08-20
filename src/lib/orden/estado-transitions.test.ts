import { describe, expect, it } from "vitest";
import { ESTADO_ORDEN_TRANSITIONS, isValidEstadoTransition } from "./estado-transitions";

describe("isValidEstadoTransition", () => {
  it("allows BORRADOR to move to EN_PROCESO", () => {
    expect(isValidEstadoTransition("BORRADOR", "EN_PROCESO")).toBe(true);
  });

  it("allows BORRADOR to move to ANULADA", () => {
    expect(isValidEstadoTransition("BORRADOR", "ANULADA")).toBe(true);
  });

  it("rejects BORRADOR moving directly to TERMINADA", () => {
    expect(isValidEstadoTransition("BORRADOR", "TERMINADA")).toBe(false);
  });

  it("allows EN_PROCESO to move to TERMINADA or ANULADA", () => {
    expect(isValidEstadoTransition("EN_PROCESO", "TERMINADA")).toBe(true);
    expect(isValidEstadoTransition("EN_PROCESO", "ANULADA")).toBe(true);
  });

  it("allows TERMINADA to move only to ENTREGADA", () => {
    expect(isValidEstadoTransition("TERMINADA", "ENTREGADA")).toBe(true);
    expect(isValidEstadoTransition("TERMINADA", "ANULADA")).toBe(false);
  });

  it("rejects any transition out of ENTREGADA or ANULADA (terminal states)", () => {
    expect(ESTADO_ORDEN_TRANSITIONS.ENTREGADA).toEqual([]);
    expect(ESTADO_ORDEN_TRANSITIONS.ANULADA).toEqual([]);
    expect(isValidEstadoTransition("ENTREGADA", "BORRADOR")).toBe(false);
  });

  it("rejects a no-op transition to the same state", () => {
    expect(isValidEstadoTransition("EN_PROCESO", "EN_PROCESO")).toBe(false);
  });
});
