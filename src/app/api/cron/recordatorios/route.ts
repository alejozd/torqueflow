import { NextResponse, type NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { publicDb } from "@/lib/db/public-client";
import { enviarEmail } from "@/lib/email/enviar-email";
import { descifrarConfiguracionSmtp } from "@/lib/email/smtp-config";
import { ejecutarRecordatorios } from "@/lib/recordatorios/ejecutar-recordatorios";
import { prismaRecordatoriosGateway } from "@/lib/recordatorios/gateway-prisma";

/**
 * The preventive-maintenance reminder sweep, triggered by an EXTERNAL scheduler
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

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!autorizado(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const resumen = await ejecutarRecordatorios({
      listarTenants: () => publicDb.tenant.findMany({ select: { schemaName: true } }),
      gateway: prismaRecordatoriosGateway,
      descifrarConfiguracion: descifrarConfiguracionSmtp,
      enviarEmail,
      ahora: new Date(),
    });

    return NextResponse.json(resumen, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // ejecutarRecordatorios already absorbs per-tenant and per-vehicle failures,
    // so reaching here means the sweep could not start at all (e.g. the public
    // database is unreachable). The raw error can carry hosts and credentials.
    return NextResponse.json(
      { error: "Error al ejecutar los recordatorios" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
