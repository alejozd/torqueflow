import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { permisosEfectivos, type Role } from "@/lib/auth/permisos";

const mockRequirePermiso = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requirePermiso: (...args: unknown[]) => mockRequirePermiso(...args),
  puede: (session: { user: { permisos: string[] } }, permiso: string) => session.user.permisos.includes(permiso),
}));

const repuestoBase = {
  id: "r1",
  codigo: "FRN-001",
  nombre: "Filtro de aceite",
  descripcion: null,
  precioCompra: "8000",
  precioVenta: "15000",
  stockActual: 10,
  stockMinimo: 5,
  stockMaximo: null,
  multiploCompra: 1,
  bodegaId: "b1",
  proveedorId: null,
  bodega: { id: "b1", nombre: "Principal" },
  proveedor: null,
};
vi.mock("@/app/actions/repuesto-actions", () => ({
  listRepuestos: async () => [{ ...repuestoBase }],
  getComprometidoPorRepuesto: async () => ({}),
}));
vi.mock("@/app/actions/bodega-actions", () => ({ listBodegas: async () => [] }));
vi.mock("@/app/actions/proveedor-actions", () => ({ listProveedores: async () => [] }));

import RepuestosPage from "./page";

function sesion(role: Role) {
  return { user: { role, permisos: permisosEfectivos({ role }) } };
}

/** Recorre el árbol de elementos devuelto por la página (sin renderizar). */
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
  mockRequirePermiso.mockResolvedValue(sesion(role));
  const arbol = await RepuestosPage({ searchParams: Promise.resolve({}) });
  const todos = elementos(arbol);
  const tabla = todos.find((e) => "columns" in (e.props as object))!.props as {
    columns: { header: string }[];
    rows: unknown[];
  };
  const kpis = todos.filter((e) => "title" in (e.props as object)).map((e) => (e.props as { title: string }).title);
  return { tabla, kpis, headers: tabla.columns.map((c) => c.header) };
}

describe("RepuestosPage y los costos (D8)", () => {
  beforeEach(() => mockRequirePermiso.mockReset());

  it("sin inventario.costos: sin P. compra, sin Margen, sin KPI de valor y sin precioCompra en las filas", async () => {
    const { tabla, kpis, headers } = await cargar("TECNICO");
    expect(headers).not.toContain("P. compra");
    expect(headers).not.toContain("Margen");
    expect(headers).toContain("P. venta");
    expect(kpis).not.toContain("Valor inventario");
    expect(kpis).toContain("Stock bajo");
    expect(JSON.stringify(tabla.rows)).not.toContain("precioCompra");
  });

  it("con inventario.costos: muestra P. compra, Margen y el valor del inventario", async () => {
    const { tabla, kpis, headers } = await cargar("RECEPCION");
    expect(headers).toEqual(expect.arrayContaining(["P. compra", "P. venta", "Margen"]));
    expect(kpis).toContain("Valor inventario");
    expect(JSON.stringify(tabla.rows)).toContain("precioCompra");
  });
});
