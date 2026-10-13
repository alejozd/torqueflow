import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({ requireRole: (...args: unknown[]) => mockRequireRole(...args) }));

const tx = {
  repuesto: { update: vi.fn() },
  ventaMostradorItem: { update: vi.fn() },
  ventaMostrador: { updateMany: vi.fn() },
  devolucionMostrador: { create: vi.fn() },
  auditLog: { create: vi.fn() },
};
const db = {
  cajaSesion: { findFirst: vi.fn() },
  ventaMostrador: { findFirst: vi.fn() },
  $transaction: (fn: (cliente: typeof tx) => unknown) => fn(tx),
};
vi.mock("@/lib/db/tenant-client", () => ({ getTenantDb: () => db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { crearDevolucionAction } from "./devolucion-mostrador-actions";

const SESION = { user: { id: "u1", role: "RECEPCION", tenantSchema: "taller", sedeActivaId: "sede-1" } };
const inicial = { error: null, success: false };

function fd(campos: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [clave, valor] of Object.entries(campos)) formData.set(clave, valor);
  return formData;
}

const ITEM = {
  id: "i1",
  repuestoId: "r1",
  descripcion: "Filtro de aceite",
  cantidad: 2,
  precioUnitario: "25000",
  devueltoCantidad: 0,
};

/** Venta pagada de 2 × 25.000 con IVA = 59.500. */
function venta(cambios: Record<string, unknown> = {}) {
  return {
    id: "v1",
    total: "59500",
    saldoPendiente: "0",
    items: [{ ...ITEM }],
    devoluciones: [],
    ...cambios,
  };
}

function devolucion(campos: Record<string, string> = {}) {
  return fd({
    lineas: JSON.stringify([{ ventaItemId: "i1", cantidad: 1 }]),
    motivo: "Le quedó grande",
    metodoPago: "EFECTIVO",
    ...campos,
  });
}

describe("crearDevolucionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(SESION);
    db.cajaSesion.findFirst.mockResolvedValue({ id: "c1", abiertaAt: new Date("2026-10-17T13:00:00Z") });
    db.ventaMostrador.findFirst.mockResolvedValue(venta());
    tx.repuesto.update.mockResolvedValue({});
    tx.ventaMostradorItem.update.mockResolvedValue({});
    tx.ventaMostrador.updateMany.mockResolvedValue({ count: 1 });
    tx.devolucionMostrador.create.mockResolvedValue({ id: "d1", numero: 3 });
    tx.auditLog.create.mockResolvedValue({});
  });

  it("devuelve el dinero, reingresa el stock y audita", async () => {
    const r = await crearDevolucionAction("v1", inicial, devolucion());

    expect(r).toEqual({ error: null, success: true, numero: 3 });
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
    expect(tx.repuesto.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { stockActual: { increment: 1 } },
    });
    expect(tx.ventaMostradorItem.update).toHaveBeenCalledWith({
      where: { id: "i1" },
      data: { devueltoCantidad: { increment: 1 } },
    });
    const creada = tx.devolucionMostrador.create.mock.calls[0]![0].data;
    // 25.000 + 19% de IVA
    expect(Number(creada.total)).toBe(29750);
    expect(Number(creada.montoEnEfectivo)).toBe(29750);
    expect(creada).toMatchObject({ ventaId: "v1", sedeId: "sede-1", metodoPago: "EFECTIVO", creadoPorId: "u1" });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: "VENTA_DEVOLVER",
        entidadId: "d1",
        detalle: expect.objectContaining({ ventaId: "v1", total: 29750, enEfectivo: 29750 }),
      }),
    });
    // La venta estaba pagada: no se toca el saldo.
    expect(tx.ventaMostrador.updateMany).not.toHaveBeenCalled();
  });

  it("si la venta estaba a crédito, primero baja la deuda y no saca dinero", async () => {
    db.ventaMostrador.findFirst.mockResolvedValue(venta({ saldoPendiente: "59500" }));

    const r = await crearDevolucionAction(
      "v1",
      inicial,
      devolucion({ lineas: JSON.stringify([{ ventaItemId: "i1", cantidad: 2 }]) }),
    );

    expect(r.success).toBe(true);
    expect(tx.ventaMostrador.updateMany).toHaveBeenCalledWith({
      where: { id: "v1", saldoPendiente: { gte: 59500 } },
      data: { saldoPendiente: { decrement: 59500 } },
    });
    const creada = tx.devolucionMostrador.create.mock.calls[0]![0].data;
    expect(Number(creada.total)).toBe(59500);
    expect(Number(creada.montoEnEfectivo)).toBe(0);
  });

  it("si la deuda es menor que lo devuelto, la diferencia sí sale del cajón", async () => {
    db.ventaMostrador.findFirst.mockResolvedValue(venta({ saldoPendiente: "10000" }));

    await crearDevolucionAction(
      "v1",
      inicial,
      devolucion({ lineas: JSON.stringify([{ ventaItemId: "i1", cantidad: 1 }]) }),
    );

    const creada = tx.devolucionMostrador.create.mock.calls[0]![0].data;
    expect(Number(creada.total)).toBe(29750);
    expect(Number(creada.montoEnEfectivo)).toBe(19750);
    expect(Number(tx.ventaMostrador.updateMany.mock.calls[0]![0].data.saldoPendiente.decrement)).toBe(10000);
  });

  it("no deja devolver más de lo vendido ni dos veces la misma línea", async () => {
    db.ventaMostrador.findFirst.mockResolvedValue(
      venta({ items: [{ ...ITEM, devueltoCantidad: 2 }] }),
    );
    expect((await crearDevolucionAction("v1", inicial, devolucion())).error).toBe(
      '"Filtro de aceite" ya se devolvió por completo',
    );

    db.ventaMostrador.findFirst.mockResolvedValue(venta({ items: [{ ...ITEM, devueltoCantidad: 1 }] }));
    expect(
      (
        await crearDevolucionAction(
          "v1",
          inicial,
          devolucion({ lineas: JSON.stringify([{ ventaItemId: "i1", cantidad: 2 }]) }),
        )
      ).error,
    ).toBe('De "Filtro de aceite" solo quedan 1 por devolver');
    expect(tx.devolucionMostrador.create).not.toHaveBeenCalled();
  });

  it("una línea de otra venta se rechaza", async () => {
    const r = await crearDevolucionAction(
      "v1",
      inicial,
      devolucion({ lineas: JSON.stringify([{ ventaItemId: "ajeno", cantidad: 1 }]) }),
    );

    expect(r.error).toBe("Una de las líneas no pertenece a esta venta");
  });

  it("exige caja abierta y una venta de la sede", async () => {
    db.cajaSesion.findFirst.mockResolvedValue(null);
    expect((await crearDevolucionAction("v1", inicial, devolucion())).error).toBe(
      "Abre la caja antes de devolver en el mostrador",
    );

    db.cajaSesion.findFirst.mockResolvedValue({ id: "c1", abiertaAt: new Date() });
    db.ventaMostrador.findFirst.mockResolvedValue(null);
    expect((await crearDevolucionAction("ajena", inicial, devolucion())).error).toBe("Venta no encontrada");
    expect(db.ventaMostrador.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: "ajena", sedeId: "sede-1" } }),
    );
  });

  it("no devuelve más dinero del que la venta cobró (tope con descuento)", async () => {
    // Venta con descuento: cobró 50.000 por dos unidades de 25.000 (total 59.500 con IVA, pero con descuento).
    db.ventaMostrador.findFirst.mockResolvedValue(venta({ total: "40000" }));

    await crearDevolucionAction(
      "v1",
      inicial,
      devolucion({ lineas: JSON.stringify([{ ventaItemId: "i1", cantidad: 2 }]) }),
    );

    const creada = tx.devolucionMostrador.create.mock.calls[0]![0].data;
    // El valor de las líneas (59.500) queda topado por lo que la venta cobró (40.000).
    expect(Number(creada.total)).toBe(40000);
  });

  it("un saldo que cambió mientras se devolvía avisa y no registra nada", async () => {
    db.ventaMostrador.findFirst.mockResolvedValue(venta({ saldoPendiente: "59500" }));
    tx.ventaMostrador.updateMany.mockResolvedValue({ count: 0 });

    const r = await crearDevolucionAction("v1", inicial, devolucion());

    expect(r.error).toContain("El saldo de la venta cambió");
    expect(tx.devolucionMostrador.create).not.toHaveBeenCalled();
  });

  it("rechaza una devolución sin líneas o mal formada", async () => {
    expect((await crearDevolucionAction("v1", inicial, fd({ lineas: "no es json" }))).error).toBe(
      "No se pudieron leer las líneas de la devolución",
    );
    expect((await crearDevolucionAction("v1", inicial, fd({ lineas: "[]" }))).error).toBe(
      "Elige al menos una línea para devolver",
    );
  });
});
