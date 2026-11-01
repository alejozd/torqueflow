import { signOut } from "next-auth/react";

/**
 * Cierra la sesión y vuelve a `ruta` en el MISMO origen que está viendo el usuario.
 *
 * No se deja redirigir a NextAuth: su respuesta pasa el callbackUrl por el callback
 * `redirect`, que solo acepta el origen de AUTH_URL. Si AUTH_URL no coincide con el
 * dominio real (p. ej. quedó en http://localhost:3025 detrás del proxy, o el taller
 * entra por su subdominio), el usuario terminaba en ese otro origen.
 */
export async function cerrarSesion(
  ruta: string,
  navegar: (url: string) => void = (url) => window.location.assign(url),
): Promise<void> {
  await signOut({ redirect: false });
  navegar(`${window.location.origin}${ruta}`);
}
