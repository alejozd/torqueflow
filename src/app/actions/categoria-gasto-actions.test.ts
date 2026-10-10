import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({ requireRole: (...a: unknown[]) => mockRequireRole(...a), requireSession: vi.fn() }));
const db = {
  categoriaGasto: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), findUnique: vi.fn(), aggregate: vi.fn() },
};
vi.mock("@/lib/db/tenant-client", () => ({ getTenantDb: () => db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  crearCategoriaGastoAction,
  listCategoriasGasto,
  renombrarCategoriaGastoAction,
  toggleCategoriaGastoActivaAction,
} from "./categoria-gasto-actions";

const inicial = { error: null, success: false };
const ADMIN = { user: { id: "u1", role: "ADMIN", tenantSchema: "t" } };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireRole.mockResolvedValue(ADMIN);
});

function fd(nombre: string) {
  const f = new FormData();
  f.set("nombre", nombre);
  return f;
}

describe("listCategoriasGasto", () => {
  it("solo activas: ADMIN y RECEPCION, filtrando activo", async () => {
    db.categoriaGasto.findMany.mockResolvedValue([{ id: "c1", nombre: "Arriendo", activo: true, orden: 0, createdAt: new Date() }]);
    const r = await listCategoriasGasto({ soloActivas: true });
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
    expect(db.categoriaGasto.findMany).toHaveBeenCalledWith({ where: { activo: true }, orderBy: { orden: "asc" } });
    expect(r).toEqual([{ id: "c1", nombre: "Arriendo", activo: true, orden: 0 }]);
  });

  it("todas: solo ADMIN", async () => {
    db.categoriaGasto.findMany.mockResolvedValue([]);
    await listCategoriasGasto();
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
    expect(db.categoriaGasto.findMany).toHaveBeenCalledWith({ where: {}, orderBy: { orden: "asc" } });
  });
});

describe("crearCategoriaGastoAction", () => {
  it("crea al final del orden", async () => {
    db.categoriaGasto.aggregate.mockResolvedValue({ _max: { orden: 10 } });
    db.categoriaGasto.create.mockResolvedValue({});
    expect(await crearCategoriaGastoAction(inicial, fd("  Repuestos menores "))).toEqual({ error: null, success: true });
    expect(db.categoriaGasto.create).toHaveBeenCalledWith({ data: { nombre: "Repuestos menores", orden: 11 } });
  });

  it("nombre duplicado", async () => {
    db.categoriaGasto.aggregate.mockResolvedValue({ _max: { orden: 0 } });
    db.categoriaGasto.create.mockRejectedValue({ code: "P2002" });
    expect(await crearCategoriaGastoAction(inicial, fd("Arriendo"))).toEqual({
      error: "Ya existe una categoría con ese nombre",
      success: false,
    });
  });

  it("exige ADMIN y nombre", async () => {
    expect((await crearCategoriaGastoAction(inicial, fd("  "))).error).toBe("El nombre es obligatorio");
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
    expect(db.categoriaGasto.create).not.toHaveBeenCalled();
  });
});

describe("renombrar y activar/desactivar", () => {
  it("renombra", async () => {
    db.categoriaGasto.update.mockResolvedValue({});
    expect(await renombrarCategoriaGastoAction("c1", inicial, fd("Arriendo bodega"))).toEqual({ error: null, success: true });
    expect(db.categoriaGasto.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { nombre: "Arriendo bodega" } });
  });

  it("alterna activo", async () => {
    db.categoriaGasto.findUnique.mockResolvedValue({ id: "c1", activo: true });
    db.categoriaGasto.update.mockResolvedValue({});
    expect(await toggleCategoriaGastoActivaAction("c1")).toEqual({ error: null });
    expect(db.categoriaGasto.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { activo: false } });
  });

  it("categoría inexistente", async () => {
    db.categoriaGasto.findUnique.mockResolvedValue(null);
    expect(await toggleCategoriaGastoActivaAction("x")).toEqual({ error: "Categoría no encontrada" });
  });
});
