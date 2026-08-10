import { redirect } from "next/navigation";
import { auth } from "@/auth";

export type Role = "ADMIN" | "TECNICO" | "RECEPCION";

type Session = NonNullable<Awaited<ReturnType<typeof auth>>>;

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
