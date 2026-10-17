import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const opcionesTaller = { exigirActaFirmada: false, usarControlCaja: true };

const mockRequirePermiso = vi.fn();
import { permisosEfectivos } from "@/lib/auth/permisos";
vi.mock("@/lib/auth/guards", () => ({ requirePermiso: (...a: unknown[]) => mockRequirePermiso(...a),
  requireSession: vi.fn(),
  puede: (session: { user: { permisos: string[] } }, permiso: string) => session.user.permisos.includes(permiso), }));
const db = {
  gasto: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn(), findUnique: vi.fn() },
  categoriaGasto: { findUnique: vi.fn() },
  sede: { findUnique: vi.fn() },
  cajaSesion: { findFirst: vi.fn() },
  // Control de caja encendido: la regla del efectivo aplica (fase de consolidación, D3).
  configuracionTaller: { findUnique: async () => opcionesTaller },
};
vi.mock("@/lib/db/tenant-client", () => ({ getTenantDb: () => db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { actualizarGastoAction, crearGastoAction, eliminarGastoAction, listGastos } from "./gasto-actions";

const inicial = { error: null, success: false };
const RECEPCION = { user: { id: "u2", role: "RECEPCION", permisos: permisosEfectivos({ role: "RECEPCION" }), tenantSchema: "t", sedeActivaId: "s1" } };
const ADMIN = { user: { id: "u1", role: "ADMIN", permisos: permisosEfectivos({ role: "ADMIN" }), tenantSchema: "t", sedeActivaId: "s1" } };
const valido = { categoriaId: "cat_arriendo", descripcion: "Arriendo", monto: "1500000", fecha: "2026-10-05" };

const ACTUAL = { gastoRecurrenteId: null, periodo: null, sedeId: "s1", categoriaId: "cat_arriendo", pagadoEnEfectivo: false };
const RECURRENTE = { gastoRecurrenteId: "r1", periodo: "2026-10", sedeId: "s1", categoriaId: "cat_arriendo" };

function form(obj: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-15T15:00:00Z"));
  mockRequirePermiso.mockResolvedValue(RECEPCION);
  db.cajaSesion.findFirst.mockResolvedValue({ id: "c1", abiertaAt: new Date("2026-10-17T13:00:00Z") });
});
afterEach(() => vi.useRealTimers());

describe("gastos", () => {
  it("no registra un gasto pagado en efectivo con la caja cerrada (Fase 24)", async () => {
    db.cajaSesion.findFirst.mockResolvedValue(null);
    db.categoriaGasto.findUnique.mockResolvedValue({ id: "cat_arriendo", activo: true });

    const r = await crearGastoAction(inicial, form({ ...valido, pagadoEnEfectivo: "true" }));

    expect(r).toEqual({ error: "Abre la caja antes de registrar un gasto pagado en efectivo", success: false });
    expect(db.gasto.create).not.toHaveBeenCalled();

    // Un gasto que no sale del cajón sí se puede registrar con la caja cerrada.
    expect(await crearGastoAction(inicial, form({ ...valido }))).toEqual({ error: null, success: true });
  });

  it("crearGastoAction (RECEPCION) usa la sede activa aunque envíe otra", async () => {
    db.categoriaGasto.findUnique.mockResolvedValue({ id: "cat_arriendo", activo: true });
    const f = form({ ...valido, sedeId: "s2" });
    expect(await crearGastoAction(inicial, f)).toEqual({ error: null, success: true });
    expect(db.gasto.create).toHaveBeenCalledWith({
      data: {
        sedeId: "s1", categoriaId: "cat_arriendo", descripcion: "Arriendo", monto: 1500000,
        fecha: new Date("2026-10-05T00:00:00.000Z"), referencia: null, registradoPorId: "u2", pagadoEnEfectivo: false,
      },
    });
  });

  it("crearGastoAction (ADMIN) puede elegir otra sede existente", async () => {
    mockRequirePermiso.mockResolvedValue(ADMIN);
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
    mockRequirePermiso.mockResolvedValue(ADMIN);
    db.categoriaGasto.findUnique.mockResolvedValue({ id: "c", activo: true });
    db.sede.findUnique.mockResolvedValue(null);
    expect((await crearGastoAction(inicial, form({ ...valido, sedeId: "zz" }))).error).toBe("Sede no encontrada");
  });

  it("actualizar y eliminar exigen ADMIN", async () => {
    mockRequirePermiso.mockResolvedValue(ADMIN);
    db.categoriaGasto.findUnique.mockResolvedValue({ id: "cat_arriendo", activo: true });
    db.gasto.findUnique.mockResolvedValue(ACTUAL);
    await actualizarGastoAction("g1", inicial, form(valido));
    expect(mockRequirePermiso).toHaveBeenLastCalledWith("gastos.administrar");
    db.gasto.delete.mockResolvedValue({});
    expect(await eliminarGastoAction("g1")).toEqual({ error: null });
    expect(mockRequirePermiso).toHaveBeenLastCalledWith("gastos.administrar");
  });

  it("guarda pagadoEnEfectivo al crear y al actualizar", async () => {
    mockRequirePermiso.mockResolvedValue(ADMIN);
    db.categoriaGasto.findUnique.mockResolvedValue({ id: "cat_arriendo", activo: true });
    db.gasto.findUnique.mockResolvedValue({ ...ACTUAL, pagadoEnEfectivo: true });
    await crearGastoAction(inicial, form({ ...valido, pagadoEnEfectivo: "true" }));
    expect(db.gasto.create.mock.calls[0][0].data.pagadoEnEfectivo).toBe(true);
    await actualizarGastoAction("g1", inicial, form({ ...valido, pagadoEnEfectivo: "true" }));
    expect(db.gasto.update.mock.calls[0][0].data.pagadoEnEfectivo).toBe(true);
    await actualizarGastoAction("g1", inicial, form(valido));
    expect(db.gasto.update.mock.calls[1][0].data.pagadoEnEfectivo).toBe(false);
  });

  it("con control de caja, un gasto ya registrado no se pasa a efectivo (B3)", async () => {
    mockRequirePermiso.mockResolvedValue(ADMIN);
    db.categoriaGasto.findUnique.mockResolvedValue({ id: "cat_arriendo", activo: true });
    db.gasto.findUnique.mockResolvedValue(ACTUAL);

    const r = await actualizarGastoAction("g1", inicial, form({ ...valido, pagadoEnEfectivo: "true" }));

    expect(r.error).toBe("Un gasto ya registrado no se puede pasar a efectivo: registra un gasto nuevo pagado en efectivo");
    expect(db.gasto.update).not.toHaveBeenCalled();

    // Sin control de caja el arqueo no importa y se deja.
    opcionesTaller.usarControlCaja = false;
    try {
      expect((await actualizarGastoAction("g1", inicial, form({ ...valido, pagadoEnEfectivo: "true" }))).error).toBeNull();
    } finally {
      opcionesTaller.usarControlCaja = true;
    }
  });

  it("actualizar permite conservar la categoría actual aunque esté inactiva", async () => {
    mockRequirePermiso.mockResolvedValue(ADMIN);
    db.categoriaGasto.findUnique.mockResolvedValue({ id: "cat_arriendo", activo: false });
    db.gasto.findUnique.mockResolvedValue({ ...ACTUAL, categoriaId: "cat_arriendo" });
    expect(await actualizarGastoAction("g1", inicial, form(valido))).toEqual({ error: null, success: true });
    expect(db.gasto.update).toHaveBeenCalled();
  });

  it("actualizar rechaza cambiar a una categoría inactiva", async () => {
    mockRequirePermiso.mockResolvedValue(ADMIN);
    db.categoriaGasto.findUnique.mockResolvedValue({ id: "cat_arriendo", activo: false });
    db.gasto.findUnique.mockResolvedValue({ ...ACTUAL, categoriaId: "otra" });
    expect((await actualizarGastoAction("g1", inicial, form(valido))).error).toBe("La categoría no está disponible");
  });

  it("actualizar un gasto inexistente devuelve error", async () => {
    mockRequirePermiso.mockResolvedValue(ADMIN);
    db.gasto.findUnique.mockResolvedValue(null);
    expect(await actualizarGastoAction("g1", inicial, form(valido))).toEqual({ error: "Gasto no encontrado", success: false });
    expect(db.gasto.update).not.toHaveBeenCalled();
  });

  it("actualizar un gasto recurrente rechaza moverlo a otro mes", async () => {
    mockRequirePermiso.mockResolvedValue(ADMIN);
    db.categoriaGasto.findUnique.mockResolvedValue({ id: "cat_arriendo", activo: true });
    db.gasto.findUnique.mockResolvedValue(RECURRENTE);
    const r = await actualizarGastoAction("g1", inicial, form({ ...valido, fecha: "2026-11-02" }));
    expect(r.error).toMatch(/^La fecha debe estar dentro de /);
    expect(db.gasto.update).not.toHaveBeenCalled();
  });

  it("actualizar un gasto recurrente rechaza cambiar de sede", async () => {
    mockRequirePermiso.mockResolvedValue(ADMIN);
    db.categoriaGasto.findUnique.mockResolvedValue({ id: "cat_arriendo", activo: true });
    db.gasto.findUnique.mockResolvedValue(RECURRENTE);
    const r = await actualizarGastoAction("g1", inicial, form({ ...valido, sedeId: "s2" }));
    expect(r.error).toBe("Un gasto recurrente no puede cambiar de sede");
    expect(db.gasto.update).not.toHaveBeenCalled();
  });

  it("actualizar un gasto recurrente dentro de su mes funciona", async () => {
    mockRequirePermiso.mockResolvedValue(ADMIN);
    db.categoriaGasto.findUnique.mockResolvedValue({ id: "cat_arriendo", activo: true });
    db.gasto.findUnique.mockResolvedValue(RECURRENTE);
    expect(await actualizarGastoAction("g1", inicial, form({ ...valido, fecha: "2026-10-20" }))).toEqual({ error: null, success: true });
  });

  it("actualizar sin sedeId conserva la sede actual del gasto (no la activa del admin)", async () => {
    mockRequirePermiso.mockResolvedValue(ADMIN);
    db.categoriaGasto.findUnique.mockResolvedValue({ id: "cat_arriendo", activo: true });
    db.sede.findUnique.mockResolvedValue({ id: "s2" });
    db.gasto.findUnique.mockResolvedValue({ ...ACTUAL, sedeId: "s2" });
    await actualizarGastoAction("g1", inicial, form(valido));
    expect(db.gasto.update.mock.calls[0][0].data.sedeId).toBe("s2");
  });

  it("crear y listar exigen ADMIN o RECEPCION", async () => {
    db.categoriaGasto.findUnique.mockResolvedValue({ id: "cat_arriendo", activo: true });
    await crearGastoAction(inicial, form(valido));
    expect(mockRequirePermiso).toHaveBeenLastCalledWith("gastos.registrar");
    db.gasto.findMany.mockResolvedValue([]);
    db.gasto.aggregate.mockResolvedValue({ _sum: { monto: null } });
    await listGastos({});
    expect(mockRequirePermiso).toHaveBeenLastCalledWith("gastos.registrar");
  });

  it("si el guard rechaza no se toca la base de datos", async () => {
    mockRequirePermiso.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(crearGastoAction(inicial, form(valido))).rejects.toThrow("NEXT_REDIRECT");
    await expect(listGastos({})).rejects.toThrow("NEXT_REDIRECT");
    await expect(actualizarGastoAction("g1", inicial, form(valido))).rejects.toThrow("NEXT_REDIRECT");
    expect(db.gasto.create).not.toHaveBeenCalled();
    expect(db.gasto.findMany).not.toHaveBeenCalled();
    expect(db.gasto.findUnique).not.toHaveBeenCalled();
    expect(db.gasto.update).not.toHaveBeenCalled();
  });

  it("eliminar inexistente devuelve error amable", async () => {
    mockRequirePermiso.mockResolvedValue(ADMIN);
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
