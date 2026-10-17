import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const RAIZ = __dirname;
const SIN_PERMISO = new Set(["page.tsx", "sin-permiso/page.tsx"]);

function paginas(dir: string): string[] {
  const salida: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) salida.push(...paginas(ruta));
    else if (e.name === "page.tsx") salida.push(ruta);
  }
  return salida;
}

describe("páginas del dashboard", () => {
  const todas = paginas(RAIZ).map((p) => ({
    rel: relative(RAIZ, p).split(sep).join("/"),
    ruta: p,
  }));

  it("el recorrido encuentra las páginas (no pasa en vacío)", () => {
    expect(todas.length).toBeGreaterThan(20);
  });

  it("cada página, salvo Inicio y sin-permiso, exige su permiso", () => {
    const sinPermiso = todas
      .filter((p) => !SIN_PERMISO.has(p.rel))
      .filter((p) => !readFileSync(p.ruta, "utf8").includes("requirePermiso("))
      .map((p) => p.rel);
    expect(sinPermiso).toEqual([]);
  });
});
