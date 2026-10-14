import { beforeEach, describe, expect, it, vi } from "vitest";

const opcionesTaller = { exigirActaFirmada: false, usarControlCaja: true };

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({ requireRole: (...args: unknown[]) => mockRequireRole(...args) }));

const tx = {
  repuesto: { updateMany: vi.fn() },
  ventaMostrador: { create: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
  pagoVentaMostrador: { create: vi.fn() },
};
const db = {
  cajaSesion: { findFirst: vi.fn() },
  // Control de caja encendido: la regla del efectivo aplica (fase de consolidación, D3).
  configuracionTaller: { findUnique: async () => opcionesTaller },
  cliente: { findFirst: vi.fn() },
  repuesto: { findMany: vi.fn() },
  ventaMostrador: { findFirst: vi.fn() },
  $transaction: (fn: (cliente: typeof tx) => unknown) => fn(tx),
};
vi.mock("@/lib/db/tenant-client", () => ({ getTenantDb: () => db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { cobrarVentaMostradorAction, crearVentaMostradorAction } from "./venta-mostrador-actions";

const SESION = { user: { id: "u1", role: "RECEPCION", tenantSchema: "taller", sedeActivaId: "sede-1" } };
const inicial = { error: null, success: false };

function fd(campos: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [clave, valor] of Object.entries(campos)) formData.set(clave, valor);
  return formData;
}

const LINEA = { repuestoId: "r1", descripcion: "Filtro de aceite", cantidad: 2, precioUnitario: 25000 };

function venta(cambios: Record<string, string> = {}) {
  return fd({
    lineas: JSON.stringify([LINEA]),
    descuento: "",
    metodoPago: "EFECTIVO",
    cobrarTodo: "true",
    ...cambios,
  });
}

describe("crearVentaMostradorAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(SESION);
    db.cajaSesion.findFirst.mockResolvedValue({ id: "c1", abiertaAt: new Date("2026-10-17T13:00:00Z") });
    db.cliente.findFirst.mockResolvedValue({ id: "cli1" });
    // Precio y nombre del repuesto salen de aquí, no del formulario (fase de consolidación, D6).
    db.repuesto.findMany.mockResolvedValue([{ id: "r1", nombre: "Filtro de aceite", precioVenta: "25000" }]);
    tx.repuesto.updateMany.mockResolvedValue({ count: 1 });
    tx.ventaMostrador.create.mockResolvedValue({ id: "v1", numero: 7 });
    tx.pagoVentaMostrador.create.mockResolvedValue({});
  });

  it("vende, descuenta stock con guarda y registra el cobro", async () => {
    const r = await crearVentaMostradorAction(inicial, venta());

    expect(r).toEqual({ error: null, success: true, numero: 7 });
    // Vender es cobrar: el técnico no usa el mostrador (D6).
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
    expect(tx.repuesto.updateMany).toHaveBeenCalledWith({
      where: { id: "r1", stockActual: { gte: 2 } },
      data: { stockActual: { decrement: 2 } },
    });
    const creada = tx.ventaMostrador.create.mock.calls[0]![0].data;
    expect(creada).toMatchObject({ sedeId: "sede-1", estado: "PAGADA", creadoPorId: "u1" });
    expect(Number(creada.saldoPendiente)).toBe(0);
    expect(Number(creada.total)).toBe(59500); // 50.000 + 19% de IVA
    expect(tx.pagoVentaMostrador.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ ventaId: "v1", monto: 59500, metodoPago: "EFECTIVO", registradoPorId: "u1" }),
    });
  });

  it("ignora el precio y la descripción que manda el navegador para un repuesto (hallazgo M2)", async () => {
    const manipulada = { repuestoId: "r1", descripcion: "Tornillo", cantidad: 2, precioUnitario: 1 };

    const r = await crearVentaMostradorAction(inicial, venta({ lineas: JSON.stringify([manipulada]) }));

    expect(r.error).toBeNull();
    const creada = tx.ventaMostrador.create.mock.calls[0]![0].data;
    expect(creada.items.create).toEqual([
      { repuestoId: "r1", descripcion: "Filtro de aceite", cantidad: 2, precioUnitario: 25000 },
    ]);
    expect(Number(creada.total)).toBe(59500);
    expect(db.repuesto.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["r1"] }, bodega: { sedeId: "sede-1" } },
      select: { id: true, nombre: true, precioVenta: true },
    });
  });

  it("una línea libre conserva el precio y la descripción que se escribieron", async () => {
    const libre = { descripcion: "Lavado de motor", cantidad: 1, precioUnitario: 40000 };

    await crearVentaMostradorAction(inicial, venta({ lineas: JSON.stringify([libre]) }));

    expect(tx.ventaMostrador.create.mock.calls[0]![0].data.items.create).toEqual([
      { repuestoId: null, descripcion: "Lavado de motor", cantidad: 1, precioUnitario: 40000 },
    ]);
  });

  it("el descuento se compara con el subtotal a precios del servidor", async () => {
    // En el navegador el subtotal "era" 2 × 900.000; con el precio real es 50.000.
    const inflada = { ...LINEA, precioUnitario: 900000 };

    const r = await crearVentaMostradorAction(
      inicial,
      venta({ lineas: JSON.stringify([inflada]), descuento: "100000" }),
    );

    expect(r.error).toBe("El descuento no puede ser mayor que el subtotal");
    expect(tx.ventaMostrador.create).not.toHaveBeenCalled();
  });

  it("agrega las líneas repetidas del mismo repuesto antes de tocar el stock", async () => {
    await crearVentaMostradorAction(
      inicial,
      venta({ lineas: JSON.stringify([LINEA, { ...LINEA, cantidad: 3 }]) }),
    );

    expect(tx.repuesto.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.repuesto.updateMany).toHaveBeenCalledWith({
      where: { id: "r1", stockActual: { gte: 5 } },
      data: { stockActual: { decrement: 5 } },
    });
  });

  it("una línea libre no toca el stock", async () => {
    await crearVentaMostradorAction(
      inicial,
      venta({ lineas: JSON.stringify([{ descripcion: "Mano de obra suelta", cantidad: 1, precioUnitario: 40000 }]) }),
    );

    expect(tx.repuesto.updateMany).not.toHaveBeenCalled();
  });

  it("sin stock suficiente no crea la venta y dice cuál falta", async () => {
    tx.repuesto.updateMany.mockResolvedValue({ count: 0 });

    const r = await crearVentaMostradorAction(inicial, venta());

    expect(r).toEqual({ error: 'No hay stock suficiente de "Filtro de aceite"', success: false });
    expect(tx.ventaMostrador.create).not.toHaveBeenCalled();
  });

  it("exige caja abierta", async () => {
    db.cajaSesion.findFirst.mockResolvedValue(null);

    const r = await crearVentaMostradorAction(inicial, venta());

    expect(r.error).toBe("Abre la caja antes de cobrar en efectivo en el mostrador");
    expect(tx.ventaMostrador.create).not.toHaveBeenCalled();
  });

  it("con la caja cerrada sí vende con tarjeta o a crédito (solo el efectivo la exige)", async () => {
    db.cajaSesion.findFirst.mockResolvedValue(null);

    expect((await crearVentaMostradorAction(inicial, venta({ metodoPago: "TARJETA" }))).error).toBeNull();
    expect(
      (await crearVentaMostradorAction(inicial, venta({ clienteId: "c1", cobrarTodo: "false" }))).error,
    ).toBeNull();
  });

  it("con el control de caja apagado vende en efectivo sin caja", async () => {
    db.cajaSesion.findFirst.mockResolvedValue(null);
    opcionesTaller.usarControlCaja = false;
    try {
      expect((await crearVentaMostradorAction(inicial, venta())).error).toBeNull();
    } finally {
      opcionesTaller.usarControlCaja = true;
    }
  });

  it("sin cliente identificado la venta tiene que quedar pagada", async () => {
    const r = await crearVentaMostradorAction(inicial, venta({ cobrarTodo: "" }));

    expect(r.error).toBe("Sin cliente identificado, la venta tiene que quedar pagada");
    expect(tx.ventaMostrador.create).not.toHaveBeenCalled();
  });

  it("con cliente puede quedar a crédito, sin cobro y con saldo", async () => {
    const r = await crearVentaMostradorAction(inicial, venta({ clienteId: "cli1", cobrarTodo: "" }));

    expect(r.success).toBe(true);
    const creada = tx.ventaMostrador.create.mock.calls[0]![0].data;
    expect(creada).toMatchObject({ clienteId: "cli1", estado: "PENDIENTE" });
    expect(Number(creada.saldoPendiente)).toBe(59500);
    expect(tx.pagoVentaMostrador.create).not.toHaveBeenCalled();
  });

  it("un cliente que no existe se rechaza", async () => {
    db.cliente.findFirst.mockResolvedValue(null);

    const r = await crearVentaMostradorAction(inicial, venta({ clienteId: "nope" }));

    expect(r.error).toBe("Cliente no encontrado");
  });

  it("rechaza un descuento mayor que el subtotal (daría un total negativo)", async () => {
    const r = await crearVentaMostradorAction(inicial, venta({ descuento: "60000" }));

    expect(r).toEqual({ error: "El descuento no puede ser mayor que el subtotal", success: false });
    expect(tx.ventaMostrador.create).not.toHaveBeenCalled();
  });

  it("un repuesto de otra sede se rechaza antes de tocar el stock", async () => {
    db.repuesto.findMany.mockResolvedValue([]);

    const r = await crearVentaMostradorAction(inicial, venta());

    expect(r).toEqual({ error: "Alguno de los repuestos no pertenece a tu sede activa", success: false });
    expect(db.repuesto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ["r1"] } }) }),
    );
    expect(tx.ventaMostrador.create).not.toHaveBeenCalled();
  });

  it("rechaza líneas mal formadas sin tocar la base", async () => {
    const r = await crearVentaMostradorAction(inicial, fd({ lineas: "no es json", metodoPago: "EFECTIVO" }));

    expect(r.error).toBe("No se pudieron leer los productos de la venta");
    expect(db.cajaSesion.findFirst).not.toHaveBeenCalled();
  });
});

