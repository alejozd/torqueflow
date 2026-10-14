import { describe, expect, it, vi, beforeEach } from "vitest";

const opcionesTaller = { exigirActaFirmada: false, usarControlCaja: true };

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockFacturaFindFirst = vi.fn();
const mockCajaFindFirst = vi.fn();
const mockFacturaUpdateMany = vi.fn();
const mockPagoCreate = vi.fn();
const mockFacturaFindUniqueOrThrow = vi.fn();
const mockFacturaUpdate = vi.fn();
const mockTransaction = vi.fn((cb: (tx: unknown) => unknown) =>
  cb({
    factura: {
      updateMany: mockFacturaUpdateMany,
      findUniqueOrThrow: mockFacturaFindUniqueOrThrow,
      update: mockFacturaUpdate,
    },
    pago: { create: mockPagoCreate },
  }),
);
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    factura: { findFirst: mockFacturaFindFirst },
    cajaSesion: { findFirst: mockCajaFindFirst },
    // Control de caja encendido: la regla del efectivo aplica (fase de consolidación, D3).
    configuracionTaller: { findUnique: async () => opcionesTaller },
    $transaction: mockTransaction,
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { registrarPagoAction, type PagoFormState } from "./pago-actions";

const initialState: PagoFormState = { error: null, success: false };
const SESSION_ADMIN = { user: { id: "u1", role: "ADMIN", tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };

describe("registrarPagoAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(SESSION_ADMIN);
    mockFacturaFindFirst.mockReset().mockResolvedValue({ id: "f1" });
    mockFacturaUpdateMany.mockReset().mockResolvedValue({ count: 1 });
    mockPagoCreate.mockReset();
    mockFacturaFindUniqueOrThrow.mockReset().mockResolvedValue({ id: "f1", saldoPendiente: "40.18" });
    mockFacturaUpdate.mockReset();
    mockCajaFindFirst.mockReset().mockResolvedValue({ id: "c1", abiertaAt: new Date("2026-10-17T13:00:00Z") });
    mockTransaction.mockClear();
  });

  it("con la caja cerrada sí cobra con tarjeta, y en efectivo si el taller no usa control de caja", async () => {
    mockCajaFindFirst.mockResolvedValue(null);
    const conTarjeta = new FormData();
    conTarjeta.set("monto", "10000");
    conTarjeta.set("metodoPago", "TARJETA");
    expect(await registrarPagoAction("f1", initialState, conTarjeta)).toEqual({ error: null, success: true });

    const enEfectivo = new FormData();
    enEfectivo.set("monto", "10000");
    enEfectivo.set("metodoPago", "EFECTIVO");
    opcionesTaller.usarControlCaja = false;
    try {
      expect(await registrarPagoAction("f1", initialState, enEfectivo)).toEqual({ error: null, success: true });
    } finally {
      opcionesTaller.usarControlCaja = true;
    }
  });

  it("no cobra con la caja cerrada (Fase 24: el arqueo no lo vería)", async () => {
    mockCajaFindFirst.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("monto", "10000");
    formData.set("metodoPago", "EFECTIVO");

    const result = await registrarPagoAction("f1", initialState, formData);

    expect(result).toEqual({ error: "Abre la caja antes de registrar el cobro", success: false });
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockCajaFindFirst).toHaveBeenCalledWith({
      where: { sedeId: "sede-1", cerradaAt: null },
      select: { id: true, abiertaAt: true },
    });
  });

  it("returns a validation error when monto is left blank, instead of silently defaulting to 0", async () => {
    const formData = new FormData();
    formData.set("metodoPago", "EFECTIVO");

    const result = await registrarPagoAction("f1", initialState, formData);

    expect(result).toEqual({ error: "El monto es obligatorio", success: false });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns a validation error when monto is 0", async () => {
    const formData = new FormData();
    formData.set("monto", "0");
    formData.set("metodoPago", "EFECTIVO");

    const result = await registrarPagoAction("f1", initialState, formData);

    expect(result).toEqual({ error: "El monto debe ser mayor a 0", success: false });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns an error when the factura does not exist", async () => {
    mockFacturaFindFirst.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("monto", "50");
    formData.set("metodoPago", "EFECTIVO");

    const result = await registrarPagoAction("f1", initialState, formData);

    expect(result).toEqual({ error: "Factura no encontrada", success: false });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("refuses to register a payment against a factura from another sede", async () => {
    mockFacturaFindFirst.mockReset().mockResolvedValue(null);
    const formData = new FormData();
    formData.set("monto", "100");
    formData.set("metodoPago", "EFECTIVO");

    const result = await registrarPagoAction("f-otra-sede", initialState, formData);

    expect(result.error).toBe("Factura no encontrada");
    expect(mockFacturaFindFirst).toHaveBeenCalledWith({
      where: { id: "f-otra-sede", orden: { sedeId: "sede-1" } },
      select: { id: true },
    });
  });

  it("registers a partial payment: decrements saldoPendiente atomically and leaves the factura PENDIENTE", async () => {
    const formData = new FormData();
    formData.set("monto", "100");
    formData.set("metodoPago", "EFECTIVO");

    const result = await registrarPagoAction("f1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockFacturaUpdateMany).toHaveBeenCalledWith({
      where: { id: "f1", saldoPendiente: { gte: 100 } },
      data: { saldoPendiente: { decrement: 100 } },
    });
    expect(mockPagoCreate).toHaveBeenCalledWith({
      data: { facturaId: "f1", monto: 100, metodoPago: "EFECTIVO", referencia: null, registradoPorId: "u1" },
    });
    expect(mockFacturaUpdate).not.toHaveBeenCalled();
  });

  it("marks the factura PAGADA once saldoPendiente reaches 0", async () => {
    mockFacturaFindUniqueOrThrow.mockResolvedValue({ id: "f1", saldoPendiente: "0" });
    const formData = new FormData();
    formData.set("monto", "40.18");
    formData.set("metodoPago", "TRANSFERENCIA");

    const result = await registrarPagoAction("f1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockFacturaUpdate).toHaveBeenCalledWith({ where: { id: "f1" }, data: { estado: "PAGADA" } });
  });

  it("rejects a payment that exceeds the saldoPendiente, atomically (no partial write)", async () => {
    mockFacturaUpdateMany.mockResolvedValue({ count: 0 });
    const formData = new FormData();
    formData.set("monto", "99999");
    formData.set("metodoPago", "EFECTIVO");

    const result = await registrarPagoAction("f1", initialState, formData);

    expect(result).toEqual({ error: "El monto no puede ser mayor al saldo pendiente", success: false });
    expect(mockPagoCreate).not.toHaveBeenCalled();
  });
});
