import { NextResponse, type NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { publicDb } from "@/lib/db/public-client";
import { enviarEmail } from "@/lib/email/enviar-email";
import { descifrarConfiguracionSmtp } from "@/lib/email/smtp-config";
import { ejecutarRecordatorios } from "@/lib/recordatorios/ejecutar-recordatorios";
import { prismaRecordatoriosGateway } from "@/lib/recordatorios/gateway-prisma";
import { ejecutarAvisosVencimiento } from "@/lib/vencimientos/ejecutar-avisos";
import { prismaAvisosGateway } from "@/lib/vencimientos/gateway-prisma";

/**
 * The preventive-maintenance reminder sweep and the SOAT/RTM expiry sweep, triggered by an EXTERNAL scheduler
 * (Vercel Cron, a system crontab, any HTTP caller with the secret) rather than
 * by a signed-in user. That is why it does not call requireSession(): there is
 * no session, no tenant subdomain and no sede activa here. It is also why the
 * gateway's reads are tenant-wide and unscoped -- see gateway-prisma.ts.
 *
 * Authentication is a shared secret in "Authorization: Bearer <secret>", which
 * is exactly what Vercel Cron sends. An unset CRON_SECRET fails closed.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PREFIJO_BEARER = "Bearer ";

function autorizado(request: NextRequest): boolean {
  const esperado = process.env.CRON_SECRET;
  if (!esperado) {
    // Fail closed: an unconfigured secret must never mean "open to everyone".
    return false;
  }

  const encabezado = request.headers.get("authorization") ?? "";
  if (!encabezado.startsWith(PREFIJO_BEARER)) {
    return false;
  }
  const recibido = encabezado.slice(PREFIJO_BEARER.length);

  // Hash both sides first so the buffers are always 32 bytes: timingSafeEqual
  // throws on a length mismatch, and that throw would itself reveal the secret's
  // length to a probing caller.
  const digestRecibido = createHash("sha256").update(recibido).digest();
  const digestEsperado = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(digestRecibido, digestEsperado);
}

const MENSAJE_FALLO = {
  recordatorios: "Error al ejecutar los recordatorios",
  vencimientos: "Error al ejecutar los avisos de vencimiento",
} as const;

/**
 * Each sweep already absorbs per-tenant and per-item failures, so reaching
 * here means it could not start at all (e.g. the public database is
 * unreachable). The raw error can carry hosts and credentials, so only its
 * constructor name is logged -- mirrors describirError's exact logic (kept
 * inline rather than imported, since the sweeps are mocked wholesale in this
 * route's tests).
 */
function fallo(barrido: keyof typeof MENSAJE_FALLO, err: unknown): { error: string } {
  const nombreError = err instanceof Error ? err.constructor.name : "Error desconocido";
  console.error(`[cron/recordatorios] El barrido de ${barrido} no pudo iniciar: ${nombreError}`);
  return { error: MENSAJE_FALLO[barrido] };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!autorizado(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const listarTenants = () =>
    // A SUSPENDIDO tenant is locked out of the app, so it must not keep
    // emailing its clientes either: only ACTIVO tenants are swept.
    publicDb.tenant.findMany({ where: { estado: "ACTIVO" }, select: { schemaName: true } });
  const ahora = new Date();

  // Each sweep in its own catch: if one cannot start, the other still runs.
  const [mantenimiento, vencimientos] = await Promise.all([
    ejecutarRecordatorios({
      listarTenants,
      gateway: prismaRecordatoriosGateway,
      descifrarConfiguracion: descifrarConfiguracionSmtp,
      enviarEmail,
      ahora,
    }).catch((err: unknown) => fallo("recordatorios", err)),
    ejecutarAvisosVencimiento({
      listarTenants,
      gateway: prismaAvisosGateway,
      descifrarConfiguracion: descifrarConfiguracionSmtp,
      enviarEmail,
      ahora,
    }).catch((err: unknown) => fallo("vencimientos", err)),
  ]);

  const status = "error" in mantenimiento && "error" in vencimientos ? 500 : 200;
  return NextResponse.json({ mantenimiento, vencimientos }, { status, headers: { "Cache-Control": "no-store" } });
}
