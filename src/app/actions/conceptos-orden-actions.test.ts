import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequirePermiso = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requirePermiso: (...args: unknown[]) => mockRequirePermiso(...args),
  puede: (session: { user: { permisos: string[] } }, permiso: string) => session.user.permisos.includes(permiso),
}));

const db = {
  ordenTrabajo: { findFirst: vi.fn() },
  repuesto: { findFirst: vi.fn() },
  usuario: { findFirst: vi.fn() },
  itemOrden: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
  manoDeObra: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
  tarifaIva: {
    findMany: vi.fn(async () => [
      { porcentaje: "0", predeterminada: false },
      { porcentaje: "19", predeterminada: true },
    ]),
  },
  $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(db)),
};
vi.mock("@/lib/db/tenant-client", () => ({ getTenantDb: () => db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mockBuscarConceptos = vi.fn();
vi.mock("@/lib/conceptos/buscar", () => ({ buscarConceptos: (...args: unknown[]) => mockBuscarConceptos(...args) }));

import {
  actualizarConceptoOrdenAction,
  agregarLibreAOrdenAction,
  agregarRepuestoAOrdenAction,
  buscarParaOrdenAction,
  cambiarTipoConceptoOrdenAction,
  quitarKitOrdenAction,
} from "./conceptos-orden-actions";

const SESION = {
  user: {
    id: "u1",
    tenantSchema: "taller",
    sedeActivaId: "sede-1",
    permisos: ["ordenes.trabajar", "ordenes.quitar", "ordenes.verTodas"],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequirePermiso.mockResolvedValue(SESION);
  db.ordenTrabajo.findFirst.mockResolvedValue({ estado: "EN_PROCESO", factura: null, mecanicoId: null });
  db.repuesto.findFirst.mockResolvedValue({ id: "r1", nombre: "Filtro", precioVenta: "25000", ivaPct: "5.00" });
  db.itemOrden.findFirst.mockResolvedValue({ id: "i1", repuestoId: "r1", grupoKitId: null, ivaPct: "19" });
});

describe("buscarParaOrdenAction", () => {
  it("busca con el permiso de la orden en la sede activa", async () => {
    mockBuscarConceptos.mockResolvedValue({ kits: [], repuestos: [] });
    await buscarParaOrdenAction("filtro");
    expect(mockRequirePermiso).toHaveBeenCalledWith("ordenes.trabajar");
    expect(mockBuscarConceptos).toHaveBeenCalledWith(db, "sede-1", "filtro");
  });
});

describe("agregarRepuestoAOrdenAction", () => {
  it("suma 1 al repuesto que ya está suelto en la orden", async () => {
    const r = await agregarRepuestoAOrdenAction("o1", "r1");
    expect(r).toEqual({ error: null, conceptoId: "item:i1", fusionado: true });
    expect(db.itemOrden.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { cantidad: { increment: 1 } } });
  });

  it("crea el repuesto con el precio y el IVA del catálogo", async () => {
    db.itemOrden.findFirst.mockResolvedValue(null);
    db.itemOrden.create.mockResolvedValue({ id: "i2" });
    const r = await agregarRepuestoAOrdenAction("o1", "r1");
    expect(r).toEqual({ error: null, conceptoId: "item:i2", fusionado: false });
    expect(db.itemOrden.create).toHaveBeenCalledWith({
      data: { ordenId: "o1", repuestoId: "r1", descripcion: "Filtro", cantidad: 1, precioUnitario: "25000", ivaPct: "5.00" },
      select: { id: true },
    });
  });

  it("rechaza un repuesto de otra sede", async () => {
    db.repuesto.findFirst.mockResolvedValue(null);
    expect((await agregarRepuestoAOrdenAction("o1", "r9")).error).toBe("Repuesto no encontrado");
    expect(db.itemOrden.create).not.toHaveBeenCalled();
  });
});

describe("agregarLibreAOrdenAction", () => {
  it("la mano de obra libre toma el mecánico de la orden y el IVA predeterminado", async () => {
    db.ordenTrabajo.findFirst.mockResolvedValue({ estado: "EN_PROCESO", factura: null, mecanicoId: "t1" });
    db.usuario.findFirst.mockResolvedValue({ id: "t1" });
    db.manoDeObra.create.mockResolvedValue({ id: "m9" });
    const r = await agregarLibreAOrdenAction("o1", { tipo: "MANO_OBRA", descripcion: " Lavado " });
    expect(r).toEqual({ error: null, conceptoId: "mo:m9" });
    expect(db.manoDeObra.create).toHaveBeenCalledWith({
      data: { ordenId: "o1", descripcion: "Lavado", valor: 0, mecanicoId: "t1", ivaPct: 19 },
      select: { id: true },
    });
  });

  it("un repuesto libre queda sin repuesto, con cantidad 1 y precio 0", async () => {
    db.itemOrden.create.mockResolvedValue({ id: "i5" });
    const r = await agregarLibreAOrdenAction("o1", { tipo: "REPUESTO", descripcion: "Tornillo" });
    expect(r.conceptoId).toBe("item:i5");
    expect(db.itemOrden.create).toHaveBeenCalledWith({
      data: { ordenId: "o1", repuestoId: null, descripcion: "Tornillo", cantidad: 1, precioUnitario: 0, ivaPct: 19 },
      select: { id: true },
    });
  });

  it("no escribe nada en una orden facturada", async () => {
    db.ordenTrabajo.findFirst.mockResolvedValue({ estado: "ENTREGADA", factura: { id: "f1" }, mecanicoId: null });
    expect((await agregarLibreAOrdenAction("o1", { tipo: "REPUESTO", descripcion: "x" })).error).toBeTruthy();
    expect(db.itemOrden.create).not.toHaveBeenCalled();
  });

  it("exige descripción", async () => {
    expect((await agregarLibreAOrdenAction("o1", { tipo: "REPUESTO", descripcion: "  " })).error).toBe(
      "La descripción es obligatoria",
    );
  });
});

describe("actualizarConceptoOrdenAction", () => {
  it("guarda la cantidad entera de un repuesto", async () => {
    const r = await actualizarConceptoOrdenAction("o1", "item:i1", { cantidad: 3 });
    expect(r).toEqual({ error: null, conceptoId: "item:i1" });
    expect(db.itemOrden.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { cantidad: 3 } });
  });

  it("rechaza una cantidad en la mano de obra y una cantidad no entera", async () => {
    db.manoDeObra.findFirst.mockResolvedValue({ id: "m1", ivaPct: "19", grupoKitId: null });
    expect((await actualizarConceptoOrdenAction("o1", "mo:m1", { cantidad: 2 })).error).toMatch(/no tiene cantidad/);
    expect((await actualizarConceptoOrdenAction("o1", "item:i1", { cantidad: 1.5 })).error).toBeTruthy();
    expect(db.itemOrden.update).not.toHaveBeenCalled();
  });

  it("el precio de la mano de obra se guarda como su valor", async () => {
    db.manoDeObra.findFirst.mockResolvedValue({ id: "m1", ivaPct: "19", grupoKitId: null });
    await actualizarConceptoOrdenAction("o1", "mo:m1", { precioUnitario: 45000 });
    expect(db.manoDeObra.update).toHaveBeenCalledWith({ where: { id: "m1" }, data: { valor: 45000 } });
  });

  it("cambia el IVA a otra tarifa activa y rechaza una inactiva", async () => {
    await actualizarConceptoOrdenAction("o1", "item:i1", { ivaPct: 0 });
    expect(db.itemOrden.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { ivaPct: 0 } });
    expect((await actualizarConceptoOrdenAction("o1", "item:i1", { ivaPct: 7 })).error).toMatch(/no está activa/);
  });

  it("solo deja cambiar la descripción de una línea libre", async () => {
    expect((await actualizarConceptoOrdenAction("o1", "item:i1", { descripcion: "Otro" })).error).toMatch(/libres/);
    db.itemOrden.findFirst.mockResolvedValue({ id: "i3", repuestoId: null, grupoKitId: null, ivaPct: "19" });
    await actualizarConceptoOrdenAction("o1", "item:i3", { descripcion: "Otro" });
    expect(db.itemOrden.update).toHaveBeenCalledWith({ where: { id: "i3" }, data: { descripcion: "Otro" } });
  });

  it("cambia el mecánico a un técnico de la sede y rechaza uno de otra", async () => {
    db.manoDeObra.findFirst.mockResolvedValue({ id: "m1", ivaPct: "19", grupoKitId: null });
    db.usuario.findFirst.mockResolvedValue({ id: "t2" });
    await actualizarConceptoOrdenAction("o1", "mo:m1", { mecanicoId: "t2" });
    expect(db.manoDeObra.update).toHaveBeenCalledWith({ where: { id: "m1" }, data: { mecanicoId: "t2" } });

    db.manoDeObra.update.mockClear();
    db.usuario.findFirst.mockResolvedValue(null);
    const r = await actualizarConceptoOrdenAction("o1", "mo:m1", { mecanicoId: "otro" });
    expect(r.error).toMatch(/no pertenece a esta sede/);
    expect(db.manoDeObra.update).not.toHaveBeenCalled();
  });

  it("quitar el mecánico deja la línea sin asignar", async () => {
    db.manoDeObra.findFirst.mockResolvedValue({ id: "m1", ivaPct: "19", grupoKitId: null });
    await actualizarConceptoOrdenAction("o1", "mo:m1", { mecanicoId: null });
    expect(db.manoDeObra.update).toHaveBeenCalledWith({ where: { id: "m1" }, data: { mecanicoId: null } });
  });

  it("un repuesto no tiene mecánico", async () => {
    expect((await actualizarConceptoOrdenAction("o1", "item:i1", { mecanicoId: "t1" })).error).toMatch(/mano de obra/);
  });

  it("una línea que ya no está responde con un error", async () => {
    db.itemOrden.findFirst.mockResolvedValue(null);
    expect((await actualizarConceptoOrdenAction("o1", "item:i1", { cantidad: 2 })).error).toBe(
      "La línea ya no está en esta orden",
    );
  });
});

