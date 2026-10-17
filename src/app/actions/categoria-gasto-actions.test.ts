import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequirePermiso = vi.fn();
import { permisosEfectivos } from "@/lib/auth/permisos";
vi.mock("@/lib/auth/guards", () => ({ requirePermiso: (...a: unknown[]) => mockRequirePermiso(...a),
  requireSession: vi.fn(),
  puede: (session: { user: { permisos: string[] } }, permiso: string) => session.user.permisos.includes(permiso), }));
const db = {
  categoriaGasto: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), findUnique: vi.fn(), aggregate: vi.fn() },
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
const ADMIN = { user: { id: "u1", role: "ADMIN", permisos: permisosEfectivos({ role: "ADMIN" }), tenantSchema: "t" } };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequirePermiso.mockResolvedValue(ADMIN);

  db.categoriaGasto.findFirst.mockResolvedValue(null);
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
    expect(mockRequirePermiso).toHaveBeenCalledWith("gastos.registrar");
    expect(db.categoriaGasto.findMany).toHaveBeenCalledWith({ where: { activo: true }, orderBy: { orden: "asc" } });
    expect(r).toEqual([{ id: "c1", nombre: "Arriendo", activo: true, orden: 0 }]);
  });

  it("todas: solo ADMIN", async () => {
    db.categoriaGasto.findMany.mockResolvedValue([]);
    await listCategoriasGasto();
    expect(mockRequirePermiso).toHaveBeenCalledWith("gastos.administrar");
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

  it("rechaza un nombre que ya existe sin importar mayúsculas", async () => {
    db.categoriaGasto.findFirst.mockResolvedValue({ id: "c9" });
    expect(await crearCategoriaGastoAction(inicial, fd("arriendo"))).toEqual({
      error: "Ya existe una categoría con ese nombre",
      success: false,
    });
    expect(db.categoriaGasto.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ nombre: { equals: "arriendo", mode: "insensitive" } }) }),
    );
    expect(db.categoriaGasto.create).not.toHaveBeenCalled();
  });

  it("exige ADMIN y nombre", async () => {
    expect((await crearCategoriaGastoAction(inicial, fd("  "))).error).toBe("El nombre es obligatorio");
    expect(mockRequirePermiso).toHaveBeenCalledWith("gastos.administrar");
    expect(db.categoriaGasto.create).not.toHaveBeenCalled();
  });
});

describe("renombrar y activar/desactivar", () => {
  it("renombra", async () => {
    db.categoriaGasto.update.mockResolvedValue({});
    expect(await renombrarCategoriaGastoAction("c1", inicial, fd("Arriendo bodega"))).toEqual({ error: null, success: true });
    expect(db.categoriaGasto.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { nombre: "Arriendo bodega" } });
  });

  it("rechaza renombrar a un nombre existente (otra categoría)", async () => {
    db.categoriaGasto.findFirst.mockResolvedValue({ id: "c2" });
    expect((await renombrarCategoriaGastoAction("c1", inicial, fd("ARRIENDO"))).error).toBe("Ya existe una categoría con ese nombre");
    expect(db.categoriaGasto.findFirst.mock.calls[0][0].where).toMatchObject({ NOT: { id: "c1" } });
    expect(db.categoriaGasto.update).not.toHaveBeenCalled();
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
