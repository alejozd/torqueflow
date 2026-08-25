import bcrypt from "bcryptjs";
import { getTenantDb } from "@/lib/db/tenant-client";
import { claimTenantUserEmail } from "@/lib/tenant/tenant-user-email";
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

  const usuario = await tenantDb.usuario.upsert({
    where: { email },
    update: { passwordHash, nombre, role },
    create: { email, passwordHash, nombre, role },
  });

  await claimTenantUserEmail(schemaName, email);

  // Day-one login: a TECNICO/RECEPCION with no UsuarioSede row cannot pass the
  // sede gate in authorizeCredentials, so every seeded user is granted the
  // tenant's oldest sede -- the "Sede principal" provisionTenant creates. An
  // ADMIN does not strictly need the row (it bypasses the check), but having
  // it keeps /usuarios honest about who works where. upsert makes re-seeding
  // the same email idempotent.
  const sede = await tenantDb.sede.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (sede) {
    await tenantDb.usuarioSede.upsert({
      where: { usuarioId_sedeId: { usuarioId: usuario.id, sedeId: sede.id } },
      update: {},
      create: { usuarioId: usuario.id, sedeId: sede.id },
    });
  }

  return usuario;
}
