import NextAuth, { type User } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verifySuperAdminCredentials } from "./verify-credentials";

/**
 * A second, fully independent NextAuth instance -- own basePath, own cookie
 * name, own session shape. Deliberately does NOT share src/auth.ts or the
 * next-auth.d.ts module augmentation: that augmentation is global and
 * describes the TENANT session (role/tenantSchema/sedeActivaId, all
 * required). A super-admin session has none of those fields; sharing the
 * type would let TypeScript silently allow reading fields that are actually
 * undefined here. See src/lib/super-admin/guards.ts for the narrow local
 * type every caller must use instead.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  basePath: "/api/superadmin/auth",
  session: { strategy: "jwt" },
  pages: { signIn: "/superadmin/login" },
  cookies: {
    sessionToken: {
      name: "superadmin-session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Correo", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") return null;

        const admin = await verifySuperAdminCredentials(email, password);
        if (!admin) return null;

        // `User` is globally augmented by src/types/next-auth.d.ts for the
        // TENANT instance (role/tenantSlug/tenantSchema/sedeActivaId, all
        // required) -- that augmentation is ambient and applies here too,
        // even though this is a different NextAuth instance. A super-admin
        // genuinely has none of those fields; fabricating placeholder values
        // for them would be an active lie sitting in the JWT. This cast is
        // the one place that type mismatch is bridged -- nothing downstream
        // trusts a super-admin session's tenant fields (guards.ts reads only
        // id/email/name and returns the narrow SuperAdminSession type).
        return { id: admin.id, email: admin.email, name: admin.nombre } as User;
      },
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      session.user.id = token.sub as string;
      return session;
    },
  },
});
