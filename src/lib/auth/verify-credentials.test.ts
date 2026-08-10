import { describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { verifyCredentials } from "./verify-credentials";
import type { TenantPrismaClient } from "@/lib/db/tenant-client";

function fakeTenantDb(usuario: unknown): TenantPrismaClient {
  return {
    usuario: { findUnique: vi.fn().mockResolvedValue(usuario) },
  } as unknown as TenantPrismaClient;
}

describe("verifyCredentials", () => {
  it("returns null when no Usuario matches the email", async () => {
    const tenantDb = fakeTenantDb(null);

    const result = await verifyCredentials(tenantDb, "nadie@example.com", "whatever");

    expect(result).toBeNull();
  });

  it("returns null when the password does not match the stored hash", async () => {
    const passwordHash = await bcrypt.hash("correct-password", 12);
    const tenantDb = fakeTenantDb({ id: "1", email: "a@example.com", passwordHash, role: "ADMIN" });

    const result = await verifyCredentials(tenantDb, "a@example.com", "wrong-password");

    expect(result).toBeNull();
  });

  it("returns the Usuario when the password matches", async () => {
    const passwordHash = await bcrypt.hash("correct-password", 12);
    const usuario = { id: "1", email: "a@example.com", passwordHash, role: "ADMIN" };
    const tenantDb = fakeTenantDb(usuario);

    const result = await verifyCredentials(tenantDb, "a@example.com", "correct-password");

    expect(result).toEqual(usuario);
  });
});
