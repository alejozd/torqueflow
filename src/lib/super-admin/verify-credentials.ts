import bcrypt from "bcryptjs";
import { publicDb } from "@/lib/db/public-client";
import type { SuperAdmin } from "@/generated/prisma-public";

export async function verifySuperAdminCredentials(email: string, password: string): Promise<SuperAdmin | null> {
  const admin = await publicDb.superAdmin.findUnique({ where: { email } });
  if (!admin) return null;

  const matches = await bcrypt.compare(password, admin.passwordHash);
  if (!matches) return null;

  return admin;
}
