import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: () => mockRequireSession(),
}));

const mockVehiculoFindUnique = vi.fn();
const mockVehiculoFindMany = vi.fn();
const mockCotizacionFindMany = vi.fn();
const mockCotizacionFindFirst = vi.fn();
const mockCotizacionCreate = vi.fn();
const mockCotizacionUpdate = vi.fn();
const mockRepuestoFindFirst = vi.fn();

const mockCotizacionFindUniqueOrThrow = vi.fn();
const mockCotizacionUpdateTx = vi.fn();
const mockItemCotizacionCreate = vi.fn();
const mockItemCotizacionDeleteMany = vi.fn();
const mockOrdenTrabajoCreateTx = vi.fn();
const mockItemOrdenCreateTx = vi.fn();
const mockManoDeObraCreateTx = vi.fn();

const mockTransaction = vi.fn((cb: (tx: unknown) => unknown) =>
  cb({
    cotizacion: { findUniqueOrThrow: mockCotizacionFindUniqueOrThrow, update: mockCotizacionUpdateTx },
    itemCotizacion: { create: mockItemCotizacionCreate, deleteMany: mockItemCotizacionDeleteMany },
    ordenTrabajo: { create: mockOrdenTrabajoCreateTx },
    itemOrden: { create: mockItemOrdenCreateTx },
    manoDeObra: { create: mockManoDeObraCreateTx },
  }),
);

vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    vehiculo: { findUnique: mockVehiculoFindUnique, findMany: mockVehiculoFindMany },
    cotizacion: {
      findMany: mockCotizacionFindMany,
      findFirst: mockCotizacionFindFirst,
      create: mockCotizacionCreate,
      update: mockCotizacionUpdate,
    },
    repuesto: { findFirst: mockRepuestoFindFirst },
    $transaction: mockTransaction,
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  crearCotizacionAction,
  agregarItemCotizacionAction,
  eliminarItemCotizacionAction,
  actualizarDescuentoCotizacionAction,
  enviarCotizacionAction,
  aprobarCotizacionAction,
  rechazarCotizacionAction,
  listCotizaciones,
  getCotizacion,
  type CotizacionFormState,
  type ItemCotizacionFormState,
  type DescuentoCotizacionFormState,
  type EnviarCotizacionFormState,
  type AprobarCotizacionFormState,
  type RechazarCotizacionFormState,
} from "./cotizacion-actions";

