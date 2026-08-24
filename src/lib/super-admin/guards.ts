import { redirect } from "next/navigation";
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
 */
export async function requireSuperAdmin(): Promise<SuperAdminSession> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/superadmin/login");
  }

  return {
    id: session.user.id as string,
    email: session.user.email as string,
    nombre: session.user.name as string,
  };
}
