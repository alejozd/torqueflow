import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { resolveTenant } from "@/lib/tenant/resolve-tenant";
import { getTenantDb } from "@/lib/db/tenant-client";
import { verifyCredentials } from "@/lib/auth/verify-credentials";

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Correo", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        const tenant = await resolveTenant();
        if (!tenant) return null;

        const tenantDb = getTenantDb(tenant.schemaName);
        const usuario = await verifyCredentials(tenantDb, email, password);
        if (!usuario) return null;

        return {
          id: usuario.id,
          email: usuario.email,
          name: usuario.nombre,
          role: usuario.role,
          tenantSlug: tenant.slug,
          tenantSchema: tenant.schemaName,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.tenantSlug = user.tenantSlug;
        token.tenantSchema = user.tenantSchema;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.sub as string;
      session.user.role = token.role as "ADMIN" | "TECNICO" | "RECEPCION";
      session.user.tenantSlug = token.tenantSlug as string;
      session.user.tenantSchema = token.tenantSchema as string;
      return session;
    },
  },
});
