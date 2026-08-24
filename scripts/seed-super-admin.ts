import bcrypt from "bcryptjs";
import { publicDb } from "@/lib/db/public-client";
import type { SuperAdmin } from "@/generated/prisma-public";

export interface SeedSuperAdminInput {
  email: string;
  password: string;
  nombre: string;
}

export async function seedSuperAdmin({ email, password, nombre }: SeedSuperAdminInput): Promise<SuperAdmin> {
  const passwordHash = await bcrypt.hash(password, 12);
  return publicDb.superAdmin.upsert({
    where: { email },
    update: { passwordHash, nombre },
    create: { email, passwordHash, nombre },
  });
}
