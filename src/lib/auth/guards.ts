import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auth } from "@/auth";

export type Role = "ADMIN" | "TECNICO" | "RECEPCION";

export async function requireSession(): Promise<Session> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  return session;
}

export async function requireRole(allowed: Role[]): Promise<Session> {
  const session = await requireSession();
  if (!allowed.includes(session.user.role)) {
    redirect("/login?error=forbidden");
  }
  return session;
}
