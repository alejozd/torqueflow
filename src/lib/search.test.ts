import { describe, expect, it } from "vitest";
import { normalizeForSearch } from "./search";

describe("normalizeForSearch", () => {
  it("matches text typed without accents against accented data", () => {
    expect(normalizeForSearch("María Gómez").includes(normalizeForSearch("Maria"))).toBe(true);
    expect(normalizeForSearch("María Gómez").includes(normalizeForSearch("Gomez"))).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(normalizeForSearch("HCM162").includes(normalizeForSearch("hcm"))).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(normalizeForSearch("Alejandro Zambrano").includes(normalizeForSearch("Maria"))).toBe(false);
  });
});
