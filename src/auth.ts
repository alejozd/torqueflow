import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authorizeCredentials } from "@/lib/auth/authorize-credentials";
import { resolveRedirectUrl } from "@/lib/auth/resolve-redirect";

const BASE_DOMAIN = process.env.BASE_DOMAIN ?? "zdevs.uk";

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
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
    async redirect({ url, baseUrl }) {
      return resolveRedirectUrl(url, baseUrl, BASE_DOMAIN);
    },
  },
});
