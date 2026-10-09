import { compararConHashDeRelleno } from "@/lib/auth/hash-de-relleno";
import { claveIp, crearLimitadorIntentos, type LimitadorIntentos } from "@/lib/auth/limitador-intentos";
import { verifySuperAdminCredentials } from "./verify-credentials";

export interface SuperAdminAutorizado {
  id: string;
  email: string;
  name: string;
}

// Stricter than the tenant login (5 / 30): a super-admin can create, suspend
// and delete every taller, and there are only a handful of these accounts.
const VENTANA_LIMITE_MS = 15 * 60 * 1000;
const MAX_FALLOS_POR_CUENTA_E_IP = 3;
const MAX_FALLOS_POR_IP = 10;

let limitadorCuenta: LimitadorIntentos;
let limitadorIp: LimitadorIntentos;

/** Fresh, empty limiters -- runs once at module load; tests call it between cases. */
export function reiniciarLimitadoresSuperAdmin(): void {
  limitadorCuenta = crearLimitadorIntentos({ maxFallos: MAX_FALLOS_POR_CUENTA_E_IP, ventanaMs: VENTANA_LIMITE_MS });
  limitadorIp = crearLimitadorIntentos({ maxFallos: MAX_FALLOS_POR_IP, ventanaMs: VENTANA_LIMITE_MS });
}
reiniciarLimitadoresSuperAdmin();

/**
 * The super-admin `authorize`, with the same brute-force limit shape as the
 * tenant login (see authorizeCredentials): account key is email+IP so nobody
 * can lock the real owner out from elsewhere, plus an IP-only cap. Its own
 * limiter instances -- tenant failures never count against /superadmin.
 */
export async function authorizeSuperAdmin(
  credentials: Record<string, unknown> | undefined,
  request?: Request,
): Promise<SuperAdminAutorizado | null> {
  const email = credentials?.email;
  const password = credentials?.password;
  if (typeof email !== "string" || typeof password !== "string") return null;

  const ip = claveIp(request);
  const claveCuenta = `${email.trim().toLowerCase()}|${ip}`;
  if (limitadorCuenta.estaBloqueado(claveCuenta) || limitadorIp.estaBloqueado(ip)) {
    await compararConHashDeRelleno(password);
    return null;
  }

  const admin = await verifySuperAdminCredentials(email, password);
  if (!admin) {
    limitadorCuenta.registrarFallo(claveCuenta);
    limitadorIp.registrarFallo(ip);
    return null;
  }

  limitadorCuenta.limpiar(claveCuenta);
  return { id: admin.id, email: admin.email, name: admin.nombre };
}
