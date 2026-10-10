export interface ResultadoAccion {
  error: string | null;
  success: boolean;
}

/**
 * Runs a void server action that refuses by throwing and returns the refusal
 * as data: Next redacts thrown messages in production builds, so a client
 * component must receive them as a return value. Next's own redirect /
 * notFound errors (digest "NEXT_...") keep propagating.
 */
export async function resultadoDeAccion(
  accion: () => Promise<void>,
  mensajePorDefecto: string,
): Promise<ResultadoAccion> {
  try {
    await accion();
  } catch (err) {
    if (typeof (err as { digest?: unknown })?.digest === "string" && (err as { digest: string }).digest.startsWith("NEXT_")) {
      throw err;
    }
    return { error: err instanceof Error ? err.message : mensajePorDefecto, success: false };
  }
  return { error: null, success: true };
}
