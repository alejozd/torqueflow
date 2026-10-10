import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({ requireRole: (...a: unknown[]) => mockRequireRole(...a), requireSession: vi.fn() }));
const db = {
  gasto: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn(), findUnique: vi.fn() },
  categoriaGasto: { findUnique: vi.fn() },
  sede: { findUnique: vi.fn() },
};
vi.mock("@/lib/db/tenant-client", () => ({ getTenantDb: () => db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { actualizarGastoAction, crearGastoAction, eliminarGastoAction, listGastos } from "./gasto-actions";

const inicial = { error: null, success: false };
const RECEPCION = { user: { id: "u2", role: "RECEPCION", tenantSchema: "t", sedeActivaId: "s1" } };
const ADMIN = { user: { id: "u1", role: "ADMIN", tenantSchema: "t", sedeActivaId: "s1" } };
const valido = { categoriaId: "cat_arriendo", descripcion: "Arriendo", monto: "1500000", fecha: "2026-10-05" };

function form(obj: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-15T15:00:00Z"));
  mockRequireRole.mockResolvedValue(RECEPCION);
});
afterEach(() => vi.useRealTimers());

describe("gastos", () => {
  it("crearGastoAction (RECEPCION) usa la sede activa aunque envíe otra", async () => {
    db.categoriaGasto.findUnique.mockResolvedValue({ id: "cat_arriendo", activo: true });
    const f = form({ ...valido, sedeId: "s2" });
    expect(await crearGastoAction(inicial, f)).toEqual({ error: null, success: true });
    expect(db.gasto.create).toHaveBeenCalledWith({
      data: {
        sedeId: "s1", categoriaId: "cat_arriendo", descripcion: "Arriendo", monto: 1500000,
        fecha: new Date("2026-10-05T00:00:00.000Z"), referencia: null, registradoPorId: "u2",
      },
    });
  });

  it("crearGastoAction (ADMIN) puede elegir otra sede existente", async () => {
    mockRequireRole.mockResolvedValue(ADMIN);
    db.categoriaGasto.findUnique.mockResolvedValue({ id: "cat_arriendo", activo: true });
    db.sede.findUnique.mockResolvedValue({ id: "s2" });
    await crearGastoAction(inicial, form({ ...valido, sedeId: "s2" }));
    expect(db.gasto.create.mock.calls[0][0].data.sedeId).toBe("s2");
  });

  it("rechaza categoría inactiva o inexistente", async () => {
    db.categoriaGasto.findUnique.mockResolvedValue({ id: "c", activo: false });
    expect((await crearGastoAction(inicial, form(valido))).error).toBe("La categoría no está disponible");
    expect(db.gasto.create).not.toHaveBeenCalled();
  });

  it("rechaza sede inexistente (ADMIN)", async () => {
    mockRequireRole.mockResolvedValue(ADMIN);
    db.categoriaGasto.findUnique.mockResolvedValue({ id: "c", activo: true });
    db.sede.findUnique.mockResolvedValue(null);
    expect((await crearGastoAction(inicial, form({ ...valido, sedeId: "zz" }))).error).toBe("Sede no encontrada");
  });

  it("actualizar y eliminar exigen ADMIN", async () => {
    mockRequireRole.mockResolvedValue(ADMIN);
    db.categoriaGasto.findUnique.mockResolvedValue({ id: "cat_arriendo", activo: true });
    await actualizarGastoAction("g1", inicial, form(valido));
    expect(mockRequireRole).toHaveBeenLastCalledWith(["ADMIN"]);
    db.gasto.delete.mockResolvedValue({});
    expect(await eliminarGastoAction("g1")).toEqual({ error: null });
    expect(mockRequireRole).toHaveBeenLastCalledWith(["ADMIN"]);
  });

  it("actualizar permite conservar la categoría actual aunque esté inactiva", async () => {
    mockRequireRole.mockResolvedValue(ADMIN);
    db.categoriaGasto.findUnique.mockResolvedValue({ id: "cat_arriendo", activo: false });
    db.gasto.findUnique.mockResolvedValue({ categoriaId: "cat_arriendo" });
    expect(await actualizarGastoAction("g1", inicial, form(valido))).toEqual({ error: null, success: true });
    expect(db.gasto.update).toHaveBeenCalled();
  });

  it("actualizar rechaza cambiar a una categoría inactiva", async () => {
    mockRequireRole.mockResolvedValue(ADMIN);
    db.categoriaGasto.findUnique.mockResolvedValue({ id: "cat_arriendo", activo: false });
    db.gasto.findUnique.mockResolvedValue({ categoriaId: "otra" });
    expect((await actualizarGastoAction("g1", inicial, form(valido))).error).toBe("La categoría no está disponible");
  });

  it("eliminar inexistente devuelve error amable", async () => {
    mockRequireRole.mockResolvedValue(ADMIN);
    db.gasto.delete.mockRejectedValue({ code: "P2025" });
    expect(await eliminarGastoAction("x")).toEqual({ error: "No se pudo eliminar el gasto" });
  });

  const filas = [
    { id: "g1", fecha: new Date("2026-10-05T00:00:00Z"), descripcion: "Arriendo", categoriaId: "c1",
      categoria: { nombre: "Arriendo" }, referencia: null, monto: { toString: () => "1500000" },
      registradoPor: { nombre: "Ana" }, gastoRecurrenteId: "r1" },
    { id: "g2", fecha: new Date("2026-10-07T00:00:00Z"), descripcion: "Aceite", categoriaId: "c2",
      categoria: { nombre: "Insumos" }, referencia: "F-1", monto: { toString: () => "200000" },
      registradoPor: { nombre: "Luis" }, gastoRecurrenteId: null },
  ];

  it("listGastos arma filas, total, mes anterior y categoría mayor", async () => {
    db.gasto.findMany.mockResolvedValue(filas);
    db.gasto.aggregate.mockResolvedValue({ _sum: { monto: { toString: () => "1000000" } } });
    const r = await listGastos({ periodo: "2026-10" });
    expect(db.gasto.findMany).toHaveBeenCalledTimes(1);
    expect(db.gasto.findMany.mock.calls[0][0].where).toMatchObject({
      sedeId: "s1", fecha: { gte: new Date("2026-10-01T00:00:00.000Z"), lt: new Date("2026-11-01T00:00:00.000Z") },
    });
    expect(r.total).toBe(1700000);
    expect(r.totalMesAnterior).toBe(1000000);
    expect(r.categoriaMayor).toEqual({ nombre: "Arriendo", monto: 1500000 });
    expect(r.filas[0]).toMatchObject({ monto: 1500000, esRecurrente: true, categoriaNombre: "Arriendo" });
  });

  it("listGastos con filtro de categoría filtra las filas pero no el total ni la categoría mayor", async () => {
    db.gasto.findMany.mockResolvedValue(filas);
    db.gasto.aggregate.mockResolvedValue({ _sum: { monto: null } });
    const r = await listGastos({ periodo: "2026-10", categoriaId: "c2" });
    expect(r.filas.map((x) => x.id)).toEqual(["g2"]);
    expect(r.total).toBe(1700000);
    expect(r.totalMesAnterior).toBe(0);
    expect(r.categoriaMayor?.nombre).toBe("Arriendo");
  });

  it("listGastos: periodo inválido usa el actual; RECEPCION ignora sedeId", async () => {
    db.gasto.findMany.mockResolvedValue([]);
    db.gasto.aggregate.mockResolvedValue({ _sum: { monto: null } });
    const r = await listGastos({ periodo: "basura", sedeId: "s9" });
    expect(r.periodo).toBe("2026-10");
    expect(r.sedeId).toBe("s1");
    expect(r.categoriaMayor).toBeNull();
  });
});
