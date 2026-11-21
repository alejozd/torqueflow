// src/modulos/factura-electronica/fabrica.test.ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { crearProveedor } from "./fabrica";

describe("crearProveedor", () => {
  it("SIMULADO no necesita token y respeta el resultado forzado", async () => {
    const p = crearProveedor({ ambiente: "SIMULADO", resultadoSimulado: "CAIDA" });
    expect((await p.probarConexion()).ok).toBe(false);
  });

  it("PRUEBAS y PRODUCCION exigen token", () => {
    expect(() => crearProveedor({ ambiente: "PRUEBAS" })).toThrow("Falta el token del proveedor de facturación electrónica.");
    expect(() => crearProveedor({ ambiente: "PRODUCCION", nextpyme: { token: "", nitEmisor: "1" } })).toThrow();
  });

  it("con token devuelve el adaptador de Nextpyme", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    const p = crearProveedor({ ambiente: "PRUEBAS", nextpyme: { token: "t", nitEmisor: "1", fetch: f as unknown as typeof fetch } });
    await p.probarConexion();
    expect((f.mock.calls[0] as unknown as [string])[0]).toMatch(/nextpyme\.plus\/api\/ubl2\.1\/config\/company$/);
  });
});
