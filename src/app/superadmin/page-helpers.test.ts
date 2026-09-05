import { describe, expect, it } from "vitest";
import { inicialesDeSlug, colorAvatarPorId, limiteSedesLabel, construirIdsDisplay } from "./page-helpers";

describe("inicialesDeSlug", () => {
  it("toma la inicial de las dos primeras palabras separadas por guion", () => {
    expect(inicialesDeSlug("taller-dev")).toBe("TD");
  });

  it("usa las dos primeras letras cuando el slug es una sola palabra", () => {
    expect(inicialesDeSlug("tallerprincipal")).toBe("TA");
  });
});

describe("limiteSedesLabel", () => {
  it("indica multisede sin limite cuando maxSedes es null", () => {
    expect(limiteSedesLabel(null)).toBe("Multisede (sin límite)");
  });

  it("pluraliza para mas de una sede", () => {
    expect(limiteSedesLabel(3)).toBe("Hasta 3 sedes");
  });

  it("no pluraliza para una sola sede", () => {
    expect(limiteSedesLabel(1)).toBe("Hasta 1 sede");
  });
});

describe("colorAvatarPorId", () => {
  it("es deterministico para el mismo id", () => {
    expect(colorAvatarPorId("abc123")).toBe(colorAvatarPorId("abc123"));
  });

  it("devuelve una clase de fondo de la paleta conocida", () => {
    expect(colorAvatarPorId("abc123")).toMatch(/^bg-/);
  });
});

describe("construirIdsDisplay", () => {
  it("asigna #TNT-001 al tenant creado primero, ordenando por createdAt", () => {
    const tenants = [
      { id: "b", createdAt: new Date("2026-02-01") },
      { id: "a", createdAt: new Date("2026-01-01") },
    ];
    const ids = construirIdsDisplay(tenants);
    expect(ids.get("a")).toBe("#TNT-001");
    expect(ids.get("b")).toBe("#TNT-002");
  });

  it("rellena con ceros hasta 3 digitos", () => {
    const tenants = Array.from({ length: 11 }, (_, i) => ({
      id: `t${i}`,
      createdAt: new Date(2026, 0, i + 1),
    }));
    const ids = construirIdsDisplay(tenants);
    expect(ids.get("t10")).toBe("#TNT-011");
  });
});
