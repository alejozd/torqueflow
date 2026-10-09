import { publicDb } from "@/lib/db/public-client";
import { getTenantDb } from "@/lib/db/tenant-client";
import { verifyCredentials } from "@/lib/auth/verify-credentials";
import { resolveSedeInicial } from "@/lib/auth/sede-access";
import { compararConHashDeRelleno } from "@/lib/auth/hash-de-relleno";
import { claveIp, crearLimitadorIntentos, type LimitadorIntentos } from "@/lib/auth/limitador-intentos";

export interface AuthorizedUser {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "TECNICO" | "RECEPCION";
  tenantSlug: string;
  tenantSchema: string;
  sedeActivaId: string;
  sedeActivaNombre: string;
}

const VENTANA_LIMITE_MS = 15 * 60 * 1000;
const MAX_FALLOS_POR_CUENTA_E_IP = 5;
const MAX_FALLOS_POR_IP = 30;

let limitadorCuenta: LimitadorIntentos;
let limitadorIp: LimitadorIntentos;

/** Fresh, empty limiters -- runs once at module load; tests call it between cases. */
export function reiniciarLimitadoresLogin(): void {
  limitadorCuenta = crearLimitadorIntentos({ maxFallos: MAX_FALLOS_POR_CUENTA_E_IP, ventanaMs: VENTANA_LIMITE_MS });
  limitadorIp = crearLimitadorIntentos({ maxFallos: MAX_FALLOS_POR_IP, ventanaMs: VENTANA_LIMITE_MS });
}
reiniciarLimitadoresLogin();

/**
 * Brute-force limit in front of autorizar(). The account key is email+IP, not
 * email alone: keyed by email only, anyone could lock a real user out just by
 * failing on purpose. The IP-only key caps one source spraying many emails.
 * A blocked attempt answers exactly like a wrong password -- null, after a
 * filler bcrypt comparison -- so the lock itself reveals nothing either.
 */
export async function authorizeCredentials(
  credentials: Record<string, unknown> | undefined,
  request?: Request,
): Promise<AuthorizedUser | null> {
  const email = credentials?.email;
  const password = credentials?.password;
  if (typeof email !== "string" || typeof password !== "string") {
    return null;
  }

  const ip = claveIp(request);
  const claveCuenta = `${email.trim().toLowerCase()}|${ip}`;
  if (limitadorCuenta.estaBloqueado(claveCuenta) || limitadorIp.estaBloqueado(ip)) {
    await compararConHashDeRelleno(password);
    return null;
  }

  const usuario = await autorizar(email, password);
  if (usuario) {
    limitadorCuenta.limpiar(claveCuenta);
  } else {
    limitadorCuenta.registrarFallo(claveCuenta);
    limitadorIp.registrarFallo(ip);
  }
  return usuario;
}

/**
 * Fase 10: there is only one URL now, so the tenant is resolved from the
 * EMAIL itself via public.tenant_user_emails -- not from a subdomain/Host
 * header. This is still the point where the tenant gets fixed for the
 * session, same as before.
 *
 * Order matters: the email->tenant lookup and password check both run
 * BEFORE any sede logic, so a wrong password never performs a sede lookup.
 * Every failure path returns null, one uniform message for the login form,
 * and every one of them pays for a bcrypt comparison (real or filler, see
 * hash-de-relleno.ts) so response time does not reveal which emails exist.
 *
 * sedeActivaId/sedeActivaNombre come back as "" (not undefined) when no
 * sede can be auto-resolved (zero or more than one candidate) -- guards.ts's
 * `!session.user.sedeActivaId` check already treats an empty string as "no
 * sede", and the session gets completed later at /seleccionar-sede.
 */
async function autorizar(email: string, password: string): Promise<AuthorizedUser | null> {
  const indexado = await publicDb.tenantUserEmail.findUnique({
    where: { email },
    include: { tenant: true },
  });
  if (!indexado) {
    await compararConHashDeRelleno(password);
    return null;
  }

  const tenant = indexado.tenant;
  // A suspended tenant fails the same way a wrong password does -- no
  // distinct message, consistent with this login flow already treating wrong
  // password/unknown email/suspended tenant as indistinguishable.
  if (tenant.estado === "SUSPENDIDO") {
    await compararConHashDeRelleno(password);
    return null;
  }

  const tenantDb = getTenantDb(tenant.schemaName);
  const usuario = await verifyCredentials(tenantDb, email, password);
  if (!usuario) return null;
  // A suspended user fails the same way a wrong password does -- no distinct
  // message, consistent with the tenant-suspendido case above.
  if (!usuario.activo) return null;

  const sedeActiva = await resolveSedeInicial(tenantDb, usuario.id, usuario.role, usuario.sedeDefectoId);

  return {
    id: usuario.id,
    email: usuario.email,
    name: usuario.nombre,
    role: usuario.role,
    tenantSlug: tenant.slug,
    tenantSchema: tenant.schemaName,
    sedeActivaId: sedeActiva?.id ?? "",
    sedeActivaNombre: sedeActiva?.nombre ?? "",
  };
}
