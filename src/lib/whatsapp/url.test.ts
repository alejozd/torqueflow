import { describe, expect, it } from "vitest";
import { urlWhatsapp } from "./url";

describe("urlWhatsapp", () => {
  it("adds Colombia's country code to 10-digit numbers and encodes the text", () => {
    expect(urlWhatsapp("310 555 0142", "Hola *#3*")).toBe("https://wa.me/573105550142?text=Hola%20*%233*");
  });

  it("keeps numbers that already carry a country code", () => {
    expect(urlWhatsapp("+57 601 555 0142", "x")).toBe("https://wa.me/576015550142?text=x");
  });

  it("returns null without a usable number", () => {
    expect(urlWhatsapp(null, "x")).toBeNull();
    expect(urlWhatsapp("123", "x")).toBeNull();
  });
});
