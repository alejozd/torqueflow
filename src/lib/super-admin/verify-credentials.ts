import bcrypt from "bcryptjs";
import { publicDb } from "@/lib/db/public-client";
import type { SuperAdmin } from "@/generated/prisma-public";
import { compararConHashDeRelleno } from "@/lib/auth/hash-de-relleno";

export async function verifySuperAdminCredentials(email: string, password: string): Promise<SuperAdmin | null> {
  const admin = await publicDb.superAdmin.findUnique({ where: { email } });
  if (!admin) {
    // Same cost as a wrong password, so timing does not reveal the email is unknown.
    await compararConHashDeRelleno(password);
    return null;
  }

  const matches = await bcrypt.compare(password, admin.passwordHash);
  if (!matches) return null;

  return admin;
}
