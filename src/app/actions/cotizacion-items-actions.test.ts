import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockCotizacionFindFirst = vi.fn();
const mockRepuestoFindFirst = vi.fn();
const mockItemFindFirst = vi.fn();

const mockItemFindFirstTx = vi.fn();
const mockItemCreateTx = vi.fn();
const mockItemUpdateTx = vi.fn();
const mockItemDeleteManyTx = vi.fn();
const mockCotizacionFindUniqueOrThrowTx = vi.fn();
const mockCotizacionUpdateTx = vi.fn();

const mockTransaction = vi.fn((cb: (tx: unknown) => unknown) =>
  cb({
    itemCotizacion: {
      findFirst: mockItemFindFirstTx,
      create: mockItemCreateTx,
      update: mockItemUpdateTx,
      deleteMany: mockItemDeleteManyTx,
    },
    cotizacion: { findUniqueOrThrow: mockCotizacionFindUniqueOrThrowTx, update: mockCotizacionUpdateTx },
  }),
);

vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    cotizacion: { findFirst: mockCotizacionFindFirst },
    repuesto: { findFirst: mockRepuestoFindFirst },
    itemCotizacion: { findFirst: mockItemFindFirst },
    $transaction: mockTransaction,
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  actualizarItemCotizacionAction,
  agregarItemLibreCotizacionAction,
  agregarRepuestoACotizacionAction,
  eliminarGrupoKitCotizacionAction,
} from "./cotizacion-items-actions";

