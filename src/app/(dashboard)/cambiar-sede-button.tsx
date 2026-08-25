"use client";

import { signOut } from "next-auth/react";
import { MapPinned } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * v1's way to change sede is to log in again: the sede lives in the JWT, and
 * swapping it live would mean introducing a SessionProvider plus a client
 * session hook and re-validating client-supplied data inside the jwt callback
 * -- new auth machinery this phase deliberately does not add (see the plan's
 * Global Constraints). Signposting the round trip is the honest v1 answer.
 *
 * `${window.location.origin}` is required, not decorative: with AUTH_URL set,
 * a bare "/login" callbackUrl resolves against a fixed origin and drops the
 * tenant subdomain. Same fix as SignOutButton, Fase 5 Task 11.
 */
export function CambiarSedeButton() {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => signOut({ callbackUrl: `${window.location.origin}/login` })}
    >
      <MapPinned />
      Cambiar de sede
    </Button>
  );
}
