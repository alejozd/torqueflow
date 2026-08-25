import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authorizeCredentials } from "@/lib/auth/authorize-credentials";
import { SESSION_MAX_AGE_SECONDS } from "@/lib/auth/session-timing";

export const { handlers, signIn, signOut, auth } = NextAuth({
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
      // auto-resolved sede by calling update({ sedeActivaId, sedeActivaNombre })
      // -- merge that in without touching anything else on the token.
      if (trigger === "update" && session?.sedeActivaId) {
        token.sedeActivaId = session.sedeActivaId;
        token.sedeActivaNombre = session.sedeActivaNombre;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.sub as string;
      session.user.role = token.role as "ADMIN" | "TECNICO" | "RECEPCION";
      session.user.tenantSlug = token.tenantSlug as string;
      session.user.tenantSchema = token.tenantSchema as string;
      session.user.sedeActivaId = token.sedeActivaId as string;
      session.user.sedeActivaNombre = token.sedeActivaNombre as string;
      return session;
    },
  },
});
