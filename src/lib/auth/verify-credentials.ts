import bcrypt from "bcryptjs";
import type { TenantPrismaClient } from "@/lib/db/tenant-client";
import type { Usuario } from "@/generated/prisma-tenant";
import { compararConHashDeRelleno } from "@/lib/auth/hash-de-relleno";

export async function verifyCredentials(
  tenantDb: TenantPrismaClient,
  email: string,
  password: string,
): Promise<Usuario | null> {
  const usuario = await tenantDb.usuario.findUnique({ where: { email } });
  if (!usuario) {
    // Same cost as a wrong password, so timing does not reveal the email is unknown.
    await compararConHashDeRelleno(password);
    return null;
  }

  const matches = await bcrypt.compare(password, usuario.passwordHash);
  if (!matches) return null;

  return usuario;
}
