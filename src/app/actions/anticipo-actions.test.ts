import { describe, expect, it, vi, beforeEach } from "vitest";

const opcionesTaller = { exigirActaFirmada: false, usarControlCaja: true };

const mockRequireRole = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: () => mockRequireSession(),
}));

const mockOrdenFindFirst = vi.fn();
const mockAnticipoCreate = vi.fn();
const mockAnticipoFindMany = vi.fn();
const mockAnticipoFindFirst = vi.fn();
const mockAnticipoUpdateMany = vi.fn();
const mockCajaFindFirst = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    ordenTrabajo: { findFirst: mockOrdenFindFirst },
    cajaSesion: { findFirst: mockCajaFindFirst },
    // Control de caja encendido: la regla del efectivo aplica (fase de consolidación, D3).
    configuracionTaller: { findUnique: async () => opcionesTaller },
    anticipo: {
      create: mockAnticipoCreate,
      findMany: mockAnticipoFindMany,
      findFirst: mockAnticipoFindFirst,
      updateMany: mockAnticipoUpdateMany,
    },
  }),
}));

const mockRevalidate = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => mockRevalidate(...a) }));

import {
  devolverAnticipoAction,
  listAnticiposDeOrden,
  registrarAnticipoAction,
  type AnticipoFormState,
} from "./anticipo-actions";

const initial: AnticipoFormState = { error: null, success: false };
const SESSION = { user: { id: "u1", role: "RECEPCION", tenantSchema: "t", sedeActivaId: "sede-1" } };

function fd(values: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

describe("registrarAnticipoAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(SESSION);
    mockOrdenFindFirst.mockReset().mockResolvedValue({ id: "o1", sedeId: "sede-1", estado: "EN_PROCESO", factura: null });
    mockAnticipoCreate.mockReset().mockResolvedValue({ id: "a1" });
    mockCajaFindFirst.mockReset().mockResolvedValue({ id: "c1", abiertaAt: new Date("2026-10-17T13:00:00Z") });
    mockRevalidate.mockReset();
  });

  it("con la caja cerrada sí registra un anticipo por transferencia (solo el efectivo la exige)", async () => {
    mockCajaFindFirst.mockResolvedValue(null);

    const r = await registrarAnticipoAction("o1", initial, fd({ monto: "50000", metodoPago: "TRANSFERENCIA" }));

    expect(r).toEqual({ error: null, success: true });
    expect(mockAnticipoCreate).toHaveBeenCalled();
  });

  it("no registra el anticipo con la caja cerrada (Fase 24)", async () => {
    mockCajaFindFirst.mockResolvedValue(null);

    const r = await registrarAnticipoAction("o1", initial, fd({ monto: "50000", metodoPago: "EFECTIVO" }));

    expect(r).toEqual({ error: "Abre la caja antes de registrar el anticipo", success: false });
    expect(mockAnticipoCreate).not.toHaveBeenCalled();
    expect(mockCajaFindFirst).toHaveBeenCalledWith({
      where: { sedeId: "sede-1", cerradaAt: null },
      select: { id: true, abiertaAt: true },
    });
  });

  it("creates a PENDIENTE anticipo with the sede of the orden and revalidates", async () => {
    const r = await registrarAnticipoAction("o1", initial, fd({ monto: "50000", metodoPago: "EFECTIVO", referencia: " r1 " }));
    expect(r).toEqual({ error: null, success: true });
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
    expect(mockOrdenFindFirst.mock.calls[0][0].where).toMatchObject({ id: "o1", sedeId: "sede-1" });
    expect(mockAnticipoCreate.mock.calls[0][0].data).toMatchObject({
      ordenId: "o1",
      sedeId: "sede-1",
      monto: 50000,
      metodoPago: "EFECTIVO",
      referencia: "r1",
      registradoPorId: "u1",
    });
    expect(mockRevalidate).toHaveBeenCalledWith("/ordenes/o1");
  });

  it("rejects invalid input and the ANTICIPO method", async () => {
    expect((await registrarAnticipoAction("o1", initial, fd({ monto: "0", metodoPago: "EFECTIVO" }))).success).toBe(false);
    const r = await registrarAnticipoAction("o1", initial, fd({ monto: "10", metodoPago: "ANTICIPO" }));
    expect(r.success).toBe(false);
    expect(mockAnticipoCreate).not.toHaveBeenCalled();
  });

  it("rejects an orden outside the sede", async () => {
    mockOrdenFindFirst.mockResolvedValue(null);
    const r = await registrarAnticipoAction("o1", initial, fd({ monto: "10", metodoPago: "EFECTIVO" }));
    expect(r).toEqual({ error: "Orden no encontrada", success: false });
  });

  it("rejects an orden ya facturada", async () => {
    mockOrdenFindFirst.mockResolvedValue({ id: "o1", sedeId: "sede-1", estado: "TERMINADA", factura: { id: "f1" } });
    const r = await registrarAnticipoAction("o1", initial, fd({ monto: "10", metodoPago: "EFECTIVO" }));
    expect(r).toEqual({ error: "La orden ya está facturada", success: false });
    expect(mockAnticipoCreate).not.toHaveBeenCalled();
  });

  it("rejects an orden ANULADA", async () => {
    mockOrdenFindFirst.mockResolvedValue({ id: "o1", sedeId: "sede-1", estado: "ANULADA", factura: null });
    const r = await registrarAnticipoAction("o1", initial, fd({ monto: "10", metodoPago: "EFECTIVO" }));
    expect(r.error).toBe("No se pueden registrar anticipos en una orden anulada");
    expect(mockAnticipoCreate).not.toHaveBeenCalled();
  });
});

