"use client";

import { cerrarSesion } from "@/lib/auth/cerrar-sesion";
import { MapPinned } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * v1's way to change sede is to log in again: the sede lives in the JWT, and
 * swapping it live would mean introducing a SessionProvider plus a client
 * session hook and re-validating client-supplied data inside the jwt callback
 * -- new auth machinery this phase deliberately does not add (see the plan's
 * Global Constraints). Signposting the round trip is the honest v1 answer.
 *
 * cerrarSesion() returns to /login on the CURRENT origin: NextAuth's own
 * redirect would land on AUTH_URL's origin and drop the tenant subdomain.
 */
export function CambiarSedeButton() {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => void cerrarSesion("/login")}
    >
      <MapPinned />
      Cambiar de sede
    </Button>
  );
}
