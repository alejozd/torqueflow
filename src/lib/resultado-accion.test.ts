import { describe, expect, it } from "vitest";
import { resultadoDeAccion } from "./resultado-accion";

describe("resultadoDeAccion", () => {
  it("returns success when the action resolves", async () => {
    await expect(resultadoDeAccion(async () => {}, "Error")).resolves.toEqual({ error: null, success: true });
  });

  it("returns the thrown message as data", async () => {
    const resultado = await resultadoDeAccion(async () => {
      throw new Error("No puedes eliminar al único administrador del taller.");
    }, "Error al eliminar");
    expect(resultado).toEqual({ error: "No puedes eliminar al único administrador del taller.", success: false });
  });

  it("falls back to the default message for non-Error throws", async () => {
    const resultado = await resultadoDeAccion(async () => {
      throw "boom";
    }, "Error al eliminar");
    expect(resultado).toEqual({ error: "Error al eliminar", success: false });
  });

  it("re-throws Next's redirect/notFound control-flow errors", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
    await expect(
      resultadoDeAccion(async () => {
        throw redirect;
      }, "Error"),
    ).rejects.toBe(redirect);
  });
});
