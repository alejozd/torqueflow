import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authorizeCredentials } from "@/lib/auth/authorize-credentials";
import { SESSION_MAX_AGE_SECONDS } from "@/lib/auth/session-timing";
import { resolveSedeActiva } from "@/lib/auth/sede-access";
import type { Role } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";

export const { handlers, signIn, signOut, auth, unstable_update } = NextAuth({
  trustHost: true,
  // Fase 9 debt I2: a demoted/deleted user's role is re-checked at most an
  // hour later instead of up to 30 days. src/app/(dashboard)/session-renewal-modal.tsx
  // is what keeps an active user from being silently logged out at the hour
  // mark -- it warns and renews via NextAuth's own session `update()`.
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Correo", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        return authorizeCredentials(credentials);
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.role = user.role;
        token.tenantSlug = user.tenantSlug;
        token.tenantSchema = user.tenantSchema;
        token.sedeActivaId = user.sedeActivaId;
        token.sedeActivaNombre = user.sedeActivaNombre;
      }
      // Fase 10: /seleccionar-sede completes a session that signed in with no
      // auto-resolved sede by calling unstable_update({ user: { sedeActivaId } }).
      // But `session` here is whatever reached update() -- including a
      // hand-crafted POST /api/auth/session from the browser, not only
      // seleccionarSedeAction. So the requested sede is re-validated here, and
      // the nombre comes from the DB, never from the client.
      const sedeSolicitada = trigger === "update" ? session?.user?.sedeActivaId : undefined;
      if (typeof sedeSolicitada === "string" && sedeSolicitada) {
        const sedeActiva = await resolveSedeActiva(
          getTenantDb(token.tenantSchema as string),
          token.sub as string,
          token.role as Role,
          sedeSolicitada,
        );
        if (sedeActiva) {
          token.sedeActivaId = sedeActiva.id;
          token.sedeActivaNombre = sedeActiva.nombre;
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.sub as string;
      session.user.role = token.role as "ADMIN" | "TECNICO" | "RECEPCION";
      session.user.tenantSlug = token.tenantSlug as string;
      session.user.tenantSchema = token.tenantSchema as string;
      // JWT.sedeActivaId is optional; Session.user.sedeActivaId is a string
      // where "" means "no sede yet" (requireSession sends that to
      // /seleccionar-sede). Defaulting here, instead of an `as string` cast,
      // keeps the declared type true -- the cast once hid a real bug from tsc.
      // (token is typed loosely here, so the check is a real runtime narrow.)
      session.user.sedeActivaId = typeof token.sedeActivaId === "string" ? token.sedeActivaId : "";
      session.user.sedeActivaNombre = typeof token.sedeActivaNombre === "string" ? token.sedeActivaNombre : "";
      return session;
    },
  },
});
