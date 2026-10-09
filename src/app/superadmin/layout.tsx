"use client";

import { SessionProvider } from "next-auth/react";
import { SessionRenewalModal } from "@/components/session-renewal-modal";

/**
 * Wraps everything under /superadmin in a SessionProvider pointed at the
 * super-admin NextAuth instance's own basePath (Task 7). Without this, the
 * client-side signIn()/signOut() helpers in superadmin-login-form.tsx would
 * default to "/api/auth" -- the TENANT instance's route -- since next-auth/react
 * has no other way to know a second instance exists.
 *
 * Same session hardening as the tenant dashboard: 1-hour JWT (see
 * src/lib/super-admin/auth.ts), no silent refetch-on-focus (it would re-sign
 * the cookie and skip the prompt), and the renewal/inactivity modal. On the
 * login page the session is unauthenticated, so the modal stays inert.
 */
export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider basePath="/api/superadmin/auth" refetchOnWindowFocus={false}>
      {children}
      <SessionRenewalModal loginPath="/superadmin/login" />
    </SessionProvider>
  );
}
