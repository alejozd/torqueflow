import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const opcionesTaller = { exigirActaFirmada: false, usarControlCaja: true };

const mockRequirePermiso = vi.fn();
import { permisosEfectivos } from "@/lib/auth/permisos";
vi.mock("@/lib/auth/guards", () => ({
  requirePermiso: (...args: unknown[]) => mockRequirePermiso(...args),
  puede: (session: { user: { permisos: string[] } }, permiso: string) => session.user.permisos.includes(permiso),
}));

const tx = {
  repuesto: { update: vi.fn() },
  ventaMostradorItem: { updateMany: vi.fn() },
  ventaMostrador: { updateMany: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
  devolucionMostrador: { create: vi.fn() },
  auditLog: { create: vi.fn() },
};
const db = {
  cajaSesion: { findFirst: vi.fn() },
  // Control de caja encendido: la regla del efectivo aplica (fase de consolidación, D3).
  configuracionTaller: { findUnique: async () => opcionesTaller },
  ventaMostrador: { findFirst: vi.fn() },
  $transaction: (fn: (cliente: typeof tx) => unknown) => fn(tx),
};
vi.mock("@/lib/db/tenant-client", () => ({ getTenantDb: () => db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { crearDevolucionAction } from "./devolucion-mostrador-actions";

let cajaAbierta: { id: string; abiertaAt: Date } | null = null;
let cierres: Date[] = [];

const SESION = { user: { id: "u1", role: "RECEPCION", permisos: permisosEfectivos({ role: "RECEPCION" }), tenantSchema: "taller", sedeActivaId: "sede-1" } };
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
    subtotal: "50000",
    total: "59500",
    saldoPendiente: "0",
    // 10:00 en Bogotá, con la caja abierta a las 08:00 (ver beforeEach).
    createdAt: new Date("2026-10-17T15:00:00Z"),
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
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // "Ahora" es la tarde del mismo día de la venta.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-17T20:00:00Z"));
    mockRequirePermiso.mockResolvedValue(SESION);
    cajaAbierta = { id: "c1", abiertaAt: new Date("2026-10-17T13:00:00Z") };
    cierres = [];
    // La misma tabla responde dos preguntas: la caja abierta y el último cierre (posterior a una fecha).
    db.cajaSesion.findFirst.mockImplementation(
      async ({ where }: { where: { cerradaAt: null | { gt?: Date; not?: null } } }) => {
        if (where.cerradaAt === null) return cajaAbierta;
        const despuesDe = where.cerradaAt.gt;
        const validos = cierres.filter((cierre) => !despuesDe || cierre > despuesDe).sort((a, b) => b.getTime() - a.getTime());
        return validos[0] ? { cerradaAt: validos[0] } : null;
      },
    );
    db.ventaMostrador.findFirst.mockResolvedValue(venta());
    tx.repuesto.update.mockResolvedValue({});
    tx.ventaMostradorItem.updateMany.mockResolvedValue({ count: 1 });
    tx.ventaMostrador.updateMany.mockResolvedValue({ count: 1 });
    tx.ventaMostrador.findUniqueOrThrow.mockResolvedValue({ saldoPendiente: "0" });
    tx.ventaMostrador.update.mockResolvedValue({});
    tx.devolucionMostrador.create.mockResolvedValue({ id: "d1", numero: 3 });
    tx.auditLog.create.mockResolvedValue({});
  });

  it("devuelve el dinero, reingresa el stock y audita", async () => {
    const r = await crearDevolucionAction("v1", inicial, devolucion());

    expect(r).toEqual({ error: null, success: true, numero: 3 });
    expect(mockRequirePermiso).toHaveBeenCalledWith("mostrador.vender");
    expect(tx.repuesto.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { stockActual: { increment: 1 } },
    });
    expect(tx.ventaMostradorItem.updateMany).toHaveBeenCalledWith({
      where: { id: "i1", devueltoCantidad: { lte: 1 } },
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
    cajaAbierta = null;
    expect((await crearDevolucionAction("v1", inicial, devolucion())).error).toBe(
      "Abre la caja antes de devolver dinero en efectivo en el mostrador",
    );

    cajaAbierta = { id: "c1", abiertaAt: new Date("2026-10-17T13:00:00Z") };
    db.ventaMostrador.findFirst.mockResolvedValue(null);
    expect((await crearDevolucionAction("ajena", inicial, devolucion())).error).toBe("Venta no encontrada");
    expect(db.ventaMostrador.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: "ajena", sedeId: "sede-1" } }),
    );
  });

  it("lo que no sale del cajón en efectivo no exige caja (fase de consolidación, D3)", async () => {
    cajaAbierta = null;

    // Devuelto por transferencia: no toca el cajón.
    expect((await crearDevolucionAction("v1", inicial, devolucion({ metodoPago: "TRANSFERENCIA" }))).error).toBeNull();

    // Venta a crédito: la devolución baja la deuda y no sale dinero.
    db.ventaMostrador.findFirst.mockResolvedValue(venta({ saldoPendiente: "59500" }));
    expect((await crearDevolucionAction("v1", inicial, devolucion())).error).toBeNull();
  });

  it("con el control de caja apagado, ni el efectivo exige caja", async () => {
    cajaAbierta = null;
    opcionesTaller.usarControlCaja = false;
    try {
      expect((await crearDevolucionAction("v1", inicial, devolucion())).error).toBeNull();
    } finally {
      opcionesTaller.usarControlCaja = true;
    }
  });

  it("una venta de más de 30 días no se devuelve, ni siquiera ADMIN", async () => {
    mockRequirePermiso.mockResolvedValue({ user: { ...SESION.user, role: "ADMIN", permisos: permisosEfectivos({ role: "ADMIN" }) } });
    db.ventaMostrador.findFirst.mockResolvedValue(venta({ createdAt: new Date("2026-09-17T19:00:00Z") }));

    const r = await crearDevolucionAction("v1", inicial, devolucion());

    expect(r).toEqual({ error: "Esta venta tiene más de 30 días: ya no se puede devolver", success: false });
    expect(tx.devolucionMostrador.create).not.toHaveBeenCalled();
    expect(tx.repuesto.update).not.toHaveBeenCalled();
  });

  it("RECEPCION devuelve una venta por transferencia de hoy hecha sin caja, antes y después de abrirla", async () => {
    // Venta a las 10:00 sin caja abierta; un cierre de ayer no la toca.
    cierres = [new Date("2026-10-17T00:00:00Z")];
    cajaAbierta = null;
    expect((await crearDevolucionAction("v1", inicial, devolucion({ metodoPago: "TRANSFERENCIA" }))).error).toBeNull();

    // Se abre la caja después de la venta: sigue sin cierre posterior.
    cajaAbierta = { id: "c2", abiertaAt: new Date("2026-10-17T17:00:00Z") };
    expect((await crearDevolucionAction("v1", inicial, devolucion({ metodoPago: "TRANSFERENCIA" }))).error).toBeNull();
    expect(db.cajaSesion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sedeId: "sede-1", cerradaAt: { gt: new Date("2026-10-17T15:00:00Z") } } }),
    );
  });

  it("cuando una caja se cerró después de la venta (ya hizo arqueo), RECEPCION no devuelve y ADMIN sí", async () => {
    cierres = [new Date("2026-10-17T18:00:00Z")];
    cajaAbierta = { id: "c2", abiertaAt: new Date("2026-10-17T19:00:00Z") };

    const r = await crearDevolucionAction("v1", inicial, devolucion());
    expect(r).toEqual({
      error: "Esta venta es de una caja ya cerrada: solo un administrador puede devolverla",
      success: false,
    });
    expect(tx.devolucionMostrador.create).not.toHaveBeenCalled();

    mockRequirePermiso.mockResolvedValue({ user: { ...SESION.user, role: "ADMIN", permisos: permisosEfectivos({ role: "ADMIN" }) } });
    expect(await crearDevolucionAction("v1", inicial, devolucion())).toEqual({ error: null, success: true, numero: 3 });
  });

  it("ADMIN devuelve dentro de los 30 días aunque la venta sea de una caja cerrada hace semanas", async () => {
    mockRequirePermiso.mockResolvedValue({ user: { ...SESION.user, role: "ADMIN", permisos: permisosEfectivos({ role: "ADMIN" }) } });
    db.ventaMostrador.findFirst.mockResolvedValue(venta({ createdAt: new Date("2026-09-20T15:00:00Z") }));
    cierres = [new Date("2026-09-21T01:00:00Z")];

    expect((await crearDevolucionAction("v1", inicial, devolucion())).error).toBeNull();
  });

  it("con el control de caja apagado, RECEPCION devuelve lo de hoy pero no lo de ayer", async () => {
    opcionesTaller.usarControlCaja = false;
    try {
      cajaAbierta = null;
      expect((await crearDevolucionAction("v1", inicial, devolucion())).error).toBeNull();

      // 23:00 de ayer en Bogotá.
      db.ventaMostrador.findFirst.mockResolvedValue(venta({ createdAt: new Date("2026-10-17T04:00:00Z") }));
      expect((await crearDevolucionAction("v1", inicial, devolucion())).error).toBe(
        "Esta venta es de una caja ya cerrada: solo un administrador puede devolverla",
      );
    } finally {
      opcionesTaller.usarControlCaja = true;
    }
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

  it("una segunda devolución simultánea de la misma línea no paga ni reingresa stock", async () => {
    // La guarda por línea no encuentra unidades libres: alguien devolvió antes.
    tx.ventaMostradorItem.updateMany.mockResolvedValue({ count: 0 });

    const r = await crearDevolucionAction("v1", inicial, devolucion());

    expect(r.error).toContain("Alguien acaba de devolver esas unidades");
    expect(tx.repuesto.update).not.toHaveBeenCalled();
    expect(tx.devolucionMostrador.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("una devolución que salda la deuda deja la venta pagada", async () => {
    db.ventaMostrador.findFirst.mockResolvedValue(venta({ saldoPendiente: "59500" }));
    tx.ventaMostrador.findUniqueOrThrow.mockResolvedValue({ saldoPendiente: "0" });

    await crearDevolucionAction(
      "v1",
      inicial,
      devolucion({ lineas: JSON.stringify([{ ventaItemId: "i1", cantidad: 2 }]) }),
    );

    expect(tx.ventaMostrador.update).toHaveBeenCalledWith({ where: { id: "v1" }, data: { estado: "PAGADA" } });
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
