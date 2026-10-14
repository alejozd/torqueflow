import { beforeEach, describe, expect, it, vi } from "vitest";

const opcionesTaller = { exigirActaFirmada: false, usarControlCaja: true };

const mockRequireRole = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: () => mockRequireSession(),
}));

const tx = {
  cuentaPorPagar: { updateMany: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
  pagoProveedor: { create: vi.fn() },
};
const db = {
  cuentaPorPagar: { findFirst: vi.fn(), findMany: vi.fn() },
  cajaSesion: { findFirst: vi.fn() },
  // Control de caja encendido: la regla del efectivo aplica (fase de consolidación, D3).
  configuracionTaller: { findUnique: async () => opcionesTaller },
  $transaction: (fn: (cliente: typeof tx) => unknown) => fn(tx),
};
vi.mock("@/lib/db/tenant-client", () => ({ getTenantDb: () => db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { abonarCuentaPorPagarAction, getCuentasPorPagar } from "./cuenta-por-pagar-actions";

const SESION = { user: { id: "u1", role: "RECEPCION", tenantSchema: "taller", sedeActivaId: "sede-1" } };
const inicial = { error: null, success: false };

function fd(campos: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [clave, valor] of Object.entries(campos)) formData.set(clave, valor);
  return formData;
}

describe("abonarCuentaPorPagarAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(SESION);
    mockRequireSession.mockResolvedValue(SESION);
    db.cuentaPorPagar.findFirst.mockResolvedValue({ id: "c1", saldoPendiente: "170000" });
    db.cajaSesion.findFirst.mockResolvedValue({ id: "s1", abiertaAt: new Date("2026-10-17T13:00:00Z") });
    tx.cuentaPorPagar.updateMany.mockResolvedValue({ count: 1 });
    tx.cuentaPorPagar.findUniqueOrThrow.mockResolvedValue({ saldoPendiente: "0" });
    tx.pagoProveedor.create.mockResolvedValue({});
  });

  it("abona con guarda atómica y marca la cuenta como pagada al saldar", async () => {
    const r = await abonarCuentaPorPagarAction("c1", inicial, fd({ monto: "170000", metodoPago: "TRANSFERENCIA" }));

    expect(r).toEqual({ error: null, success: true });
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
    expect(tx.cuentaPorPagar.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", saldoPendiente: { gte: 170000 } },
      data: { saldoPendiente: { decrement: 170000 } },
    });
    expect(tx.pagoProveedor.create).toHaveBeenCalledWith({
      data: { cuentaId: "c1", monto: 170000, metodoPago: "TRANSFERENCIA", referencia: null, registradoPorId: "u1" },
    });
    expect(tx.cuentaPorPagar.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { estado: "PAGADA" } });
  });

  it("un abono parcial no marca la cuenta como pagada", async () => {
    tx.cuentaPorPagar.findUniqueOrThrow.mockResolvedValue({ saldoPendiente: "70000" });

    const r = await abonarCuentaPorPagarAction("c1", inicial, fd({ monto: "100000", metodoPago: "EFECTIVO" }));

    expect(r.success).toBe(true);
    expect(tx.cuentaPorPagar.update).not.toHaveBeenCalled();
  });

  it("si alguien abonó antes o el saldo cambió, avisa y no registra el pago", async () => {
    tx.cuentaPorPagar.updateMany.mockResolvedValue({ count: 0 });

    const r = await abonarCuentaPorPagarAction("c1", inicial, fd({ monto: "170000", metodoPago: "EFECTIVO" }));

    expect(r.error).toContain("alguien acaba de abonar");
    expect(tx.pagoProveedor.create).not.toHaveBeenCalled();
  });

  it("no abona una cuenta ya pagada ni una de otra sede", async () => {
    db.cuentaPorPagar.findFirst.mockResolvedValue({ id: "c1", saldoPendiente: "0" });
    expect((await abonarCuentaPorPagarAction("c1", inicial, fd({ monto: "100", metodoPago: "EFECTIVO" }))).error).toBe(
      "Esa cuenta ya está pagada",
    );

    db.cuentaPorPagar.findFirst.mockResolvedValue(null);
    expect((await abonarCuentaPorPagarAction("ajena", inicial, fd({ monto: "100", metodoPago: "EFECTIVO" }))).error).toBe(
      "Cuenta por pagar no encontrada",
    );
    // El alcance por sede va por la bodega de la entrada, no por un parámetro.
    expect(db.cuentaPorPagar.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "ajena", entrada: { bodega: { sedeId: "sede-1" } } },
      }),
    );
  });

  it("pagar en efectivo exige caja abierta; por transferencia no", async () => {
    db.cajaSesion.findFirst.mockResolvedValue(null);

    const enEfectivo = await abonarCuentaPorPagarAction("c1", inicial, fd({ monto: "1000", metodoPago: "EFECTIVO" }));
    expect(enEfectivo.error).toBe("Abre la caja antes de pagar en efectivo a un proveedor");
    expect(tx.pagoProveedor.create).not.toHaveBeenCalled();

    // Una transferencia no toca el cajón, así que no necesita sesión.
    const porTransferencia = await abonarCuentaPorPagarAction(
      "c1",
      inicial,
      fd({ monto: "1000", metodoPago: "TRANSFERENCIA" }),
    );
    expect(porTransferencia.success).toBe(true);
  });

  it("rechaza un monto vacío, cero o sin método", async () => {
    expect((await abonarCuentaPorPagarAction("c1", inicial, fd({ monto: "", metodoPago: "EFECTIVO" }))).error).toBe(
      "El monto es obligatorio",
    );
    expect((await abonarCuentaPorPagarAction("c1", inicial, fd({ monto: "0", metodoPago: "EFECTIVO" }))).error).toBe(
      "El monto debe ser mayor que cero",
    );
    expect((await abonarCuentaPorPagarAction("c1", inicial, fd({ monto: "100" }))).error).toBe("Elige cómo se pagó");
    expect(db.cuentaPorPagar.findFirst).not.toHaveBeenCalled();
  });
});

describe("getCuentasPorPagar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(SESION);
  });

  it("solo ADMIN y RECEPCION ven lo que el taller debe (hallazgo B6)", async () => {
    db.cuentaPorPagar.findMany.mockResolvedValue([]);

    await getCuentasPorPagar();

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
  });

  it("agrupa por proveedor y calcula la antigüedad, solo lo pendiente y de la sede", async () => {
    db.cuentaPorPagar.findMany.mockResolvedValue([
      {
        id: "c1",
        total: "170000",
        saldoPendiente: "70000",
        fecha: new Date(),
        entradaId: "e1",
        proveedor: { id: "p1", nombre: "Repuestos del Norte" },
      },
      {
        id: "c2",
        total: "50000",
        saldoPendiente: "50000",
        fecha: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
        entradaId: "e2",
        proveedor: { id: "p2", nombre: "Frenos SA" },
      },
    ]);

    const { proveedores, totales } = await getCuentasPorPagar();

    expect(db.cuentaPorPagar.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { estado: "PENDIENTE", entrada: { bodega: { sedeId: "sede-1" } } },
      }),
    );
    expect(proveedores.map((p) => p.proveedorNombre)).toEqual(["Repuestos del Norte", "Frenos SA"]);
    expect(totales.total).toBe(120000);
    expect(totales["31-60"]).toBe(50000);
  });
});
