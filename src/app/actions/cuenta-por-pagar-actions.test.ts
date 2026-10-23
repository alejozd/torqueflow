import { beforeEach, describe, expect, it, vi } from "vitest";

const opcionesTaller = { exigirActaFirmada: false, usarControlCaja: true };

const mockRequirePermiso = vi.fn();
const mockRequireSession = vi.fn();
import { permisosEfectivos } from "@/lib/auth/permisos";
vi.mock("@/lib/auth/guards", () => ({
  requirePermiso: (...args: unknown[]) => mockRequirePermiso(...args),
  puede: (session: { user: { permisos: string[] } }, permiso: string) => session.user.permisos.includes(permiso),
  requireSession: () => mockRequireSession(),
}));

const tx = {
  cuentaPorPagar: { updateMany: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  pagoProveedor: { create: vi.fn() },
};
const db = {
  cuentaPorPagar: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  cajaSesion: { findFirst: vi.fn() },
  // Control de caja encendido: la regla del efectivo aplica (fase de consolidación, D3).
  configuracionTaller: { findUnique: async () => opcionesTaller },
  $transaction: (fn: (cliente: typeof tx) => unknown) => fn(tx),
};
vi.mock("@/lib/db/tenant-client", () => ({ getTenantDb: () => db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { montoExacto } from "@/lib/money/monto-exacto";
import { abonarCuentaPorPagarAction, abonarProveedorAction, getCuentasPorPagar } from "./cuenta-por-pagar-actions";

const SESION = { user: { id: "u1", role: "RECEPCION", permisos: permisosEfectivos({ role: "RECEPCION" }), tenantSchema: "taller", sedeActivaId: "sede-1" } };
const inicial = { error: null, success: false };

function fd(campos: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [clave, valor] of Object.entries(campos)) formData.set(clave, valor);
  return formData;
}

describe("abonarCuentaPorPagarAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermiso.mockResolvedValue(SESION);
    mockRequireSession.mockResolvedValue(SESION);
    db.cuentaPorPagar.findFirst.mockResolvedValue({ id: "c1", saldoPendiente: "170000" });
    db.cajaSesion.findFirst.mockResolvedValue({ id: "s1", abiertaAt: new Date("2026-10-17T13:00:00Z") });
    tx.cuentaPorPagar.updateMany.mockResolvedValue({ count: 1 });
    tx.cuentaPorPagar.findUniqueOrThrow.mockResolvedValue({ saldoPendiente: "0" });
    tx.pagoProveedor.create.mockResolvedValue({});
  });

  it("abona con guarda atómica y marca la cuenta como pagada al saldar", async () => {
    const r = await abonarCuentaPorPagarAction("c1", inicial, fd({ monto: "170000", metodoPago: "TRANSFERENCIA" }));

    expect(r).toEqual({ error: null, success: true, montoRegistrado: 170000, saldoRestante: 0, cuentaId: "c1" });
    expect(mockRequirePermiso).toHaveBeenCalledWith("cuentasPorPagar.usar");
    expect(tx.cuentaPorPagar.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", saldoPendiente: { gte: montoExacto(170000) } },
      data: { saldoPendiente: { decrement: montoExacto(170000) } },
    });
    expect(tx.pagoProveedor.create).toHaveBeenCalledWith({
      data: { cuentaId: "c1", monto: 170000, metodoPago: "TRANSFERENCIA", referencia: null, registradoPorId: "u1" },
    });
    expect(tx.cuentaPorPagar.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { estado: "PAGADA" } });
  });

  it("abonar exactamente el saldo compara como decimal exacto (852594.93)", async () => {
    db.cuentaPorPagar.findFirst.mockResolvedValue({ id: "c1", saldoPendiente: "852594.93" });
    await abonarCuentaPorPagarAction("c1", inicial, fd({ monto: "852594.93", metodoPago: "EFECTIVO" }));
    const arg = tx.cuentaPorPagar.updateMany.mock.calls[0]![0];
    expect(typeof arg.where.saldoPendiente.gte).toBe("object");
    expect(String(arg.where.saldoPendiente.gte)).toBe("852594.93");
  });

  it("un abono parcial no marca la cuenta como pagada", async () => {
    tx.cuentaPorPagar.findUniqueOrThrow.mockResolvedValue({ saldoPendiente: "70000" });

    const r = await abonarCuentaPorPagarAction(
      "c1",
      inicial,
      fd({ monto: "100000", metodoPago: "EFECTIVO", referencia: "  REC-12  " }),
    );

    expect(r).toMatchObject({ success: true, montoRegistrado: 100000, saldoRestante: 70000, cuentaId: "c1" });
    expect(tx.pagoProveedor.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ referencia: "REC-12" }),
    });
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
    mockRequirePermiso.mockResolvedValue(SESION);
    db.cuentaPorPagar.count.mockResolvedValue(0);
    db.cajaSesion.findFirst.mockResolvedValue({ id: "s1", abiertaAt: new Date() });
  });

  it("solo ADMIN y RECEPCION ven lo que el taller debe (hallazgo B6)", async () => {
    db.cuentaPorPagar.findMany.mockResolvedValue([]);

    await getCuentasPorPagar();

    expect(mockRequirePermiso).toHaveBeenCalledWith("cuentasPorPagar.usar");
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
        entrada: { items: [] },
        pagos: [],
      },
      {
        id: "c2",
        total: "50000",
        saldoPendiente: "50000",
        fecha: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
        entradaId: "e2",
        proveedor: { id: "p2", nombre: "Frenos SA" },
        entrada: { items: [] },
        pagos: [],
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

  it("cada fila trae lo pagado, el resumen de la entrada y los abonos con quién los registró", async () => {
    const creado = new Date("2026-10-16T18:58:00Z");
    db.cuentaPorPagar.findMany.mockResolvedValue([
      {
        id: "c1",
        total: "5073557",
        saldoPendiente: "4873557",
        fecha: new Date(),
        entradaId: "e1",
        proveedor: { id: "p1", nombre: "Pirelli" },
        entrada: {
          items: [
            { repuestoId: "r1", cantidad: 20, repuesto: { nombre: "Batería NGK" } },
            { repuestoId: "r2", cantidad: 6, repuesto: { nombre: "Aceite 5W-30" } },
            { repuestoId: "r3", cantidad: 1, repuesto: { nombre: "Filtro" } },
          ],
        },
        pagos: [
          {
            id: "pg1",
            monto: "200000",
            metodoPago: "TRANSFERENCIA",
            referencia: "004581233",
            createdAt: creado,
            registradoPor: { nombre: "Admin Dev" },
          },
        ],
      },
    ]);

    const { proveedores, pagadas } = await getCuentasPorPagar();

    const fila = proveedores[0]!.cuentas[0]!;
    expect(fila.pagado).toBe(200000);
    expect(fila.entrada).toEqual({ id: "e1", referencias: 3, resumen: "Batería NGK ×20, Aceite 5W-30 ×6 y 1 más" });
    expect(fila.pagos).toEqual([
      {
        id: "pg1",
        monto: 200000,
        metodoPago: "TRANSFERENCIA",
        referencia: "004581233",
        registradoPor: "Admin Dev",
        createdAt: creado,
      },
    ]);
    // Sin pedir la pestaña Pagadas no se leen sus filas, solo el conteo.
    expect(pagadas).toBeNull();
    expect(db.cuentaPorPagar.findMany).toHaveBeenCalledTimes(1);
  });

  it("Pagadas: cuentas saldadas de la sede con algún abono en los últimos 30 días", async () => {
    db.cuentaPorPagar.findMany.mockResolvedValue([]);
    db.cuentaPorPagar.count.mockResolvedValue(1);

    const datos = await getCuentasPorPagar({ filtro: "pagadas" });

    expect(datos.pagadas).toEqual([]);
    expect(datos.conteoPagadas).toBe(1);
    const consulta = db.cuentaPorPagar.findMany.mock.calls[1]![0] as { where: Record<string, unknown> };
    expect(consulta.where).toMatchObject({
      estado: "PAGADA",
      entrada: { bodega: { sedeId: "sede-1" } },
      pagos: { some: { createdAt: { gte: expect.any(Date) } } },
    });
  });

  it("una cuenta recién saldada (?abonada=) sigue en Pendientes hasta recargar", async () => {
    db.cuentaPorPagar.findMany.mockResolvedValue([]);

    await getCuentasPorPagar({ abonadas: ["c9"] });

    expect(db.cuentaPorPagar.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { entrada: { bodega: { sedeId: "sede-1" } }, OR: [{ estado: "PENDIENTE" }, { id: { in: ["c9"] } }] },
      }),
    );
  });

  it("dice si la caja está cerrada para avisar antes de pagar en efectivo", async () => {
    db.cuentaPorPagar.findMany.mockResolvedValue([]);
    db.cajaSesion.findFirst.mockResolvedValue(null);

    expect((await getCuentasPorPagar()).cajaAbierta).toBe(false);
  });
});

