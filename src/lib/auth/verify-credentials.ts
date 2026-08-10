import bcrypt from "bcryptjs";
import type { TenantPrismaClient } from "@/lib/db/tenant-client";
import type { Usuario } from "@/generated/prisma-tenant";

export async function verifyCredentials(
  tenantDb: TenantPrismaClient,
  email: string,
  password: string,
): Promise<Usuario | null> {
  const usuario = await tenantDb.usuario.findUnique({ where: { email } });
  if (!usuario) return null;

  const matches = await bcrypt.compare(password, usuario.passwordHash);
  if (!matches) return null;

  return usuario;
}
