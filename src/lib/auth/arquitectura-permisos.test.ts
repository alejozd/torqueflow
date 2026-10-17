import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..", "..");
const PERMITIDOS = [
  "lib/auth/", // decide con el rol (D9)
  "auth.ts", // copia el rol del JWT a la sesión
  "app/actions/seleccionar-sede-actions.ts", // pasa el rol a resolveSedeActiva: bypass ADMIN de sede (D9)
  "app/seleccionar-sede/page.tsx", // pasa el rol a listSedesDisponibles: bypass ADMIN de sede (D9)
];

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (nombre === "generated" || nombre === "node_modules") return [];
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return /\.(ts|tsx)$/.test(nombre) && !/\.test\.tsx?$/.test(nombre) ? [ruta] : [];
  });
}

describe("los permisos se piden por nombre, no por rol", () => {
  const fuera = archivos(SRC).filter((ruta) => {
    const rel = relative(SRC, ruta).split(sep).join("/");
    return !PERMITIDOS.some((p) => rel.startsWith(p));
  });

  it("nadie usa requireRole", () => {
    expect(fuera.filter((ruta) => readFileSync(ruta, "utf8").includes("requireRole"))).toEqual([]);
  });

  it("nadie decide con session.user.role", () => {
    expect(fuera.filter((ruta) => /session\.user\.role\b/.test(readFileSync(ruta, "utf8")))).toEqual([]);
  });
});
