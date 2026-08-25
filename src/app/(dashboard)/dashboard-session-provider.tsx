"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import { SessionRenewalModal } from "./session-renewal-modal";

/**
 * refetchOnWindowFocus is off deliberately: /api/auth/session re-signs the
 * JWT with a fresh expiry on every hit for the JWT strategy (see
 * session-renewal-modal.tsx), so leaving it on would silently re-extend the
 * session on every tab focus, bypassing the renewal prompt entirely.
 */
export function DashboardSessionProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      {children}
      <SessionRenewalModal />
    </SessionProvider>
  );
}
