import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { permisosEfectivos, type Role } from "@/lib/auth/permisos";

const mockRequirePermiso = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requirePermiso: (...args: unknown[]) => mockRequirePermiso(...args),
  puede: (session: { user: { permisos: string[] } }, permiso: string) => session.user.permisos.includes(permiso),
}));
vi.mock("@/app/actions/bodega-actions", () => ({
  listBodegasConInventario: async () => [
    { id: "b1", nombre: "Norte", repuestos: [{ stockActual: 2, stockMinimo: 1, precioCompra: "100" }] },
  ],
}));
vi.mock("./editar-bodega-dialog", () => ({ EditarBodegaDialog: () => null }));

import BodegasPage from "./page";

function elementos(nodo: ReactNode, salida: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(nodo)) nodo.forEach((n) => elementos(n, salida));
  else if (nodo && typeof nodo === "object" && "props" in nodo) {
    const el = nodo as ReactElement<{ children?: ReactNode }>;
    salida.push(el);
    elementos(el.props.children, salida);
  }
  return salida;
}

async function cargar(role: Role) {
  mockRequirePermiso.mockResolvedValue({
    user: { role, permisos: permisosEfectivos({ role }), sedeActivaNombre: "Norte" },
  });
  const todos = elementos(await BodegasPage());
  const tabla = todos.find((e) => "columns" in (e.props as object))!.props as { columns: { header: string }[] };
  return {
    headers: tabla.columns.map((c) => c.header),
    kpis: todos.filter((e) => "title" in (e.props as object)).map((e) => (e.props as { title: string }).title),
  };
}

describe("BodegasPage y el valor del inventario (D8)", () => {
  beforeEach(() => mockRequirePermiso.mockReset());

  it("sin inventario.costos: sin columna ni KPI de Valor inventario", async () => {
    const { headers, kpis } = await cargar("TECNICO");
    expect(headers).not.toContain("Valor inventario");
    expect(kpis).not.toContain("Valor inventario");
    expect(headers).toContain("Unidades");
  });

  it("con inventario.costos: los muestra", async () => {
    const { headers, kpis } = await cargar("RECEPCION");
    expect(headers).toContain("Valor inventario");
    expect(kpis).toContain("Valor inventario");
  });
});
