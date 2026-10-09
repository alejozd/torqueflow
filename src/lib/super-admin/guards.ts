import { redirect } from "next/navigation";
import { publicDb } from "@/lib/db/public-client";
import { auth } from "./auth";

export interface SuperAdminSession {
  id: string;
  email: string;
  nombre: string;
}

/**
 * The single chokepoint for every super-admin-only action/page. Returns a
 * local, narrow type -- never `Session` from "next-auth" -- for the reason
 * documented at the top of ./auth.ts.
 *
 * Same tradeoff as the tenant requireSession(): one extra query per request
 * so a super-admin deleted mid-session loses access on their very next
 * request instead of keeping it until the 1-hour JWT expires. The returned
 * email/nombre come from that row, not from the possibly stale JWT.
 */
export async function requireSuperAdmin(): Promise<SuperAdminSession> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/superadmin/login");
  }

  const admin = await publicDb.superAdmin.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, nombre: true },
  });
  if (!admin) {
    redirect("/superadmin/login");
  }

  return { id: admin.id, email: admin.email, nombre: admin.nombre };
}
