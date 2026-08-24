import { describe, expect, it, afterEach } from "vitest";
import bcrypt from "bcryptjs";
import { publicDb } from "@/lib/db/public-client";
import { seedSuperAdmin } from "./seed-super-admin";

const EMAIL = "owner@torqueflow.test";

afterEach(async () => {
  await publicDb.superAdmin.deleteMany({ where: { email: EMAIL } });
});

describe("seedSuperAdmin", () => {
  it("creates a SuperAdmin row with a bcrypt-hashed password", async () => {
    const admin = await seedSuperAdmin({ email: EMAIL, password: "clave-larga-segura", nombre: "Alejo" });

    expect(admin.email).toBe(EMAIL);
    expect(admin.passwordHash).not.toBe("clave-larga-segura");
    expect(await bcrypt.compare("clave-larga-segura", admin.passwordHash)).toBe(true);
  });

  it("is idempotent: re-seeding the same email updates it instead of duplicating", async () => {
    await seedSuperAdmin({ email: EMAIL, password: "clave-vieja", nombre: "Alejo" });
    await seedSuperAdmin({ email: EMAIL, password: "clave-nueva", nombre: "Alejo Z." });

    const admins = await publicDb.superAdmin.findMany({ where: { email: EMAIL } });
    expect(admins).toHaveLength(1);
    expect(admins[0].nombre).toBe("Alejo Z.");
    expect(await bcrypt.compare("clave-nueva", admins[0].passwordHash)).toBe(true);
  });
});
