import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...a: unknown[]) => mockRequireRole(...a),
  requireSession: vi.fn(),
}));

const tx = {
  manoDeObra: { create: vi.fn() },
  itemOrden: { create: vi.fn() },
};

const db = {
  servicio: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  servicioRepuesto: { upsert: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  repuesto: { findFirst: vi.fn() },
  ordenTrabajo: { findFirst: vi.fn() },
  $transaction: (fn: (cliente: typeof tx) => unknown) => fn(tx),
};
vi.mock("@/lib/db/tenant-client", () => ({ getTenantDb: () => db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  actualizarCantidadRepuestoServicioAction,
  actualizarServicioAction,
  agregarRepuestoAServicioAction,
  aplicarServicioAOrdenAction,
  crearServicioAction,
  listServicios,
  quitarRepuestoDeServicioAction,
  toggleServicioActivoAction,
  type AplicarServicioFormState,
  type ServicioFormState,
  type ServicioRepuestoFormState,
} from "./servicio-actions";

const inicial: ServicioFormState = { error: null, success: false };
const inicialRepuesto: ServicioRepuestoFormState = { error: null, success: false, cantidad: null };
const inicialAplicar: AplicarServicioFormState = { error: null, success: false, agregados: null };
const ADMIN = { user: { id: "u1", role: "ADMIN", tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };
const TECNICO = { user: { id: "u2", role: "TECNICO", tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };

function fd(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [clave, valor] of Object.entries(campos)) f.set(clave, valor);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireRole.mockResolvedValue(ADMIN);
  db.servicio.findFirst.mockResolvedValue(null);
  db.servicio.findUnique.mockResolvedValue({ id: "s1", nombre: "Cambio de aceite", activo: true });
  db.repuesto.findFirst.mockResolvedValue({ id: "r1", nombre: "Filtro de aceite" });
  db.ordenTrabajo.findFirst.mockResolvedValue({ estado: "EN_PROCESO", factura: null, mecanicoId: "m1" });
  tx.manoDeObra.create.mockResolvedValue({});
  tx.itemOrden.create.mockResolvedValue({});
});

describe("listServicios", () => {
  it("vista de catálogo: solo ADMIN, kit completo y totalEstimado", async () => {
    db.servicio.findMany.mockResolvedValue([
      {
        id: "s1",
        nombre: "Cambio de aceite",
        descripcion: "Aceite y filtro",
        precioManoObra: 45000,
        activo: true,
        repuestos: [
          { repuestoId: "r1", cantidad: 1, repuesto: { codigo: "FA-1", nombre: "Filtro de aceite", precioVenta: 25000 } },
          { repuestoId: "r2", cantidad: 3, repuesto: { codigo: "AC-5", nombre: "Aceite 5W30", precioVenta: 3333.33 } },
        ],
      },
    ]);

    const r = await listServicios();

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
    expect(db.servicio.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, orderBy: { nombre: "asc" } }),
    );
    // 45000 + 25000 + 3 x 3333.33 -> roundMoney ajusta el error de coma flotante.
    expect(r[0]!.totalEstimado).toBe(79999.99);
    expect(r[0]!.repuestos.map((rep) => rep.cantidad)).toEqual([1, 3]);
    expect(r[0]!.precioManoObra).toBe(45000);
  });

  it("vista de aplicación: ADMIN/RECEPCION/TECNICO, solo activos y solo repuestos de la sede activa", async () => {
    db.servicio.findMany.mockResolvedValue([]);

    await listServicios({ soloActivos: true });

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION", "TECNICO"]);
    expect(db.servicio.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { activo: true },
        select: expect.objectContaining({
          repuestos: expect.objectContaining({
            where: { repuesto: { bodega: { sedeId: "sede-1" } } },
          }),
        }),
      }),
    );
  });

  it("redondea el total estimado de un kit sin mano de obra", async () => {
    db.servicio.findMany.mockResolvedValue([
      {
        id: "s2",
        nombre: "Kit pastillas",
        descripcion: null,
        precioManoObra: 0.01,
        activo: true,
        repuestos: [{ repuestoId: "r3", cantidad: 3, repuesto: { codigo: "PA-9", nombre: "Pastillas", precioVenta: 3333.33 } }],
      },
    ]);

    const [kit] = await listServicios();

    expect(kit!.totalEstimado).toBe(10000);
  });
});

