import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({ requireRole: (...a: unknown[]) => mockRequireRole(...a), requireSession: vi.fn() }));
const db = {
  gastoRecurrente: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  gasto: { create: vi.fn() },
  gastoRecurrenteOmitido: { create: vi.fn() },
  categoriaGasto: { findUnique: vi.fn() },
  sede: { findUnique: vi.fn() },
};
vi.mock("@/lib/db/tenant-client", () => ({ getTenantDb: () => db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  confirmarRecurrenteAction,
  crearGastoRecurrenteAction,
  listRecurrentesPendientes,
  omitirRecurrenteAction,
  toggleGastoRecurrenteActivoAction,
} from "./gasto-recurrente-actions";

const inicial = { error: null, success: false };
const ADMIN = { user: { id: "u1", role: "ADMIN", tenantSchema: "t", sedeActivaId: "s1" } };

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-15T15:00:00Z"));
  mockRequireRole.mockResolvedValue(ADMIN);
});
afterEach(() => vi.useRealTimers());

describe("gastos recurrentes", () => {
  it("listRecurrentesPendientes arma periodos resueltos con gastos y omisiones", async () => {
    db.gastoRecurrente.findMany.mockResolvedValue([
      { id: "r1", descripcion: "Arriendo", categoria: { nombre: "Arriendo" }, montoEstimado: { toString: () => "1500000" },
        diaDelMes: 5, desde: "2026-08", activo: true, gastos: [{ periodo: "2026-08" }], omitidos: [{ periodo: "2026-09" }] },
    ]);
    const r = await listRecurrentesPendientes({});
    expect(db.gastoRecurrente.findMany.mock.calls[0][0].where).toEqual({ sedeId: "s1", activo: true });
    expect(r.map((p) => p.periodo)).toEqual(["2026-10"]);
    expect(r[0].montoEstimado).toBe(1500000);
  });

  it("confirmarRecurrenteAction crea el gasto con periodo y datos de la plantilla", async () => {
    db.gastoRecurrente.findUnique.mockResolvedValue({ id: "r1", sedeId: "s1", categoriaId: "cat_arriendo", descripcion: "Arriendo", desde: "2026-08", activo: true });
    const f = new FormData(); f.set("monto", "1550000"); f.set("fecha", "2026-10-05");
    expect(await confirmarRecurrenteAction("r1", "2026-10", inicial, f)).toEqual({ error: null, success: true });
    expect(db.gasto.create).toHaveBeenCalledWith({
      data: {
        sedeId: "s1", categoriaId: "cat_arriendo", descripcion: "Arriendo", monto: 1550000,
        fecha: new Date("2026-10-05T00:00:00.000Z"), referencia: null, gastoRecurrenteId: "r1", periodo: "2026-10", registradoPorId: "u1",
      },
    });
  });

  it("confirmar: la fecha debe caer en el periodo; periodo futuro o anterior a `desde` se rechaza", async () => {
    db.gastoRecurrente.findUnique.mockResolvedValue({ id: "r1", sedeId: "s1", categoriaId: "c", descripcion: "A", desde: "2026-08", activo: true });
    const f = new FormData(); f.set("monto", "1"); f.set("fecha", "2026-11-05");
    expect((await confirmarRecurrenteAction("r1", "2026-10", inicial, f)).error).toBe("La fecha debe estar dentro de octubre de 2026");
    f.set("fecha", "2026-12-05");
    expect((await confirmarRecurrenteAction("r1", "2026-12", inicial, f)).error).toBe("Ese mes todavía no ha empezado");
    f.set("fecha", "2026-07-05");
    expect((await confirmarRecurrenteAction("r1", "2026-07", inicial, f)).error).toBe("La plantilla empieza después de ese mes");
  });

  it("confirmar duplicado (P2002) -> mensaje claro", async () => {
    db.gastoRecurrente.findUnique.mockResolvedValue({ id: "r1", sedeId: "s1", categoriaId: "c", descripcion: "A", desde: "2026-08", activo: true });
    db.gasto.create.mockRejectedValue({ code: "P2002" });
    const f = new FormData(); f.set("monto", "1"); f.set("fecha", "2026-10-05");
    expect((await confirmarRecurrenteAction("r1", "2026-10", inicial, f)).error).toBe("Este gasto ya fue confirmado");
  });

  it("omitir crea el registro y P2002 se trata como ya omitido (éxito)", async () => {
    db.gastoRecurrente.findUnique.mockResolvedValue({ id: "r1", desde: "2026-08" });
    expect(await omitirRecurrenteAction("r1", "2026-10")).toEqual({ error: null });
    expect(db.gastoRecurrenteOmitido.create).toHaveBeenCalledWith({ data: { gastoRecurrenteId: "r1", periodo: "2026-10", omitidoPorId: "u1" } });
    db.gastoRecurrenteOmitido.create.mockRejectedValue({ code: "P2002" });
    expect(await omitirRecurrenteAction("r1", "2026-10")).toEqual({ error: null });
  });

  it("confirmar/omitir/plantillas exigen ADMIN; pendientes admite RECEPCION", async () => {
    db.gastoRecurrente.findMany.mockResolvedValue([]);
    await listRecurrentesPendientes({});
    expect(mockRequireRole).toHaveBeenLastCalledWith(["ADMIN", "RECEPCION"]);

    db.gastoRecurrente.findUnique.mockResolvedValue(null);
    await omitirRecurrenteAction("r1", "2026-10");
    expect(mockRequireRole).toHaveBeenLastCalledWith(["ADMIN"]);
    await confirmarRecurrenteAction("r1", "2026-10", inicial, new FormData());
    expect(mockRequireRole).toHaveBeenLastCalledWith(["ADMIN"]);
    await toggleGastoRecurrenteActivoAction("r1");
    expect(mockRequireRole).toHaveBeenLastCalledWith(["ADMIN"]);
  });

  it("crearGastoRecurrenteAction valida categoría activa y sede", async () => {
    const f = new FormData();
    for (const [k, v] of Object.entries({ categoriaId: "c", descripcion: "Internet", montoEstimado: "98000", diaDelMes: "10", desde: "2026-10", sedeId: "zz" })) f.set(k, v);

    db.categoriaGasto.findUnique.mockResolvedValue({ id: "c", activo: false });
    expect((await crearGastoRecurrenteAction(inicial, f)).error).toBe("La categoría no está disponible");

    db.categoriaGasto.findUnique.mockResolvedValue({ id: "c", activo: true });
    db.sede.findUnique.mockResolvedValue(null);
    expect((await crearGastoRecurrenteAction(inicial, f)).error).toBe("Sede no encontrada");
    expect(db.gastoRecurrente.create).not.toHaveBeenCalled();

    db.sede.findUnique.mockResolvedValue({ id: "zz" });
    expect(await crearGastoRecurrenteAction(inicial, f)).toEqual({ error: null, success: true });
    expect(db.gastoRecurrente.create).toHaveBeenCalledWith({
      data: { sedeId: "zz", categoriaId: "c", descripcion: "Internet", montoEstimado: 98000, diaDelMes: 10, desde: "2026-10" },
    });
  });
});
