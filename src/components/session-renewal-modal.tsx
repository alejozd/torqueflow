"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import {
  EXPIRY_WARNING_LEAD_MS,
  EXPIRY_WARNING_RESPONSE_MS,
  INACTIVITY_TIMEOUT_MS,
  SESSION_EXPIRY_CHECK_INTERVAL_MS,
} from "@/lib/auth/session-timing";

const ACTIVITY_EVENTS = ["mousedown", "mousemove", "keydown", "scroll", "touchstart"] as const;

/**
 * Closes the I2 debt (stale sessions after a role downgrade/removal): the
 * JWT now lives for 1 hour (src/auth.ts), so a demoted/deleted user's
 * privileges are re-checked at most an hour later instead of up to 30 days.
 * This component is what makes that short lifetime survivable for an active
 * user -- it warns before expiry and renews via NextAuth's own
 * `update()` (POST /api/auth/session re-signs the JWT with a fresh `exp`,
 * see @auth/core's session action), so there is no separate renewal
 * endpoint to keep in sync with the auth config.
 *
 * Shared by both NextAuth instances: the tenant dashboard
 * (DashboardSessionProvider) and /superadmin (its layout), each passing its
 * own login page so the forced logout lands on the right screen.
 *
 * DashboardSessionProvider disables SessionProvider's automatic
 * refetch-on-focus/interval on purpose: that endpoint re-signs the cookie on
 * every hit for the JWT strategy, so silent background polling would
 * re-extend the session without the user ever confirming -- defeating the
 * hourly re-validation this exists to guarantee.
 */
export function SessionRenewalModal({ loginPath = "/login" }: { loginPath?: string } = {}) {
  const { data: session, status, update } = useSession();
  const [showWarning, setShowWarning] = useState(false);
  const [renovando, setRenovando] = useState(false);
  const [errorRenovacion, setErrorRenovacion] = useState(false);
  const responseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const forceLogout = useCallback(() => {
    void signOut({ callbackUrl: `${window.location.origin}${loginPath}` });
  }, [loginPath]);

  useEffect(() => {
    if (status !== "authenticated" || !session?.expires) return;

    const expiresAt = new Date(session.expires).getTime();

    function check() {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        forceLogout();
      } else if (remaining <= EXPIRY_WARNING_LEAD_MS) {
        setShowWarning(true);
      }
    }

    check();
    const interval = setInterval(check, SESSION_EXPIRY_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [status, session?.expires, forceLogout]);

  useEffect(() => {
    if (!showWarning) return;

    responseTimeoutRef.current = setTimeout(forceLogout, EXPIRY_WARNING_RESPONSE_MS);
    return () => {
      if (responseTimeoutRef.current) clearTimeout(responseTimeoutRef.current);
    };
  }, [showWarning, forceLogout]);

  useEffect(() => {
    if (status !== "authenticated") return;

    let inactivityTimer: ReturnType<typeof setTimeout>;
    function reset() {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(forceLogout, INACTIVITY_TIMEOUT_MS);
    }

    reset();
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, reset);
    }
    return () => {
      clearTimeout(inactivityTimer);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, reset);
      }
    };
  }, [status, forceLogout]);

  // update() resolves null (or throws on a network error) when the renewal
  // did not happen; the warning must stay up and say so, otherwise the user
  // believes the session was extended and gets logged out mid-work anyway.
  async function handleContinue() {
    setRenovando(true);
    setErrorRenovacion(false);
    try {
      const renovada = await update();
      if (!renovada) throw new Error("renewal returned no session");
      setShowWarning(false);
    } catch {
      setErrorRenovacion(true);
    } finally {
      setRenovando(false);
    }
  }

  if (!showWarning) return null;

  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="session-expiry-message">
      <p id="session-expiry-message">Tu sesión está a punto de expirar. ¿Deseas continuar?</p>
      {errorRenovacion ? (
        <p role="alert">No se pudo renovar la sesión. Revisa tu conexión e inténtalo de nuevo.</p>
      ) : null}
      <button type="button" onClick={handleContinue} disabled={renovando}>
        {renovando ? "Renovando..." : "Continuar"}
      </button>
      <button type="button" onClick={forceLogout}>
        Cerrar sesión
      </button>
    </div>
  );
}