const SESSION = { user: { id: "u1", role: "ADMIN", tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };

beforeEach(() => {
  mockRequireRole.mockReset().mockResolvedValue(SESSION);
  mockCotizacionFindFirst.mockReset().mockResolvedValue({ estado: "BORRADOR" });
  mockRepuestoFindFirst.mockReset().mockResolvedValue({ id: "r1", nombre: "Filtro de aceite", precioVenta: "35000" });
  mockItemFindFirst.mockReset();
  mockItemFindFirstTx.mockReset().mockResolvedValue(null);
  mockItemCreateTx.mockReset().mockResolvedValue({ id: "i-nuevo" });
  mockItemUpdateTx.mockReset().mockResolvedValue({});
  mockItemDeleteManyTx.mockReset().mockResolvedValue({ count: 3 });
  mockCotizacionFindUniqueOrThrowTx
    .mockReset()
    .mockResolvedValue({ descuentoTipo: "PORCENTAJE", descuentoPct: "0", descuentoMonto: "0", items: [] });
  mockCotizacionUpdateTx.mockReset().mockResolvedValue({});
  mockTransaction.mockClear();
});

describe("agregarRepuestoACotizacionAction", () => {
  it("crea la fila con cantidad 1 y el precio de venta del inventario", async () => {
    const result = await agregarRepuestoACotizacionAction("q1", "r1");

    expect(result).toEqual({ error: null, itemId: "i-nuevo", fusionado: false });
    expect(mockItemCreateTx).toHaveBeenCalledWith({
      data: {
        cotizacionId: "q1",
        tipo: "REPUESTO",
        repuestoId: "r1",
        descripcion: "Filtro de aceite",
        cantidad: 1,
        precioUnitario: "35000",
      },
      select: { id: true },
    });
    expect(mockCotizacionUpdateTx).toHaveBeenCalled();
  });

  it("si el repuesto ya está suelto le suma 1 en vez de repetir la fila", async () => {
    mockItemFindFirstTx.mockResolvedValue({ id: "i-existente" });

    const result = await agregarRepuestoACotizacionAction("q1", "r1");

    expect(result).toEqual({ error: null, itemId: "i-existente", fusionado: true });
    expect(mockItemFindFirstTx).toHaveBeenCalledWith({
      where: { cotizacionId: "q1", repuestoId: "r1", grupoKitId: null },
      select: { id: true },
    });
    expect(mockItemUpdateTx).toHaveBeenCalledWith({ where: { id: "i-existente" }, data: { cantidad: { increment: 1 } } });
    expect(mockItemCreateTx).not.toHaveBeenCalled();
  });

  it("rechaza un repuesto de otra sede o inexistente", async () => {
    mockRepuestoFindFirst.mockResolvedValue(null);

    const result = await agregarRepuestoACotizacionAction("q1", "r-ajeno");

    expect(result).toEqual({ error: "Repuesto no encontrado", itemId: null });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("no toca una cotización aprobada", async () => {
    mockCotizacionFindFirst.mockResolvedValue({ estado: "APROBADA" });

    const result = await agregarRepuestoACotizacionAction("q1", "r1");

    expect(result.error).toMatch(/No se puede modificar/);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

describe("agregarItemLibreCotizacionAction", () => {
  it("crea el ítem libre sin repuesto, con cantidad 1 y precio 0", async () => {
    const result = await agregarItemLibreCotizacionAction("q1", { tipo: "REPUESTO", descripcion: "  Bujía importada  " });

    expect(result).toEqual({ error: null, itemId: "i-nuevo" });
    expect(mockItemCreateTx).toHaveBeenCalledWith({
      data: {
        cotizacionId: "q1",
        tipo: "REPUESTO",
        repuestoId: null,
        descripcion: "Bujía importada",
        cantidad: 1,
        precioUnitario: 0,
      },
      select: { id: true },
    });
  });

  it("exige descripción", async () => {
    const result = await agregarItemLibreCotizacionAction("q1", { tipo: "MANO_OBRA", descripcion: "   " });

    expect(result.error).toBe("La descripción es obligatoria");
    expect(mockRequireRole).not.toHaveBeenCalled();
  });
});

describe("actualizarItemCotizacionAction", () => {
  it("guarda la cantidad y recalcula los totales", async () => {
    mockItemFindFirst.mockResolvedValue({ id: "i1", repuestoId: "r1", grupoKitId: null });

    const result = await actualizarItemCotizacionAction("q1", "i1", { cantidad: 4 });

    expect(result).toEqual({ error: null, itemId: "i1" });
    expect(mockItemUpdateTx).toHaveBeenCalledWith({ where: { id: "i1" }, data: { cantidad: 4 } });
    expect(mockCotizacionUpdateTx).toHaveBeenCalled();
  });

  it("permite cambiar el precio de una línea de kit", async () => {
    mockItemFindFirst.mockResolvedValue({ id: "i2", repuestoId: "r1", grupoKitId: "g1" });

    const result = await actualizarItemCotizacionAction("q1", "i2", { precioUnitario: 40000 });

    expect(result.error).toBeNull();
    expect(mockItemUpdateTx).toHaveBeenCalledWith({ where: { id: "i2" }, data: { precioUnitario: 40000 } });
  });

  it("no deja cambiar la descripción de un repuesto del inventario", async () => {
    mockItemFindFirst.mockResolvedValue({ id: "i1", repuestoId: "r1", grupoKitId: null });

    const result = await actualizarItemCotizacionAction("q1", "i1", { descripcion: "Otro nombre" });

    expect(result.error).toMatch(/Solo los ítems libres/);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("deja cambiar descripción y tipo de un ítem libre", async () => {
    mockItemFindFirst.mockResolvedValue({ id: "i3", repuestoId: null, grupoKitId: null });

    const result = await actualizarItemCotizacionAction("q1", "i3", { tipo: "MANO_OBRA" });

    expect(result.error).toBeNull();
    expect(mockItemUpdateTx).toHaveBeenCalledWith({ where: { id: "i3" }, data: { tipo: "MANO_OBRA" } });
  });

  it("rechaza una cantidad en cero o sin cambios", async () => {
    expect((await actualizarItemCotizacionAction("q1", "i1", { cantidad: 0 })).error).toMatch(/mayor a 0/);
    expect((await actualizarItemCotizacionAction("q1", "i1", {})).error).toBe("No hay cambios que guardar");
    expect(mockRequireRole).not.toHaveBeenCalled();
  });

  it("responde si el ítem no es de la cotización", async () => {
    mockItemFindFirst.mockResolvedValue(null);

    const result = await actualizarItemCotizacionAction("q1", "i-ajeno", { cantidad: 2 });

    expect(result).toEqual({ error: "Ítem no encontrado en esta cotización", itemId: null });
  });
});

describe("eliminarGrupoKitCotizacionAction", () => {
  it("borra todas las líneas del kit y recalcula", async () => {
    const result = await eliminarGrupoKitCotizacionAction("q1", "g1");

    expect(result).toEqual({ error: null, itemId: null });
    expect(mockItemDeleteManyTx).toHaveBeenCalledWith({ where: { cotizacionId: "q1", grupoKitId: "g1" } });
    expect(mockCotizacionUpdateTx).toHaveBeenCalled();
  });

  it("solo administración y recepción pueden quitar un kit", async () => {
    await eliminarGrupoKitCotizacionAction("q1", "g1");

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
  });

  it("avisa si el kit ya no estaba", async () => {
    mockItemDeleteManyTx.mockResolvedValue({ count: 0 });

    const result = await eliminarGrupoKitCotizacionAction("q1", "g-viejo");

    expect(result.error).toBe("El kit ya no está en esta cotización");
    expect(mockCotizacionUpdateTx).not.toHaveBeenCalled();
  });
});
