"use client";

import { SessionProvider } from "next-auth/react";

/**
 * Wraps everything under /superadmin in a SessionProvider pointed at the
 * super-admin NextAuth instance's own basePath (Task 7). Without this, the
 * client-side signIn()/signOut() helpers in superadmin-login-form.tsx would
 * default to "/api/auth" -- the TENANT instance's route -- since next-auth/react
 * has no other way to know a second instance exists.
 */
export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return <SessionProvider basePath="/api/superadmin/auth">{children}</SessionProvider>;
}