describe("cambiarTipoConceptoOrdenAction", () => {
  it("pasa una línea libre de repuesto a mano de obra en una transacción, con su importe y su fecha", async () => {
    const creada = new Date("2026-11-08T10:00:00Z");
    db.ordenTrabajo.findFirst.mockResolvedValue({ estado: "EN_PROCESO", factura: null, mecanicoId: "t1" });
    db.usuario.findFirst.mockResolvedValue({ id: "t1" });
    db.itemOrden.findFirst.mockResolvedValue({
      id: "i1",
      repuestoId: null,
      grupoKitId: null,
      grupoKitNombre: null,
      descripcion: "Soldadura",
      cantidad: 2,
      precioUnitario: "15000",
      ivaPct: "19",
      createdAt: creada,
    });
    db.manoDeObra.create.mockResolvedValue({ id: "m5" });

    const r = await cambiarTipoConceptoOrdenAction("o1", "item:i1");

    expect(r).toEqual({ error: null, conceptoId: "mo:m5" });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.itemOrden.delete).toHaveBeenCalledWith({ where: { id: "i1" } });
    expect(db.manoDeObra.create).toHaveBeenCalledWith({
      data: {
        ordenId: "o1",
        descripcion: "Soldadura",
        valor: 30000,
        ivaPct: "19",
        mecanicoId: "t1",
        grupoKitId: null,
        grupoKitNombre: null,
        createdAt: creada,
      },
      select: { id: true },
    });
  });

  it("pasa la mano de obra libre a repuesto con cantidad 1 y su valor como precio", async () => {
    const creada = new Date("2026-11-08T11:00:00Z");
    db.manoDeObra.findFirst.mockResolvedValue({
      id: "m1",
      grupoKitId: null,
      grupoKitNombre: null,
      descripcion: "Pintura",
      valor: "80000",
      ivaPct: "5",
      createdAt: creada,
    });
    db.itemOrden.create.mockResolvedValue({ id: "i8" });

    const r = await cambiarTipoConceptoOrdenAction("o1", "mo:m1");

    expect(r).toEqual({ error: null, conceptoId: "item:i8" });
    expect(db.manoDeObra.delete).toHaveBeenCalledWith({ where: { id: "m1" } });
    expect(db.itemOrden.create).toHaveBeenCalledWith({
      data: {
        ordenId: "o1",
        repuestoId: null,
        descripcion: "Pintura",
        cantidad: 1,
        precioUnitario: "80000",
        ivaPct: "5",
        grupoKitId: null,
        grupoKitNombre: null,
        createdAt: creada,
      },
      select: { id: true },
    });
  });

  it("no cambia el tipo de una línea del catálogo", async () => {
    expect((await cambiarTipoConceptoOrdenAction("o1", "item:i1")).error).toMatch(/libres/);
    expect(db.itemOrden.delete).not.toHaveBeenCalled();
  });
});