describe("crearServicioAction", () => {
  it("crea el servicio con textos recortados y precio numérico", async () => {
    db.servicio.create.mockResolvedValue({});

    const r = await crearServicioAction(
      inicial,
      fd({ nombre: "  Cambio de aceite ", descripcion: "  Aceite y filtro  ", precioManoObra: "45000" }),
    );

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
    expect(r).toEqual({ error: null, success: true });
    expect(db.servicio.create).toHaveBeenCalledWith({
      data: { nombre: "Cambio de aceite", descripcion: "Aceite y filtro", precioManoObra: 45000 },
    });
  });

  it("rechaza un nombre que ya existe sin distinguir mayúsculas", async () => {
    db.servicio.findFirst.mockResolvedValue({ id: "s9" });

    const r = await crearServicioAction(inicial, fd({ nombre: "cambio DE ACEITE", precioManoObra: "45000" }));

    expect(r).toEqual({ error: "Ya existe un servicio con ese nombre", success: false });
    expect(db.servicio.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ nombre: { equals: "cambio DE ACEITE", mode: "insensitive" } }) }),
    );
    expect(db.servicio.create).not.toHaveBeenCalled();
  });

  it("traduce el P2002 de la base a mensaje de duplicado", async () => {
    db.servicio.create.mockRejectedValue({ code: "P2002" });

    expect((await crearServicioAction(inicial, fd({ nombre: "Alineación", precioManoObra: "30000" }))).error).toBe(
      "Ya existe un servicio con ese nombre",
    );
  });

  it("exige ADMIN y valida antes de escribir", async () => {
    const r = await crearServicioAction(inicial, fd({ nombre: "  ", precioManoObra: "45000" }));

    expect(r.error).toBe("El nombre es obligatorio");
    expect(db.servicio.create).not.toHaveBeenCalled();
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
  });
});

describe("actualizarServicioAction", () => {
  it("actualiza sin marcar como duplicado su propio nombre", async () => {
    db.servicio.update.mockResolvedValue({});

    const r = await actualizarServicioAction("s1", inicial, fd({ nombre: "Cambio de aceite", precioManoObra: "50000" }));

    expect(r).toEqual({ error: null, success: true });
    expect(db.servicio.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ NOT: { id: "s1" } }) }),
    );
    expect(db.servicio.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { nombre: "Cambio de aceite", descripcion: undefined, precioManoObra: 50000 },
    });
  });

  it("rechaza el nombre de otro servicio", async () => {
    db.servicio.findFirst.mockResolvedValue({ id: "s2" });

    expect((await actualizarServicioAction("s1", inicial, fd({ nombre: "Alineación", precioManoObra: "1" }))).error).toBe(
      "Ya existe un servicio con ese nombre",
    );
    expect(db.servicio.update).not.toHaveBeenCalled();
  });
});

describe("toggleServicioActivoAction", () => {
  it("alterna activo", async () => {
    db.servicio.update.mockResolvedValue({});

    expect(await toggleServicioActivoAction("s1")).toEqual({ error: null });
    expect(db.servicio.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { activo: false } });
  });

  it("servicio inexistente", async () => {
    db.servicio.findUnique.mockResolvedValue(null);

    expect(await toggleServicioActivoAction("x")).toEqual({ error: "Servicio no encontrado" });
    expect(db.servicio.update).not.toHaveBeenCalled();
  });
});

describe("agregarRepuestoAServicioAction", () => {
  it("agrega un repuesto de la sede activa y devuelve la cantidad resultante", async () => {
    db.servicioRepuesto.upsert.mockResolvedValue({ cantidad: 2 });

    const r = await agregarRepuestoAServicioAction("s1", inicialRepuesto, fd({ repuestoId: " r1 ", cantidad: "2" }));

    expect(r).toEqual({ error: null, success: true, cantidad: 2 });
    expect(db.repuesto.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "r1", bodega: { sedeId: "sede-1" } } }),
    );
    expect(db.servicioRepuesto.upsert).toHaveBeenCalledWith({
      where: { servicioId_repuestoId: { servicioId: "s1", repuestoId: "r1" } },
      create: { servicioId: "s1", repuestoId: "r1", cantidad: 2 },
      update: { cantidad: { increment: 2 } },
      select: { cantidad: true },
    });
  });

  it("suma la cantidad si el repuesto ya está en el kit", async () => {
    db.servicioRepuesto.upsert.mockResolvedValue({ cantidad: 7 });

    const r = await agregarRepuestoAServicioAction("s1", inicialRepuesto, fd({ repuestoId: "r1", cantidad: "5" }));

    expect(r.cantidad).toBe(7);
    expect(db.servicioRepuesto.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { cantidad: { increment: 5 } } }),
    );
  });

  it("rechaza un repuesto de otra sede (no lo alcanza el scope de la sede activa)", async () => {
    db.repuesto.findFirst.mockResolvedValue(null);

    const r = await agregarRepuestoAServicioAction("s1", inicialRepuesto, fd({ repuestoId: "r-ajeno", cantidad: "1" }));

    expect(r).toEqual({ error: "Repuesto no encontrado en tu sede activa", success: false, cantidad: null });
    expect(db.servicioRepuesto.upsert).not.toHaveBeenCalled();
  });

  it("valida la cantidad antes de tocar la base", async () => {
    const r = await agregarRepuestoAServicioAction("s1", inicialRepuesto, fd({ repuestoId: "r1", cantidad: "0" }));

    expect(r.error).toBe("La cantidad mínima es 1");
    expect(db.repuesto.findFirst).not.toHaveBeenCalled();
    expect(db.servicioRepuesto.upsert).not.toHaveBeenCalled();
  });

  it("exige ADMIN", async () => {
    mockRequireRole.mockResolvedValue(TECNICO);

    await agregarRepuestoAServicioAction("s1", inicialRepuesto, fd({ repuestoId: "r1", cantidad: "1" }));

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
  });
});