describe("devolverAnticipoAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { ...SESSION.user, role: "ADMIN" } });
    mockAnticipoFindFirst.mockReset().mockResolvedValue({ id: "a1", ordenId: "o1" });
    mockAnticipoUpdateMany.mockReset().mockResolvedValue({ count: 1 });
    mockRevalidate.mockReset();
  });

  it("marks a PENDIENTE anticipo as DEVUELTO (ADMIN only)", async () => {
    const r = await devolverAnticipoAction("a1", initial, fd({ metodoDevolucion: "EFECTIVO" }));
    expect(r).toEqual({ error: null, success: true });
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
    expect(mockAnticipoFindFirst.mock.calls[0][0].where).toMatchObject({ id: "a1", orden: { sedeId: "sede-1" } });
    const call = mockAnticipoUpdateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: "a1", estado: "PENDIENTE" });
    expect(call.data).toMatchObject({ estado: "DEVUELTO", devueltoPorId: "u1", metodoDevolucion: "EFECTIVO" });
    expect(call.data.devueltoAt).toBeInstanceOf(Date);
    expect(mockRevalidate).toHaveBeenCalledWith("/ordenes/o1");
  });

  it("fails when the anticipo is no longer PENDIENTE", async () => {
    mockAnticipoUpdateMany.mockResolvedValue({ count: 0 });
    const r = await devolverAnticipoAction("a1", initial, fd({ metodoDevolucion: "EFECTIVO" }));
    expect(r).toEqual({ error: "Este anticipo ya fue aplicado o devuelto", success: false });
  });

  it("fails when the anticipo does not exist in the sede", async () => {
    mockAnticipoFindFirst.mockResolvedValue(null);
    const r = await devolverAnticipoAction("a1", initial, fd({ metodoDevolucion: "EFECTIVO" }));
    expect(r).toEqual({ error: "Anticipo no encontrado", success: false });
  });

  it("rejects ANTICIPO as refund method", async () => {
    const r = await devolverAnticipoAction("a1", initial, fd({ metodoDevolucion: "ANTICIPO" }));
    expect(r.success).toBe(false);
    expect(mockAnticipoUpdateMany).not.toHaveBeenCalled();
  });
});

describe("listAnticiposDeOrden", () => {
  it("scopes by sede and converts Decimals to numbers", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockAnticipoFindMany.mockResolvedValue([
      {
        id: "a1",
        monto: { toString: () => "50000.5", valueOf: () => "50000.5" },
        metodoPago: "EFECTIVO",
        referencia: null,
        estado: "PENDIENTE",
        createdAt: new Date("2026-10-10T12:00:00Z"),
        registradoPor: { nombre: "Ana" },
      },
    ]);
    const rows = await listAnticiposDeOrden("o1");
    expect(mockAnticipoFindMany.mock.calls[0][0].where).toMatchObject({ ordenId: "o1", orden: { sedeId: "sede-1" } });
    expect(rows).toEqual([
      {
        id: "a1",
        monto: 50000.5,
        metodoPago: "EFECTIVO",
        referencia: null,
        estado: "PENDIENTE",
        createdAt: new Date("2026-10-10T12:00:00Z"),
        registradoPorNombre: "Ana",
      },
    ]);
  });
});
