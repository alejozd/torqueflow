import { describe, expect, it } from "vitest";
import { isValidTenantSlug } from "./subdomain";

describe("isValidTenantSlug", () => {
  it("accepts a valid lowercase alphanumeric-with-hyphens slug", () => {
    expect(isValidTenantSlug("taller-perez")).toBe(true);
  });

  // Fase 10: there is no subdomain routing to collide with anymore, so a
  // word that used to be reserved (www/app/api/admin) is just a normal slug
  // now -- only the format is validated.
  it.each(["www", "app", "api", "admin"])("accepts the formerly-reserved word %s", (word) => {
    expect(isValidTenantSlug(word)).toBe(true);
  });

  it("rejects a slug with uppercase letters", () => {
    expect(isValidTenantSlug("Taller-Perez")).toBe(false);
  });

  it("rejects a slug starting with a digit", () => {
    expect(isValidTenantSlug("1taller")).toBe(false);
  });

  it("rejects a slug containing a dot", () => {
    expect(isValidTenantSlug("taller.perez")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidTenantSlug("")).toBe(false);
  });
});