describe("cobrarVentaMostradorAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(SESION);
    db.cajaSesion.findFirst.mockResolvedValue({ id: "c1", abiertaAt: new Date("2026-10-17T13:00:00Z") });
    db.ventaMostrador.findFirst.mockResolvedValue({ id: "v1", numero: 7, saldoPendiente: "59500" });
    tx.ventaMostrador.updateMany.mockResolvedValue({ count: 1 });
    tx.ventaMostrador.findUniqueOrThrow.mockResolvedValue({ saldoPendiente: "0" });
    tx.pagoVentaMostrador.create.mockResolvedValue({});
  });

  it("cobra con guarda y marca la venta como pagada al saldar", async () => {
    const r = await cobrarVentaMostradorAction("v1", inicial, fd({ monto: "59500", metodoPago: "TARJETA" }));

    expect(r).toEqual({ error: null, success: true, numero: 7 });
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
    expect(tx.ventaMostrador.updateMany).toHaveBeenCalledWith({
      where: { id: "v1", saldoPendiente: { gte: 59500 } },
      data: { saldoPendiente: { decrement: 59500 } },
    });
    expect(tx.pagoVentaMostrador.create).toHaveBeenCalled();
    expect(tx.ventaMostrador.update).toHaveBeenCalledWith({ where: { id: "v1" }, data: { estado: "PAGADA" } });
  });

  it("un abono parcial no marca la venta como pagada", async () => {
    tx.ventaMostrador.findUniqueOrThrow.mockResolvedValue({ saldoPendiente: "29500" });

    const r = await cobrarVentaMostradorAction("v1", inicial, fd({ monto: "30000", metodoPago: "EFECTIVO" }));

    expect(r.success).toBe(true);
    expect(tx.ventaMostrador.update).not.toHaveBeenCalled();
  });

  it("si alguien cobró antes o el saldo cambió, avisa y no registra nada", async () => {
    tx.ventaMostrador.updateMany.mockResolvedValue({ count: 0 });

    const r = await cobrarVentaMostradorAction("v1", inicial, fd({ monto: "59500", metodoPago: "EFECTIVO" }));

    expect(r.error).toContain("alguien acaba de cobrar");
    expect(tx.pagoVentaMostrador.create).not.toHaveBeenCalled();
  });

  it("no cobra una venta ya pagada ni una de otra sede", async () => {
    db.ventaMostrador.findFirst.mockResolvedValue({ id: "v1", numero: 7, saldoPendiente: "0" });
    expect((await cobrarVentaMostradorAction("v1", inicial, fd({ monto: "100", metodoPago: "EFECTIVO" }))).error).toBe(
      "Esa venta ya está pagada",
    );

    db.ventaMostrador.findFirst.mockResolvedValue(null);
    expect((await cobrarVentaMostradorAction("ajena", inicial, fd({ monto: "100", metodoPago: "EFECTIVO" }))).error).toBe(
      "Venta no encontrada",
    );
    expect(db.ventaMostrador.findFirst).toHaveBeenCalledWith({
      where: { id: "ajena", sedeId: "sede-1" },
      select: { id: true, numero: true, saldoPendiente: true },
    });
  });

  it("exige caja abierta también para cobrar", async () => {
    db.cajaSesion.findFirst.mockResolvedValue(null);

    const r = await cobrarVentaMostradorAction("v1", inicial, fd({ monto: "1000", metodoPago: "EFECTIVO" }));

    expect(r.error).toBe("Abre la caja antes de cobrar en efectivo en el mostrador");
    expect(tx.ventaMostrador.updateMany).not.toHaveBeenCalled();

    const conTarjeta = await cobrarVentaMostradorAction("v1", inicial, fd({ monto: "1000", metodoPago: "TARJETA" }));
    expect(conTarjeta.error).toBeNull();
  });

  it("rechaza un monto vacío o cero sin tocar la base", async () => {
    expect((await cobrarVentaMostradorAction("v1", inicial, fd({ monto: "", metodoPago: "EFECTIVO" }))).error).toBe(
      "El monto es obligatorio",
    );
    expect((await cobrarVentaMostradorAction("v1", inicial, fd({ monto: "0", metodoPago: "EFECTIVO" }))).error).toBe(
      "El monto debe ser mayor que cero",
    );
    expect(db.ventaMostrador.findFirst).not.toHaveBeenCalled();
  });
});
