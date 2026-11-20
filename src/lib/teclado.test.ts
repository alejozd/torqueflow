import { describe, expect, it } from "vitest";
import { esEnterConfirmado } from "./teclado";

function evento(key: string, isComposing = false, keyCode = key === "Enter" ? 13 : 0) {
  return { key, nativeEvent: { isComposing, keyCode } };
}

describe("esEnterConfirmado", () => {
  it("acepta un Enter normal", () => {
    expect(esEnterConfirmado(evento("Enter"))).toBe(true);
  });

  it("ignora otras teclas", () => {
    expect(esEnterConfirmado(evento("Escape"))).toBe(false);
  });

  it("ignora el Enter que confirma una palabra en composición", () => {
    expect(esEnterConfirmado(evento("Enter", true))).toBe(false);
  });

  it("ignora el Enter con keyCode 229 (Safari)", () => {
    expect(esEnterConfirmado(evento("Enter", false, 229))).toBe(false);
  });
});
