/**
 * Maps known Prisma request error codes to friendly Spanish messages, so raw
 * Prisma internals (e.g. "Unique constraint failed on the fields: (`placa`)")
 * never leak into the UI. Detects Prisma known-request errors by duck-typing
 * on `.code` rather than importing `Prisma.PrismaClientKnownRequestError`
 * directly, so this helper stays dependency-light and schema-agnostic
 * (shared by both the tenant and public generated Prisma clients).
 *
 * Confirmed against the installed `@prisma/client@6.19.3` runtime types
 * (node_modules/@prisma/client/runtime/library.d.ts):
 *   export declare class PrismaClientKnownRequestError extends Error {
 *     code: string;
 *     meta?: Record<string, unknown>;
 *     clientVersion: string;
 *     ...
 *   }
 */
export function friendlyPrismaErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (code === "P2002") return "Ya existe un registro con ese valor.";
    if (code === "P2003") return "No se puede completar la operación porque hay registros relacionados.";
  }
  return fallback;
}
