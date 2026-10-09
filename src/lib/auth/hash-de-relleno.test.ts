import { describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { compararConHashDeRelleno } from "./hash-de-relleno";

describe("compararConHashDeRelleno", () => {
  it("pays for a real cost-12 bcrypt comparison, the same cost as the app's password hashes", async () => {
    const compare = vi.spyOn(bcrypt, "compare");

    await compararConHashDeRelleno("lo-que-sea");

    const [password, hash] = compare.mock.calls[0];
    expect(password).toBe("lo-que-sea");
    expect(bcrypt.getRounds(hash as string)).toBe(12);
    compare.mockRestore();
  });

  it("never matches, whatever the password", async () => {
    const compare = vi.spyOn(bcrypt, "compare");

    await compararConHashDeRelleno("");
    await expect(compare.mock.results[0].value).resolves.toBe(false);
    compare.mockRestore();
  });
});
