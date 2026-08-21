export function getLoginErrorMessage(code: string | undefined): string | null {
  if (code === "tenant-mismatch") {
    return "Tu sesión no corresponde a este taller. Vuelve a iniciar sesión.";
  }
  if (code === "forbidden") {
    return "No tienes permiso para acceder a esa sección.";
  }
  if (code === "sede-requerida") {
    return "Tu sesión no tiene una sede activa. Vuelve a iniciar sesión.";
  }
  return null;
}
