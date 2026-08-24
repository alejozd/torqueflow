import { describe, expect, it } from "vitest";
import { scopeBodega, scopeCita, scopeEntrada, scopeFactura, scopeOrden, scopeRepuesto } from "./scope";

describe("sede scope filters", () => {
  it("scopes órdenes on their own sedeId column", () => {
    expect(scopeOrden("sede-1")).toEqual({ sedeId: "sede-1" });
  });

  it("scopes bodegas on their own sedeId column", () => {
    expect(scopeBodega("sede-1")).toEqual({ sedeId: "sede-1" });
  });

  it("scopes citas on their own sedeId column, like órdenes", () => {
    expect(scopeCita("sede-1")).toEqual({ sedeId: "sede-1" });
  });

  it("returns a fresh scopeCita object each call so callers can safely spread and mutate", () => {
    expect(scopeCita("sede-1")).not.toBe(scopeCita("sede-1"));
  });

  it("scopes repuestos through their bodega, which owns the sedeId", () => {
    expect(scopeRepuesto("sede-1")).toEqual({ bodega: { sedeId: "sede-1" } });
  });

  it("scopes entradas de mercancía through their bodega", () => {
    expect(scopeEntrada("sede-1")).toEqual({ bodega: { sedeId: "sede-1" } });
  });

  it("scopes facturas through their orden, since Factura has no sede_id column", () => {
    expect(scopeFactura("sede-1")).toEqual({ orden: { sedeId: "sede-1" } });
  });

  it("returns a fresh object each call so callers can safely spread and mutate", () => {
    const a = scopeOrden("sede-1");
    const b = scopeOrden("sede-1");
    expect(a).not.toBe(b);
  });
});