describe("quitarKitOrdenAction", () => {
  it("exige el permiso de quitar y borra en las dos tablas", async () => {
    db.itemOrden.deleteMany.mockResolvedValue({ count: 2 });
    db.manoDeObra.deleteMany.mockResolvedValue({ count: 1 });
    await expect(quitarKitOrdenAction("o1", "g1")).resolves.toEqual({ error: null, success: true });
    expect(mockRequirePermiso).toHaveBeenCalledWith("ordenes.quitar");
    expect(db.itemOrden.deleteMany).toHaveBeenCalledWith({ where: { ordenId: "o1", grupoKitId: "g1" } });
    expect(db.manoDeObra.deleteMany).toHaveBeenCalledWith({ where: { ordenId: "o1", grupoKitId: "g1" } });
  });

  it("si el kit ya no está, lo dice", async () => {
    db.itemOrden.deleteMany.mockResolvedValue({ count: 0 });
    db.manoDeObra.deleteMany.mockResolvedValue({ count: 0 });
    expect((await quitarKitOrdenAction("o1", "g1")).error).toBe("El kit ya no está en esta orden");
  });
});

describe("D7: el técnico solo trabaja en sus órdenes", () => {
  it("una orden ajena no se encuentra y no se agrega nada", async () => {
    mockRequirePermiso.mockResolvedValue({
      user: { id: "tec-1", tenantSchema: "taller", sedeActivaId: "sede-1", permisos: ["ordenes.trabajar"] },
    });
    db.ordenTrabajo.findFirst.mockResolvedValue(null);

    const r = await agregarLibreAOrdenAction("ajena", { tipo: "REPUESTO", descripcion: "Pastillas" });

    expect(r.error).toBe("Orden no encontrada");
    expect(db.ordenTrabajo.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "ajena",
          sedeId: "sede-1",
          OR: [{ mecanicoId: "tec-1" }, { manoDeObra: { some: { mecanicoId: "tec-1" } } }],
        },
      }),
    );
    expect(db.itemOrden.create).not.toHaveBeenCalled();
  });
});
