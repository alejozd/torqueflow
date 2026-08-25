/**
 * Shared timing constants for the tenant session lifecycle (short-lived JWT +
 * silent renewal, Fase 9 debt I2). Kept in one place so the auth config and
 * the client-side renewal/inactivity logic can't drift out of sync.
 */

/** JWT/session lifetime — also the value NextAuth re-signs the cookie for on renewal. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60;

/** How long before expiry the renewal warning is shown to the user. */
export const EXPIRY_WARNING_LEAD_MS = 5 * 60 * 1000;

/** How long the user has to respond to the warning before auto-logout. */
export const EXPIRY_WARNING_RESPONSE_MS = 60 * 1000;

/** How often the client polls remaining time against `session.expires`. */
export const SESSION_EXPIRY_CHECK_INTERVAL_MS = 15 * 1000;

/** Auto-logout after this much time with no mouse/keyboard/scroll activity. */
export const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;
