export interface LimitadorIntentos {
  estaBloqueado(clave: string, ahora?: number): boolean;
  registrarFallo(clave: string, ahora?: number): void;
  limpiar(clave: string): void;
}

interface Registro {
  fallos: number;
  inicio: number;
}

const MAX_CLAVES_POR_DEFECTO = 10_000;

/**
 * In-memory, fixed-window failure counter for the login forms. Valid only
 * because the app runs as a single PM2 process -- with more than one process
 * each would keep its own count, and this must move to shared storage.
 * `maxClaves` bounds memory against an attacker rotating emails/IPs: past it,
 * the oldest key is dropped (Map keeps insertion order).
 */
export function crearLimitadorIntentos({
  maxFallos,
  ventanaMs,
  maxClaves = MAX_CLAVES_POR_DEFECTO,
}: {
  maxFallos: number;
  ventanaMs: number;
  maxClaves?: number;
}): LimitadorIntentos {
  const registros = new Map<string, Registro>();

  function vigente(clave: string, ahora: number): Registro | undefined {
    const registro = registros.get(clave);
    if (registro && ahora - registro.inicio > ventanaMs) {
      registros.delete(clave);
      return undefined;
    }
    return registro;
  }

  return {
    estaBloqueado(clave, ahora = Date.now()) {
      return (vigente(clave, ahora)?.fallos ?? 0) >= maxFallos;
    },
    registrarFallo(clave, ahora = Date.now()) {
      const registro = vigente(clave, ahora);
      if (registro) {
        registro.fallos += 1;
        return;
      }
      if (registros.size >= maxClaves) {
        const masAntigua = registros.keys().next().value;
        if (masAntigua !== undefined) registros.delete(masAntigua);
      }
      registros.set(clave, { fallos: 1, inicio: ahora });
    },
    limpiar(clave) {
      registros.delete(clave);
    },
  };
}

/**
 * The client IP as Cloudflare Tunnel reports it. The app listens only on
 * 127.0.0.1 (package.json "start"), so every request comes through
 * cloudflared, and Cloudflare always overwrites CF-Connecting-IP with the
 * real client address. X-Forwarded-For is deliberately NOT used: Cloudflare
 * keeps whatever the client sent there and only appends to it, so its first
 * hop is attacker-controlled. No header (local dev) -> the shared
 * "desconocida" key.
 */
export function claveIp(request: Request | undefined): string {
  return request?.headers.get("cf-connecting-ip")?.trim() || "desconocida";
}