describe("cantidad y quitar repuesto del kit", () => {
  it("actualiza la cantidad de un repuesto del kit", async () => {
    db.servicioRepuesto.updateMany.mockResolvedValue({ count: 1 });

    expect(await actualizarCantidadRepuestoServicioAction("s1", "r1", 4)).toEqual({ error: null });
    expect(db.servicioRepuesto.updateMany).toHaveBeenCalledWith({
      where: { servicioId: "s1", repuestoId: "r1" },
      data: { cantidad: 4 },
    });
  });

  it("rechaza una cantidad inválida sin escribir", async () => {
    const r = await actualizarCantidadRepuestoServicioAction("s1", "r1", 1.5);

    expect(r.error).toBe("La cantidad debe ser un número entero");
    expect(db.servicioRepuesto.updateMany).not.toHaveBeenCalled();
  });

  it("avisa si el repuesto no está en el kit", async () => {
    db.servicioRepuesto.updateMany.mockResolvedValue({ count: 0 });

    expect((await actualizarCantidadRepuestoServicioAction("s1", "r9", 4)).error).toBe(
      "El repuesto no está en el kit de este servicio",
    );
  });

  it("quita el repuesto del kit", async () => {
    db.servicioRepuesto.deleteMany.mockResolvedValue({ count: 1 });

    expect(await quitarRepuestoDeServicioAction("s1", "r1")).toEqual({ error: null });
    expect(db.servicioRepuesto.deleteMany).toHaveBeenCalledWith({ where: { servicioId: "s1", repuestoId: "r1" } });
  });

  it("quitar algo que no está en el kit devuelve error, no éxito", async () => {
    db.servicioRepuesto.deleteMany.mockResolvedValue({ count: 0 });

    expect((await quitarRepuestoDeServicioAction("s1", "r9")).error).toBe("El repuesto no está en el kit de este servicio");
  });
});

