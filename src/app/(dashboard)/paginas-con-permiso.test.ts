import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

// Todo `src/app`, no solo (dashboard): las páginas de impresión viven fuera del
// grupo para salir sin menú y también tienen que exigir su permiso (Fase 26, I3).
const RAIZ = join(__dirname, "..");
const SIN_PERMISO = new Set([
  "(dashboard)/page.tsx",
  "(dashboard)/sin-permiso/page.tsx",
  "login/page.tsx",
  "seleccionar-sede/page.tsx",
]);
// El panel de super-admin tiene su propia sesión (`requireSuperAdmin`).
const esSuperAdmin = (rel: string) => rel.startsWith("superadmin/");

function paginas(dir: string): string[] {
  const salida: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) salida.push(...paginas(ruta));
    else if (e.name === "page.tsx") salida.push(ruta);
  }
  return salida;
}

describe("páginas de la app", () => {
  const todas = paginas(RAIZ).map((p) => ({
    rel: relative(RAIZ, p).split(sep).join("/"),
    ruta: p,
  }));

  it("el recorrido encuentra las páginas (no pasa en vacío), también fuera de (dashboard)", () => {
    expect(todas.length).toBeGreaterThan(20);
    expect(todas.map((p) => p.rel)).toEqual(
      expect.arrayContaining(["ordenes/[id]/acta/imprimir/page.tsx", "cotizaciones/[id]/imprimir/page.tsx"]),
    );
  });

  it("cada página, salvo Inicio, sin-permiso, login, seleccionar-sede y super-admin, exige su permiso", () => {
    const sinPermiso = todas
      .filter((p) => !SIN_PERMISO.has(p.rel) && !esSuperAdmin(p.rel))
      .filter((p) => !readFileSync(p.ruta, "utf8").includes("requirePermiso("))
      .map((p) => p.rel);
    expect(sinPermiso).toEqual([]);
  });
});
