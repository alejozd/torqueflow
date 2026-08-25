import { describe, expect, it } from "vitest";
import { getLoginErrorMessage } from "./login-error-message";

describe("getLoginErrorMessage", () => {
  it("returns the tenant mismatch message for 'tenant-mismatch'", () => {
    expect(getLoginErrorMessage("tenant-mismatch")).toBe(
      "Tu sesión no corresponde a este taller. Vuelve a iniciar sesión.",
    );
  });

  it("returns the forbidden message for 'forbidden'", () => {
    expect(getLoginErrorMessage("forbidden")).toBe(
      "No tienes permiso para acceder a esa sección.",
    );
  });

  it("returns the tenant-suspended message for 'tenant-suspendido'", () => {
    expect(getLoginErrorMessage("tenant-suspendido")).toBe(
      "Tu taller está suspendido. Contacta al proveedor del servicio.",
    );
  });

  it("returns null when no code is provided", () => {
    expect(getLoginErrorMessage(undefined)).toBeNull();
  });

  it("returns null for an unrecognized code", () => {
    expect(getLoginErrorMessage("something-else")).toBeNull();
  });
});