const SESSION_ADMIN = { user: { id: "u1", role: "ADMIN", tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };
const SESSION_TECNICO = { user: { id: "u2", role: "TECNICO", tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };

const cotizacionInitial: CotizacionFormState = { error: null, success: false, cotizacionId: null };
const itemInitial: ItemCotizacionFormState = { error: null, success: false };
const descuentoInitial: DescuentoCotizacionFormState = { error: null, success: false };
const enviarInitial: EnviarCotizacionFormState = { error: null, success: false };
const aprobarInitial: AprobarCotizacionFormState = { error: null, success: false, ordenId: null };
const rechazarInitial: RechazarCotizacionFormState = { error: null, success: false };

function baseCotizacion(overrides: Record<string, unknown> = {}) {
  return {
    id: "q1",
    estado: "BORRADOR",
    clienteId: "c1",
    vehiculoId: "v1",
    sedeId: "sede-1",
    descuentoPct: "0",
    items: [],
    ...overrides,
  };
}

beforeEach(() => {
  mockRequireRole.mockReset().mockResolvedValue(SESSION_ADMIN);
  mockRequireSession.mockReset().mockResolvedValue(SESSION_TECNICO);
  mockVehiculoFindUnique.mockReset();
  mockVehiculoFindMany.mockReset();
  mockCotizacionFindMany.mockReset();
  mockCotizacionFindFirst.mockReset();
  mockCotizacionCreate.mockReset();
  mockCotizacionUpdate.mockReset().mockResolvedValue({});
  mockRepuestoFindFirst.mockReset();
  mockCotizacionFindUniqueOrThrow.mockReset().mockResolvedValue({ descuentoPct: "0", items: [] });
  mockCotizacionUpdateTx.mockReset().mockResolvedValue({});
  mockItemCotizacionCreate.mockReset().mockResolvedValue({});
  mockItemCotizacionDeleteMany.mockReset().mockResolvedValue({ count: 1 });
  mockOrdenTrabajoCreateTx.mockReset().mockResolvedValue({ id: "o1" });
  mockItemOrdenCreateTx.mockReset().mockResolvedValue({});
  mockManoDeObraCreateTx.mockReset().mockResolvedValue({});
  mockTransaction.mockClear();
});

describe("crearCotizacionAction", () => {
  it("returns a validation error when motivo is missing", async () => {
    const formData = new FormData();
    formData.set("vehiculoId", "v1");

    const result = await crearCotizacionAction(cotizacionInitial, formData);

    expect(result.success).toBe(false);
    expect(mockRequireRole).not.toHaveBeenCalled();
  });

  it("returns an error when the vehículo does not exist", async () => {
    mockVehiculoFindUnique.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("vehiculoId", "v1");
    formData.set("motivo", "Revisión de frenos");

    const result = await crearCotizacionAction(cotizacionInitial, formData);

    expect(result).toEqual({ error: "El vehículo seleccionado no existe.", success: false, cotizacionId: null });
    expect(mockCotizacionCreate).not.toHaveBeenCalled();
  });

  it("derives clienteId from the vehículo (never trusts a submitted clienteId) and creates a BORRADOR cotización", async () => {
    mockVehiculoFindUnique.mockResolvedValue({ id: "v1", clienteId: "c1" });
    mockCotizacionCreate.mockResolvedValue({ id: "q1" });
    const formData = new FormData();
    formData.set("vehiculoId", "v1");
    formData.set("motivo", "Revisión de frenos");
    formData.set("clienteId", "c-forjado");

    const result = await crearCotizacionAction(cotizacionInitial, formData);

    expect(result).toEqual({ error: null, success: true, cotizacionId: "q1" });
    expect(mockCotizacionCreate).toHaveBeenCalledWith({
      data: {
        clienteId: "c1",
        vehiculoId: "v1",
        sedeId: "sede-1",
        motivo: "Revisión de frenos",
        validaHasta: undefined,
        creadoPorId: "u1",
      },
    });
  });
});

describe("agregarItemCotizacionAction", () => {
  it("returns an error when the cotización does not exist", async () => {
    mockCotizacionFindFirst.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("tipo", "MANO_OBRA");
    formData.set("descripcion", "Cambio de pastillas");
    formData.set("cantidad", "1");
    formData.set("precioUnitario", "50");

    const result = await agregarItemCotizacionAction("q1", itemInitial, formData);

    expect(result).toEqual({ error: "Cotización no encontrada", success: false });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("refuses to add an item to a non-BORRADOR cotización", async () => {
    mockCotizacionFindFirst.mockResolvedValue(baseCotizacion({ estado: "ENVIADA" }));
    const formData = new FormData();
    formData.set("tipo", "MANO_OBRA");
    formData.set("descripcion", "Cambio de pastillas");
    formData.set("cantidad", "1");
    formData.set("precioUnitario", "50");

    const result = await agregarItemCotizacionAction("q1", itemInitial, formData);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No se puede modificar/);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns an error when a REPUESTO item references a repuesto outside the sede", async () => {
    mockCotizacionFindFirst.mockResolvedValue(baseCotizacion());
    mockRepuestoFindFirst.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("tipo", "REPUESTO");
    formData.set("repuestoId", "r1");
    formData.set("cantidad", "2");
    formData.set("precioUnitario", "18.9");

    const result = await agregarItemCotizacionAction("q1", itemInitial, formData);

    expect(result).toEqual({ error: "Repuesto no encontrado", success: false });
  });

  it("creates a REPUESTO item using the catalog nombre as descripción, then recomputes totals", async () => {
    mockCotizacionFindFirst.mockResolvedValue(baseCotizacion());
    mockRepuestoFindFirst.mockResolvedValue({ id: "r1", nombre: "Pastillas de freno" });
    mockCotizacionFindUniqueOrThrow.mockResolvedValue({
      descuentoPct: "0",
      items: [{ tipo: "REPUESTO", cantidad: "2", precioUnitario: "18.9" }],
    });
    const formData = new FormData();
    formData.set("tipo", "REPUESTO");
    formData.set("repuestoId", "r1");
    formData.set("cantidad", "2");
    formData.set("precioUnitario", "18.9");

    const result = await agregarItemCotizacionAction("q1", itemInitial, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockItemCotizacionCreate).toHaveBeenCalledWith({
      data: { cotizacionId: "q1", tipo: "REPUESTO", repuestoId: "r1", descripcion: "Pastillas de freno", cantidad: 2, precioUnitario: 18.9 },
    });
    expect(mockCotizacionUpdateTx).toHaveBeenCalledWith({
      where: { id: "q1" },
      data: { subtotal: 37.8, descuento: 0, iva: 7.18, total: 44.98 },
    });
  });

  it("creates a MANO_OBRA item from the free-text descripción with no repuestoId", async () => {
    mockCotizacionFindFirst.mockResolvedValue(baseCotizacion());
    const formData = new FormData();
    formData.set("tipo", "MANO_OBRA");
    formData.set("descripcion", "Cambio de pastillas");
    formData.set("cantidad", "1");
    formData.set("precioUnitario", "50");

    const result = await agregarItemCotizacionAction("q1", itemInitial, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockItemCotizacionCreate).toHaveBeenCalledWith({
      data: { cotizacionId: "q1", tipo: "MANO_OBRA", repuestoId: null, descripcion: "Cambio de pastillas", cantidad: 1, precioUnitario: 50 },
    });
  });
});

describe("eliminarItemCotizacionAction", () => {
  it("throws when the cotización does not exist", async () => {
    mockCotizacionFindFirst.mockResolvedValue(null);

    await expect(eliminarItemCotizacionAction("i1", "q1")).rejects.toThrow("Cotización no encontrada");
  });

  it("throws when the cotización is not BORRADOR", async () => {
    mockCotizacionFindFirst.mockResolvedValue(baseCotizacion({ estado: "APROBADA" }));

    await expect(eliminarItemCotizacionAction("i1", "q1")).rejects.toThrow(/No se puede modificar/);
  });

  it("throws when the item does not belong to this cotización", async () => {
    mockCotizacionFindFirst.mockResolvedValue(baseCotizacion());
    mockItemCotizacionDeleteMany.mockResolvedValue({ count: 0 });

    await expect(eliminarItemCotizacionAction("i1", "q1")).rejects.toThrow("Ítem no encontrado en esta cotización");
  });

  it("deletes the item and recomputes totals", async () => {
    mockCotizacionFindFirst.mockResolvedValue(baseCotizacion());

    await eliminarItemCotizacionAction("i1", "q1");

    expect(mockItemCotizacionDeleteMany).toHaveBeenCalledWith({ where: { id: "i1", cotizacionId: "q1" } });
    expect(mockCotizacionUpdateTx).toHaveBeenCalled();
  });
});

describe("actualizarDescuentoCotizacionAction", () => {
  it("rejects a descuentoPct above 100", async () => {
    const formData = new FormData();
    formData.set("descuentoPct", "150");

    const result = await actualizarDescuentoCotizacionAction("q1", descuentoInitial, formData);

    expect(result.success).toBe(false);
    expect(mockRequireRole).not.toHaveBeenCalled();
  });

  it("refuses to change the descuento of a non-BORRADOR cotización", async () => {
    mockCotizacionFindFirst.mockResolvedValue(baseCotizacion({ estado: "RECHAZADA" }));
    const formData = new FormData();
    formData.set("descuentoPct", "10");

    const result = await actualizarDescuentoCotizacionAction("q1", descuentoInitial, formData);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No se puede modificar/);
  });

  it("updates descuentoPct and recomputes totals", async () => {
    mockCotizacionFindFirst.mockResolvedValue(baseCotizacion());
    const formData = new FormData();
    formData.set("descuentoPct", "10");

    const result = await actualizarDescuentoCotizacionAction("q1", descuentoInitial, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockCotizacionUpdateTx).toHaveBeenCalledWith({ where: { id: "q1" }, data: { descuentoPct: 10 } });
  });
});

describe("enviarCotizacionAction", () => {
  it("rejects sending a cotización with no items", async () => {
    mockCotizacionFindFirst.mockResolvedValue(baseCotizacion({ items: [] }));
    const formData = new FormData();
    formData.set("canal", "EMAIL");
    formData.set("vigenciaDias", "5");

    const result = await enviarCotizacionAction("q1", enviarInitial, formData);

    expect(result).toEqual({ error: "Agrega al menos un ítem antes de enviar la cotización", success: false });
  });

  it("rejects an invalid transition (already APROBADA)", async () => {
    mockCotizacionFindFirst.mockResolvedValue(baseCotizacion({ estado: "APROBADA", items: [{ id: "i1" }] }));
    const formData = new FormData();
    formData.set("canal", "EMAIL");
    formData.set("vigenciaDias", "5");

    const result = await enviarCotizacionAction("q1", enviarInitial, formData);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No se puede cambiar de APROBADA a ENVIADA/);
  });

  it("transitions BORRADOR to ENVIADA and sets validaHasta from vigenciaDias", async () => {
    mockCotizacionFindFirst.mockResolvedValue(baseCotizacion({ items: [{ id: "i1" }] }));
    const formData = new FormData();
    formData.set("canal", "WHATSAPP");
    formData.set("vigenciaDias", "5");
    formData.set("notas", "Precios sujetos a disponibilidad");

    const before = Date.now();
    const result = await enviarCotizacionAction("q1", enviarInitial, formData);
    const after = Date.now();

    expect(result).toEqual({ error: null, success: true });
    expect(mockCotizacionUpdate).toHaveBeenCalledTimes(1);
    const call = mockCotizacionUpdate.mock.calls[0][0] as {
      where: { id: string };
      data: { estado: string; validaHasta: Date; notas: string };
    };
    expect(call.where).toEqual({ id: "q1" });
    expect(call.data.estado).toBe("ENVIADA");
    expect(call.data.notas).toBe("Precios sujetos a disponibilidad");
    const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;
    expect(call.data.validaHasta.getTime()).toBeGreaterThanOrEqual(before + fiveDaysMs);
    expect(call.data.validaHasta.getTime()).toBeLessThanOrEqual(after + fiveDaysMs);
  });
});

describe("aprobarCotizacionAction", () => {
  it("rejects an invalid transition (still BORRADOR)", async () => {
    mockCotizacionFindFirst.mockResolvedValue(baseCotizacion({ estado: "BORRADOR" }));

    const result = await aprobarCotizacionAction("q1", aprobarInitial, new FormData());

    expect(result).toEqual({ error: "No se puede cambiar de BORRADOR a APROBADA", success: false, ordenId: null });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("copies REPUESTO items to ItemOrden and MANO_OBRA items to ManoDeObra inside one transaction", async () => {
    mockCotizacionFindFirst.mockResolvedValue(
      baseCotizacion({
        estado: "ENVIADA",
        items: [
          { tipo: "REPUESTO", repuestoId: "r1", descripcion: "Pastillas de freno", cantidad: "2", precioUnitario: "18.9" },
          { tipo: "MANO_OBRA", repuestoId: null, descripcion: "Cambio de pastillas", cantidad: "1", precioUnitario: "50" },
        ],
      }),
    );

    const result = await aprobarCotizacionAction("q1", aprobarInitial, new FormData());

    expect(result).toEqual({ error: null, success: true, ordenId: "o1" });
    expect(mockOrdenTrabajoCreateTx).toHaveBeenCalledWith({
      data: { clienteId: "c1", vehiculoId: "v1", sedeId: "sede-1", creadoPorId: "u1" },
    });
    expect(mockItemOrdenCreateTx).toHaveBeenCalledWith({
      data: { ordenId: "o1", repuestoId: "r1", descripcion: "Pastillas de freno", cantidad: 2, precioUnitario: "18.9" },
    });
    expect(mockManoDeObraCreateTx).toHaveBeenCalledWith({
      data: { ordenId: "o1", descripcion: "Cambio de pastillas", valor: 50 },
    });
    expect(mockCotizacionUpdateTx).toHaveBeenCalledWith({
      where: { id: "q1" },
      data: { estado: "APROBADA", ordenId: "o1" },
    });
  });
});

describe("rechazarCotizacionAction", () => {
  it("rejects an invalid transition (already RECHAZADA)", async () => {
    mockCotizacionFindFirst.mockResolvedValue(baseCotizacion({ estado: "RECHAZADA" }));

    const result = await rechazarCotizacionAction("q1", rechazarInitial, new FormData());

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No se puede cambiar de RECHAZADA a RECHAZADA/);
  });

  it("transitions ENVIADA to RECHAZADA", async () => {
    mockCotizacionFindFirst.mockResolvedValue(baseCotizacion({ estado: "ENVIADA" }));

    const result = await rechazarCotizacionAction("q1", rechazarInitial, new FormData());

    expect(result).toEqual({ error: null, success: true });
  });
});

describe("listCotizaciones", () => {
  it("lists cotizaciones scoped to the sede activa", async () => {
    mockCotizacionFindMany.mockResolvedValue([]);

    await listCotizaciones();

    expect(mockCotizacionFindMany).toHaveBeenCalledWith({
      where: { sedeId: "sede-1" },
      include: expect.anything(),
      orderBy: { createdAt: "desc" },
    });
  });

  it("combines the estado filter with the sede filter", async () => {
    mockCotizacionFindMany.mockResolvedValue([]);

    await listCotizaciones("ENVIADA");

    expect(mockCotizacionFindMany).toHaveBeenCalledWith({
      where: { sedeId: "sede-1", estado: "ENVIADA" },
      include: expect.anything(),
      orderBy: { createdAt: "desc" },
    });
  });
});

describe("getCotizacion", () => {
  it("fetches a single cotización scoped to the sede activa", async () => {
    mockCotizacionFindFirst.mockResolvedValue({ id: "q1" });

    const result = await getCotizacion("q1");

    expect(result).toEqual({ id: "q1" });
    expect(mockCotizacionFindFirst).toHaveBeenCalledWith({
      where: { id: "q1", sedeId: "sede-1" },
      include: expect.anything(),
    });
  });

  it("returns null for a cotización belonging to another sede", async () => {
    mockCotizacionFindFirst.mockResolvedValue(null);

    await expect(getCotizacion("q-otra-sede")).resolves.toBeNull();
  });
});
