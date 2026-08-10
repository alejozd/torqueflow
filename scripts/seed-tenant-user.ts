import bcrypt from "bcryptjs";
import { getTenantDb } from "@/lib/db/tenant-client";
import type { Usuario, Role } from "@/generated/prisma-tenant";

export interface SeedTenantUserInput {
  schemaName: string;
  email: string;
  password: string;
  nombre: string;
  role?: Role;
}

export async function seedTenantUser({
  schemaName,
  email,
  password,
  nombre,
  role = "ADMIN",
}: SeedTenantUserInput): Promise<Usuario> {
  const tenantDb = getTenantDb(schemaName);
  const passwordHash = await bcrypt.hash(password, 12);

  return tenantDb.usuario.upsert({
    where: { email },
    update: { passwordHash, nombre, role },
    create: { email, passwordHash, nombre, role },
  });
}
