import { beforeEach, describe, expect, it, vi } from "vitest";

// vitest.setup.ts lo simula para los formularios; aquí se prueba el real.
vi.unmock("@/app/actions/tarifa-iva-actions");

const mockRequirePermiso = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requirePermiso: (...args: unknown[]) => mockRequirePermiso(...args),
  requireSession: () => mockRequireSession(),
}));

const mockFindMany = vi.fn();
const mockFindUnique = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateMany = vi.fn();
const mockTransaction = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    tarifaIva: {
      findMany: mockFindMany,
      findUnique: mockFindUnique,
      create: mockCreate,
      update: mockUpdate,
      updateMany: mockUpdateMany,
    },
    $transaction: mockTransaction,
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  cambiarActivaTarifaIvaAction,
  crearTarifaIvaAction,
  listTarifasIva,
  marcarPredeterminadaTarifaIvaAction,
} from "./tarifa-iva-actions";

const SESION = { user: { id: "u1", tenantSchema: "taller_test" } };
const INICIAL = { error: null, success: false };

function form(datos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(datos)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequirePermiso.mockResolvedValue(SESION);
  mockRequireSession.mockResolvedValue(SESION);
});

describe("listTarifasIva", () => {
  it("devuelve el porcentaje como número, de menor a mayor", async () => {
    mockFindMany.mockResolvedValue([{ id: "t19", porcentaje: "19.00", nombre: "General", activa: true, predeterminada: true }]);
    await expect(listTarifasIva()).resolves.toEqual([
      { id: "t19", porcentaje: 19, nombre: "General", activa: true, predeterminada: true },
    ]);
    expect(mockFindMany).toHaveBeenCalledWith({ orderBy: { porcentaje: "asc" } });
  });
});

describe("crearTarifaIvaAction", () => {
  it("exige el permiso de configuración y crea la tarifa", async () => {
    mockFindUnique.mockResolvedValue(null);
    const r = await crearTarifaIvaAction(INICIAL, form({ porcentaje: "8", nombre: "Especial" }));
    expect(mockRequirePermiso).toHaveBeenCalledWith("configuracion.taller");
    expect(r).toEqual({ error: null, success: true });
    expect(mockCreate).toHaveBeenCalledWith({ data: { porcentaje: 8, nombre: "Especial" } });
  });

  it("no duplica un porcentaje existente", async () => {
    mockFindUnique.mockResolvedValue({ id: "t5", activa: false });
    const r = await crearTarifaIvaAction(INICIAL, form({ porcentaje: "5", nombre: "Otra" }));
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/desactivada/);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("cambiarActivaTarifaIvaAction", () => {
  it("no desactiva la predeterminada", async () => {
    mockFindUnique.mockResolvedValue({ id: "t19", activa: true, predeterminada: true });
    const r = await cambiarActivaTarifaIvaAction("t19", false);
    expect(r.success).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("desactiva una que no es predeterminada", async () => {
    mockFindUnique.mockResolvedValue({ id: "t5", activa: true, predeterminada: false });
    await expect(cambiarActivaTarifaIvaAction("t5", false)).resolves.toEqual({ error: null, success: true });
    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: "t5" }, data: { activa: false } });
  });
});

describe("marcarPredeterminadaTarifaIvaAction", () => {
  it("no marca una inactiva", async () => {
    mockFindUnique.mockResolvedValue({ id: "t5", activa: false, predeterminada: false });
    const r = await marcarPredeterminadaTarifaIvaAction("t5");
    expect(r.success).toBe(false);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("quita la marca a las demás y la pone en esta, en una transacción", async () => {
    mockFindUnique.mockResolvedValue({ id: "t5", activa: true, predeterminada: false });
    await expect(marcarPredeterminadaTarifaIvaAction("t5")).resolves.toEqual({ error: null, success: true });
    expect(mockUpdateMany).toHaveBeenCalledWith({ where: { predeterminada: true, NOT: { id: "t5" } }, data: { predeterminada: false } });
    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: "t5" }, data: { predeterminada: true } });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });
});