describe("aplicarServicioAOrdenAction", () => {
  function kit(repuestos: { cantidad: number; repuesto: { id: string; nombre: string; precioVenta: number } }[]) {
    db.servicio.findFirst.mockResolvedValue({
      activo: true,
      nombre: "Cambio de aceite",
      precioManoObra: 45000,
      repuestos,
    });
  }

  it("crea la mano de obra y los repuestos del kit en una transacción, heredando el mecánico de la orden", async () => {
    kit([
      { cantidad: 1, repuesto: { id: "r1", nombre: "Filtro de aceite", precioVenta: 25000 } },
      { cantidad: 2, repuesto: { id: "r2", nombre: "Aceite 5W30", precioVenta: 40000 } },
    ]);

    const r = await aplicarServicioAOrdenAction("o1", inicialAplicar, fd({ servicioId: " s1 " }));

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION", "TECNICO"]);
    expect(db.ordenTrabajo.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "o1", sedeId: "sede-1" } }),
    );
    // D10: el kit se resuelve solo con los repuestos de la sede activa.
    expect(db.servicio.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "s1" },
        select: expect.objectContaining({
          repuestos: expect.objectContaining({ where: { repuesto: { bodega: { sedeId: "sede-1" } } } }),
        }),
      }),
    );
    expect(tx.manoDeObra.create).toHaveBeenCalledWith({
      data: { ordenId: "o1", descripcion: "Cambio de aceite", valor: 45000, mecanicoId: "m1" },
    });
    // El precio sale del precioVenta actual de cada repuesto, no del kit.
    expect(tx.itemOrden.create).toHaveBeenNthCalledWith(1, {
      data: { ordenId: "o1", repuestoId: "r1", descripcion: "Filtro de aceite", cantidad: 1, precioUnitario: 25000 },
    });
    expect(tx.itemOrden.create).toHaveBeenNthCalledWith(2, {
      data: { ordenId: "o1", repuestoId: "r2", descripcion: "Aceite 5W30", cantidad: 2, precioUnitario: 40000 },
    });
    expect(r).toEqual({ error: null, success: true, agregados: { manoDeObra: true, repuestos: 2 } });
  });

  it("un kit con precio de mano de obra 0 solo agrega repuestos", async () => {
    db.servicio.findFirst.mockResolvedValue({
      activo: true,
      nombre: "Kit pastillas",
      precioManoObra: 0,
      repuestos: [{ cantidad: 1, repuesto: { id: "r1", nombre: "Pastillas", precioVenta: 90000 } }],
    });

    const r = await aplicarServicioAOrdenAction("o1", inicialAplicar, fd({ servicioId: "s1" }));

    expect(tx.manoDeObra.create).not.toHaveBeenCalled();
    expect(tx.itemOrden.create).toHaveBeenCalledTimes(1);
    expect(r.agregados).toEqual({ manoDeObra: false, repuestos: 1 });
  });

  it("un servicio sin repuestos en la sede activa solo agrega mano de obra", async () => {
    kit([]);

    const r = await aplicarServicioAOrdenAction("o1", inicialAplicar, fd({ servicioId: "s1" }));

    expect(tx.itemOrden.create).not.toHaveBeenCalled();
    expect(tx.manoDeObra.create).toHaveBeenCalledTimes(1);
    expect(r.agregados).toEqual({ manoDeObra: true, repuestos: 0 });
  });

  it("sin nada que agregar devuelve error y no escribe nada (D11)", async () => {
    db.servicio.findFirst.mockResolvedValue({ activo: true, nombre: "Kit vacío", precioManoObra: 0, repuestos: [] });

    const r = await aplicarServicioAOrdenAction("o1", inicialAplicar, fd({ servicioId: "s1" }));

    expect(r).toEqual({ error: "El servicio no tiene nada que agregar", success: false, agregados: null });
    expect(tx.manoDeObra.create).not.toHaveBeenCalled();
    expect(tx.itemOrden.create).not.toHaveBeenCalled();
  });

  it("rechaza un servicio inactivo", async () => {
    db.servicio.findFirst.mockResolvedValue({
      activo: false,
      nombre: "Cambio de aceite",
      precioManoObra: 45000,
      repuestos: [],
    });

    const r = await aplicarServicioAOrdenAction("o1", inicialAplicar, fd({ servicioId: "s1" }));

    expect(r.error).toBe("El servicio no está disponible");
    expect(tx.manoDeObra.create).not.toHaveBeenCalled();
  });

  it("rechaza una orden de otra sede o inexistente", async () => {
    db.ordenTrabajo.findFirst.mockResolvedValue(null);

    const r = await aplicarServicioAOrdenAction("o-ajena", inicialAplicar, fd({ servicioId: "s1" }));

    expect(r).toEqual({ error: "Orden no encontrada", success: false, agregados: null });
    expect(db.servicio.findFirst).not.toHaveBeenCalled();
  });

  it("rechaza una orden no mutable, con el mensaje del guard", async () => {
    db.ordenTrabajo.findFirst.mockResolvedValue({ estado: "ENTREGADA", factura: null, mecanicoId: null });

    const r = await aplicarServicioAOrdenAction("o1", inicialAplicar, fd({ servicioId: "s1" }));

    expect(r.error).toBe("No se puede modificar una orden en estado ENTREGADA.");
    expect(db.servicio.findFirst).not.toHaveBeenCalled();
  });

  it("rechaza una orden ya facturada", async () => {
    db.ordenTrabajo.findFirst.mockResolvedValue({ estado: "TERMINADA", factura: { id: "f1" }, mecanicoId: null });

    const r = await aplicarServicioAOrdenAction("o1", inicialAplicar, fd({ servicioId: "s1" }));

    expect(r.error).toBe("No se puede modificar una orden que ya tiene una factura generada.");
  });

  it("exige un servicio seleccionado antes de tocar la base", async () => {
    const r = await aplicarServicioAOrdenAction("o1", inicialAplicar, fd({ servicioId: "   " }));

    expect(r.error).toBe("Selecciona un servicio");
    expect(db.ordenTrabajo.findFirst).not.toHaveBeenCalled();
  });

  it("el error a mitad de la transacción se propaga como error de la action", async () => {
    kit([
      { cantidad: 1, repuesto: { id: "r1", nombre: "Filtro de aceite", precioVenta: 25000 } },
      { cantidad: 1, repuesto: { id: "r2", nombre: "Aceite 5W30", precioVenta: 40000 } },
    ]);
    tx.itemOrden.create.mockRejectedValueOnce(new Error("boom"));

    const r = await aplicarServicioAOrdenAction("o1", inicialAplicar, fd({ servicioId: "s1" }));

    expect(r.success).toBe(false);
    expect(r.error).toBe("No se pudo aplicar el servicio");
    expect(r.agregados).toBeNull();
  });
});
