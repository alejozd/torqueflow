import { describe, expect, it, vi } from "vitest";

const mockFindUnique = vi.fn();
vi.mock("@/lib/db/public-client", () => ({
  publicDb: { superAdmin: { findUnique: (...args: unknown[]) => mockFindUnique(...args) } },
}));

import bcrypt from "bcryptjs";
import { verifySuperAdminCredentials } from "./verify-credentials";

describe("verifySuperAdminCredentials", () => {
  it("returns the admin when the password matches", async () => {
    const passwordHash = await bcrypt.hash("clave-larga-segura", 12);
    mockFindUnique.mockResolvedValue({ id: "sa1", email: "owner@torqueflow.test", passwordHash, nombre: "Alejo" });

    const admin = await verifySuperAdminCredentials("owner@torqueflow.test", "clave-larga-segura");

    expect(admin?.id).toBe("sa1");
  });

  it("returns null when the email is unknown", async () => {
    mockFindUnique.mockResolvedValue(null);

    const admin = await verifySuperAdminCredentials("unknown@torqueflow.test", "cualquier-cosa");

    expect(admin).toBeNull();
  });

  it("returns null when the password does not match", async () => {
    const passwordHash = await bcrypt.hash("clave-correcta", 12);
    mockFindUnique.mockResolvedValue({ id: "sa1", email: "owner@torqueflow.test", passwordHash, nombre: "Alejo" });

    const admin = await verifySuperAdminCredentials("owner@torqueflow.test", "clave-incorrecta");

    expect(admin).toBeNull();
  });
});