describe("abonarProveedorAction", () => {
  const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
  // Saldos que deja cada guarda, por cuenta (lo que lee `findUniqueOrThrow` después de descontar).
  const saldosDespues: Record<string, string> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermiso.mockResolvedValue(SESION);
    db.cajaSesion.findFirst.mockResolvedValue({ id: "s1", abiertaAt: new Date() });
    tx.cuentaPorPagar.findMany.mockResolvedValue([
      { id: "g1", fecha: dia("2026-08-07"), saldoPendiente: "3948632" },
      { id: "g2", fecha: dia("2026-09-27"), saldoPendiente: "4029365" },
      { id: "g3", fecha: dia("2026-10-06"), saldoPendiente: "1815989" },
    ]);
    tx.cuentaPorPagar.updateMany.mockResolvedValue({ count: 1 });
    Object.assign(saldosDespues, { g1: "0", g2: "2977997", g3: "1815989" });
    tx.cuentaPorPagar.findUniqueOrThrow.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      saldoPendiente: saldosDespues[where.id],
    }));
    tx.pagoProveedor.create.mockResolvedValue({});
  });

  it("reparte de la más vieja a la más nueva: un abono por cuenta tocada y salda la primera", async () => {
    const r = await abonarProveedorAction(
      "prov-gates",
      { error: null, success: false },
      fd({ monto: "5000000", metodoPago: "TRANSFERENCIA", referencia: " 004581233 " }),
    );

    expect(r).toEqual({
      error: null,
      success: true,
      montoRegistrado: 5000000,
      cuentaIds: ["g1", "g2"],
      saldoRestante: 4793986,
    });
    expect(mockRequirePermiso).toHaveBeenCalledWith("cuentasPorPagar.usar");
    // Solo lo pendiente del proveedor en la sede activa, de la más vieja a la más nueva.
    expect(tx.cuentaPorPagar.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          proveedorId: "prov-gates",
          estado: "PENDIENTE",
          saldoPendiente: { gt: 0 },
          entrada: { bodega: { sedeId: "sede-1" } },
        },
        orderBy: [{ fecha: "asc" }, { id: "asc" }],
      }),
    );
    expect(tx.cuentaPorPagar.updateMany.mock.calls).toEqual([
      [{ where: { id: "g1", saldoPendiente: { gte: montoExacto(3948632) } }, data: { saldoPendiente: { decrement: montoExacto(3948632) } } }],
      [{ where: { id: "g2", saldoPendiente: { gte: montoExacto(1051368) } }, data: { saldoPendiente: { decrement: montoExacto(1051368) } } }],
    ]);
    expect(tx.pagoProveedor.create.mock.calls.map(([arg]) => arg.data)).toEqual([
      { cuentaId: "g1", monto: 3948632, metodoPago: "TRANSFERENCIA", referencia: "004581233", registradoPorId: "u1" },
      { cuentaId: "g2", monto: 1051368, metodoPago: "TRANSFERENCIA", referencia: "004581233", registradoPorId: "u1" },
    ]);
    // Solo la que llegó a cero queda pagada.
    expect(tx.cuentaPorPagar.update).toHaveBeenCalledTimes(1);
    expect(tx.cuentaPorPagar.update).toHaveBeenCalledWith({ where: { id: "g1" }, data: { estado: "PAGADA" } });
  });

  it("el reparto compara cada porción como decimal exacto (852594.93)", async () => {
    tx.cuentaPorPagar.findMany.mockResolvedValue([{ id: "g1", fecha: dia("2026-08-07"), saldoPendiente: "852594.93" }]);
    await abonarProveedorAction("prov-gates", { error: null, success: false }, fd({ monto: "852594.93", metodoPago: "EFECTIVO" }));
    const arg = tx.cuentaPorPagar.updateMany.mock.calls[0]![0];
    expect(typeof arg.where.saldoPendiente.gte).toBe("object");
    expect(String(arg.where.saldoPendiente.gte)).toBe("852594.93");
  });

  it("no acepta más de lo que se le debe al proveedor", async () => {
    const r = await abonarProveedorAction(
      "prov-gates",
      { error: null, success: false },
      fd({ monto: "9793987", metodoPago: "TRANSFERENCIA" }),
    );

    expect(r.error).toBe("El monto no puede ser mayor a lo que se le debe al proveedor");
    expect(tx.pagoProveedor.create).not.toHaveBeenCalled();
  });

  it("si una guarda falla (alguien abonó a la vez) se deshace todo con un aviso", async () => {
    tx.cuentaPorPagar.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    const r = await abonarProveedorAction(
      "prov-gates",
      { error: null, success: false },
      fd({ monto: "5000000", metodoPago: "TRANSFERENCIA" }),
    );

    expect(r.success).toBe(false);
    expect(r.error).toContain("Alguien acaba de abonar");
  });

  it("sin entradas por pagar en la sede no registra nada", async () => {
    tx.cuentaPorPagar.findMany.mockResolvedValue([]);

    const r = await abonarProveedorAction(
      "prov-otro",
      { error: null, success: false },
      fd({ monto: "1000", metodoPago: "TARJETA" }),
    );

    expect(r.error).toBe("Ese proveedor no tiene entradas por pagar en esta sede");
  });

  it("en efectivo revisa la caja una sola vez antes de tocar las cuentas", async () => {
    db.cajaSesion.findFirst.mockResolvedValue(null);

    const r = await abonarProveedorAction(
      "prov-gates",
      { error: null, success: false },
      fd({ monto: "5000000", metodoPago: "EFECTIVO" }),
    );

    expect(r.error).toBe("Abre la caja antes de pagar en efectivo a un proveedor");
    expect(db.cajaSesion.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.cuentaPorPagar.findMany).not.toHaveBeenCalled();
  });

  it("valida el monto y el método antes de leer nada", async () => {
    const r = await abonarProveedorAction("prov-gates", { error: null, success: false }, fd({ monto: "" }));

    expect(r.error).toBe("El monto es obligatorio");
    expect(mockRequirePermiso).not.toHaveBeenCalled();
  });
});
