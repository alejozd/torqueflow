import { beforeEach, describe, expect, it, vi } from "vitest";

const opcionesTaller = { exigirActaFirmada: false, usarControlCaja: true, descuentoMaxRecepcion: 10 };

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
  cliente: { findFirst: vi.fn(), findMany: vi.fn() },
  repuesto: { findMany: vi.fn() },
  itemOrden: { groupBy: vi.fn() },
  ventaMostrador: { findFirst: vi.fn(), groupBy: vi.fn() },
  $transaction: (fn: (cliente: typeof tx) => unknown) => fn(tx),
};
vi.mock("@/lib/db/tenant-client", () => ({ getTenantDb: () => db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  buscarClientesMostradorAction,
  buscarParaMostradorAction,
  cobrarVentaMostradorAction, crearVentaMostradorAction,
} from "./venta-mostrador-actions";

const SESION = { user: { id: "u1", role: "RECEPCION", tenantSchema: "taller", sedeActivaId: "sede-1" } };
const inicial = { error: null, success: false };

function fd(campos: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [clave, valor] of Object.entries(campos)) formData.set(clave, valor);
  return formData;
}

const LINEA = { repuestoId: "r1", descripcion: "Filtro de aceite", cantidad: 2, precioUnitario: 25000 };

const PAGO_TOTAL = [{ metodoPago: "EFECTIVO", monto: 59500 }];

function venta(cambios: Record<string, string> = {}) {
  return fd({
    lineas: JSON.stringify([LINEA]),
    descuento: "",
    pagos: JSON.stringify(PAGO_TOTAL),
    ...cambios,
  });
}

const aCredito = { pagos: "[]" };

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

    expect(r).toEqual({
      error: null,
      success: true,
      numero: 7,
      ventaId: "v1",
      total: 59500,
      pagos: [{ metodoPago: "EFECTIVO", monto: 59500 }],
      vueltas: 0,
    });
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

    await crearVentaMostradorAction(inicial, venta({ lineas: JSON.stringify([libre]), pagos: JSON.stringify([{ metodoPago: "EFECTIVO", monto: 47600 }]) }));

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
      venta({ lineas: JSON.stringify([LINEA, { ...LINEA, cantidad: 3 }]), clienteId: "cli1" }),
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
      venta({ lineas: JSON.stringify([{ descripcion: "Mano de obra suelta", cantidad: 1, precioUnitario: 40000 }]), pagos: "[]", clienteId: "cli1" }),
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

    expect((await crearVentaMostradorAction(inicial, venta({ pagos: JSON.stringify([{ metodoPago: "TARJETA", monto: 59500 }]) }))).error).toBeNull();
    expect(
      (await crearVentaMostradorAction(inicial, venta({ clienteId: "c1", ...aCredito }))).error,
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
    const r = await crearVentaMostradorAction(inicial, venta(aCredito));

    expect(r.error).toBe("Para dejar saldo pendiente elige un cliente registrado");
    expect(tx.ventaMostrador.create).not.toHaveBeenCalled();
  });

  it("con cliente puede quedar a crédito, sin cobro y con saldo", async () => {
    const r = await crearVentaMostradorAction(inicial, venta({ clienteId: "cli1", ...aCredito }));

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

  it("pago mixto crea un pago por método y deja la venta pagada", async () => {
    const pagos = [
      { metodoPago: "EFECTIVO", monto: 30000 },
      { metodoPago: "TARJETA", monto: 29500, referencia: "A1" },
    ];

    const r = await crearVentaMostradorAction(inicial, venta({ pagos: JSON.stringify(pagos) }));

    expect(r.success).toBe(true);
    expect(tx.pagoVentaMostrador.create).toHaveBeenCalledTimes(2);
    expect(tx.pagoVentaMostrador.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ metodoPago: "TARJETA", monto: 29500, referencia: "A1" }),
    });
    const creada = tx.ventaMostrador.create.mock.calls[0]![0].data;
    expect(creada).toMatchObject({ estado: "PAGADA", saldoPendiente: 0 });
  });

  it("pago parcial con cliente deja saldo pendiente; sin cliente se rechaza", async () => {
    const parcial = JSON.stringify([{ metodoPago: "TARJETA", monto: 20000 }]);

    const r = await crearVentaMostradorAction(inicial, venta({ pagos: parcial, clienteId: "cli1" }));
    expect(r.success).toBe(true);
    expect(tx.ventaMostrador.create.mock.calls[0]![0].data).toMatchObject({ estado: "PENDIENTE", saldoPendiente: 39500 });

    tx.ventaMostrador.create.mockClear();
    const sin = await crearVentaMostradorAction(inicial, venta({ pagos: parcial }));
    expect(sin.error).toBe("Para dejar saldo pendiente elige un cliente registrado");
    expect(tx.ventaMostrador.create).not.toHaveBeenCalled();
  });

  it("rechaza que los pagos sumen más que el total sin efectivo que lo cubra", async () => {
    const r = await crearVentaMostradorAction(
      inicial,
      venta({ pagos: JSON.stringify([{ metodoPago: "TARJETA", monto: 70000 }]) }),
    );
    expect(r.error).toBe("Los pagos suman más que el total");
  });

  it("las vueltas salen de lo recibido en efectivo y el pago queda neto", async () => {
    const pagos = [
      { metodoPago: "TARJETA", monto: 40000 },
      { metodoPago: "EFECTIVO", monto: 19500 },
    ];

    const r = await crearVentaMostradorAction(
      inicial,
      venta({ pagos: JSON.stringify(pagos), recibidoEfectivo: "30000" }),
    );

    expect(r.vueltas).toBe(10500);
    expect(tx.pagoVentaMostrador.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ metodoPago: "EFECTIVO", monto: 19500 }),
    });
  });

  it("lo recibido menor que el pago en efectivo se rechaza", async () => {
    const r = await crearVentaMostradorAction(inicial, venta({ recibidoEfectivo: "1000" }));
    expect(r.error).toBe("Lo recibido en efectivo es menor que el pago en efectivo");
    expect(tx.ventaMostrador.create).not.toHaveBeenCalled();
  });

  it("RECEPCION no puede pasar del tope de descuento; ADMIN sí", async () => {
    // 10 % de 50.000 = 5.000; 6.000 es 12 %. Total = (50.000 - 6.000) * 1,19 = 52.360.
    const pagos = JSON.stringify([{ metodoPago: "TARJETA", monto: 52360 }]);

    const rechazada = await crearVentaMostradorAction(inicial, venta({ descuento: "6000", pagos }));
    expect(rechazada.error).toBe("Tu descuento máximo es 10 %");
    expect(tx.ventaMostrador.create).not.toHaveBeenCalled();

    mockRequireRole.mockResolvedValue({ user: { ...SESION.user, role: "ADMIN" } });
    const admin = await crearVentaMostradorAction(inicial, venta({ descuento: "6000", pagos }));
    expect(admin.error).toBeNull();
  });

  it("RECEPCION puede dar el descuento justo en el tope", async () => {
    const pagos = JSON.stringify([{ metodoPago: "TARJETA", monto: 53550 }]);
    const r = await crearVentaMostradorAction(inicial, venta({ descuento: "5000", pagos }));
    expect(r.error).toBeNull();
  });

  it("solo exige caja si hay un pago en efectivo dentro del mixto", async () => {
    db.cajaSesion.findFirst.mockResolvedValue(null);
    const sinEfectivo = JSON.stringify([
      { metodoPago: "TARJETA", monto: 30000 },
      { metodoPago: "TRANSFERENCIA", monto: 29500 },
    ]);
    expect((await crearVentaMostradorAction(inicial, venta({ pagos: sinEfectivo }))).error).toBeNull();

    const conEfectivo = JSON.stringify([
      { metodoPago: "TARJETA", monto: 30000 },
      { metodoPago: "EFECTIVO", monto: 29500 },
    ]);
    expect((await crearVentaMostradorAction(inicial, venta({ pagos: conEfectivo }))).error).toBe(
      "Abre la caja antes de cobrar en efectivo en el mostrador",
    );
  });

  it("rechaza líneas mal formadas sin tocar la base", async () => {
    const r = await crearVentaMostradorAction(inicial, fd({ lineas: "no es json" }));

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

describe("buscarParaMostradorAction", () => {
  const fila = (id: string, codigo: string, nombre: string, stockActual: number) => ({
    id,
    codigo,
    nombre,
    precioVenta: "25000",
    stockActual,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(SESION);
    db.itemOrden.groupBy.mockResolvedValue([{ repuestoId: "r1", _sum: { cantidad: 3 } }]);
  });

  it("solo ADMIN y RECEPCION pueden buscar", async () => {
    db.repuesto.findMany.mockResolvedValue([]);
    await buscarParaMostradorAction("filtro");

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
  });

  it("sin texto no consulta nada", async () => {
    expect(await buscarParaMostradorAction("   ")).toEqual([]);
    expect(db.repuesto.findMany).not.toHaveBeenCalled();
  });

  it("filtra por nombre o código sin distinguir mayúsculas, en la sede activa y con tope de 20", async () => {
    db.repuesto.findMany.mockResolvedValue([]);
    await buscarParaMostradorAction("  Filtro ");

    const consultas = db.repuesto.findMany.mock.calls.map(([arg]) => arg);
    const amplia = consultas.find((arg) => arg.take === 20);
    expect(amplia.where.OR).toEqual([
      { nombre: { contains: "Filtro", mode: "insensitive" } },
      { codigo: { contains: "Filtro", mode: "insensitive" } },
    ]);
    expect(JSON.stringify(amplia.where)).toContain("sede-1");
    expect(consultas.some((arg) => arg.where.codigo?.mode === "insensitive")).toBe(true);
  });

  it("calcula disponible como stock menos lo comprometido en órdenes abiertas, sin bajar de cero", async () => {
    db.repuesto.findMany.mockImplementation(async (arg: { take?: number }) =>
      arg.take === 20 ? [fila("r1", "FLT-1", "Filtro", 5), fila("r2", "FLT-2", "Filtro grande", 0)] : [],
    );
    const r = await buscarParaMostradorAction("filtro");

    expect(r).toEqual([
      { id: "r1", codigo: "FLT-1", nombre: "Filtro", precioVenta: 25000, stockActual: 5, disponible: 2 },
      { id: "r2", codigo: "FLT-2", nombre: "Filtro grande", precioVenta: 25000, stockActual: 0, disponible: 0 },
    ]);
  });

  it("el código exacto va primero con exacto: true y no se repite", async () => {
    const exacto = fila("r2", "FLT-2", "Filtro grande", 4);
    db.repuesto.findMany.mockImplementation(async (arg: { take?: number }) =>
      arg.take === 20 ? [fila("r1", "FLT-1", "Filtro", 5), exacto] : [exacto],
    );
    const r = await buscarParaMostradorAction("flt-2");

    expect(r.map((x) => x.id)).toEqual(["r2", "r1"]);
    expect(r[0].exacto).toBe(true);
    expect(r[1].exacto).toBeUndefined();
  });

  it("nunca devuelve más de 20", async () => {
    const muchos = Array.from({ length: 20 }, (_, i) => fila("m" + i, "C" + i, "Filtro " + i, 1));
    const exacto = fila("x", "FLT", "Otro", 1);
    db.repuesto.findMany.mockImplementation(async (arg: { take?: number }) => (arg.take === 20 ? muchos : [exacto]));
    const r = await buscarParaMostradorAction("flt");

    expect(r).toHaveLength(20);
    expect(r[0].id).toBe("x");
  });
});

describe("buscarClientesMostradorAction", () => {
  beforeEach(() => {
    mockRequireRole.mockResolvedValue(SESION);
    db.cliente.findMany.mockReset().mockResolvedValue([]);
    db.ventaMostrador.groupBy.mockReset().mockResolvedValue([]);
  });

  it("busca cada palabra en nombre, documento, teléfono o placa sin distinguir mayúsculas, con tope de 10", async () => {
    await buscarClientesMostradorAction("  ana jkt ");

    const args = db.cliente.findMany.mock.calls[0][0];
    expect(args.take).toBe(10);
    expect(args.where.AND).toHaveLength(2);
    expect(args.where.AND[0]).toEqual({
      OR: [
        { nombre: { contains: "ana", mode: "insensitive" } },
        { documento: { contains: "ana", mode: "insensitive" } },
        { telefono: { contains: "ana", mode: "insensitive" } },
        { vehiculos: { some: { placa: { contains: "ana", mode: "insensitive" } } } },
      ],
    });
    expect(args.where.AND[1].OR[3]).toEqual({ vehiculos: { some: { placa: { contains: "jkt", mode: "insensitive" } } } });
  });

  it("sin texto no consulta nada; solo ADMIN y RECEPCION", async () => {
    expect(await buscarClientesMostradorAction("   ")).toEqual([]);
    expect(db.cliente.findMany).not.toHaveBeenCalled();

    await buscarClientesMostradorAction("ana");
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
  });

  it("si no tiene permiso, falla antes de consultar", async () => {
    mockRequireRole.mockRejectedValue(new Error("No autorizado"));
    await expect(buscarClientesMostradorAction("ana")).rejects.toThrow("No autorizado");
    expect(db.cliente.findMany).not.toHaveBeenCalled();
  });

  it("devuelve el saldo pendiente del mostrador (solo ventas con saldo) y 0 si está al día", async () => {
    db.cliente.findMany.mockResolvedValue([
      { id: "c1", nombre: "Ana", documento: "123", telefono: "3001112233", vehiculos: [{ placa: "JKT482" }] },
      { id: "c2", nombre: "Beto", documento: null, telefono: null, vehiculos: [] },
    ]);
    db.ventaMostrador.groupBy.mockResolvedValue([{ clienteId: "c1", _sum: { saldoPendiente: "45000.00" } }]);

    const resultado = await buscarClientesMostradorAction("a");

    expect(db.ventaMostrador.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clienteId: { in: ["c1", "c2"] }, saldoPendiente: { gt: 0 } } }),
    );
    expect(resultado).toEqual([
      { id: "c1", nombre: "Ana", documento: "123", telefono: "3001112233", placas: ["JKT482"], saldoMostrador: 45000 },
      { id: "c2", nombre: "Beto", documento: null, telefono: null, placas: [], saldoMostrador: 0 },
    ]);
  });
});
