import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRequirePermiso = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requirePermiso: (...args: unknown[]) => mockRequirePermiso(...args),
  requireSession: vi.fn(),
}));

const db = {
  usuario: { findMany: vi.fn(), findFirst: vi.fn() },
  configuracionTaller: { findUnique: vi.fn() },
  liquidacionMecanico: { findMany: vi.fn(), findFirst: vi.fn() },
  ordenTrabajo: { findMany: vi.fn() },
  categoriaGasto: { findUnique: vi.fn() },
  cajaSesion: { findFirst: vi.fn() },
  // `never` corta la referencia circular de tipos entre `db` y `tx`.
  $transaction: (fn: (cliente: never) => unknown) => fn(tx as never),
};

// Las lecturas dentro de la transacción usan los mismos mocks que fuera de ella.
const tx = {
  $queryRaw: vi.fn(),
  usuario: db.usuario,
  ordenTrabajo: db.ordenTrabajo,
  esquemaLiquidacion: { upsert: vi.fn(), deleteMany: vi.fn() },
  configuracionTaller: { upsert: vi.fn() },
  liquidacionMecanico: { findMany: db.liquidacionMecanico.findMany, findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  gasto: { create: vi.fn(), deleteMany: vi.fn() },
  auditLog: { create: vi.fn() },
};
vi.mock("@/lib/db/tenant-client", () => ({ getTenantDb: () => db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  anularLiquidacionAction,
  getFrecuenciaLiquidacion,
  guardarEsquemaLiquidacionAction,
  guardarFrecuenciaLiquidacionAction,
  listLiquidacionesDelPeriodo,
  pagarLiquidacionAction,
  quitarEsquemaLiquidacionAction,
  type EsquemaLiquidacionFormState,
  type FrecuenciaLiquidacionFormState,
  type PagoLiquidacionFormState,
} from "./liquidacion-actions";

const inicial: EsquemaLiquidacionFormState = { error: null, success: false };
const inicialFrecuencia: FrecuenciaLiquidacionFormState = { error: null, success: false };
const inicialPago: PagoLiquidacionFormState = { error: null, success: false };
const ADMIN = { user: { id: "u1", role: "ADMIN", tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };

/** Medianoche de Bogotá: los periodos cortan ahí (hallazgo B2). */
const BOG = (iso: string) => new Date(`${iso}T00:00:00-05:00`);

/** Liquidaciones guardadas: el mock aplica el filtro por estado como lo haría la base. */
function documentosGuardados(filas: ({ estado: string } & Record<string, unknown>)[]) {
  db.liquidacionMecanico.findMany.mockImplementation(async (args?: { where?: { estado?: string } }) =>
    filas.filter((fila) => !args?.where?.estado || fila.estado === args.where.estado),
  );
}

function fd(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [clave, valor] of Object.entries(campos)) f.set(clave, valor);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequirePermiso.mockResolvedValue(ADMIN);
  db.usuario.findFirst.mockResolvedValue({ id: "t1" });
  db.usuario.findMany.mockResolvedValue([]);
  db.configuracionTaller.findUnique.mockResolvedValue({ frecuenciaLiquidacion: "MENSUAL" });
  documentosGuardados([]);
  db.ordenTrabajo.findMany.mockResolvedValue([]);
  db.categoriaGasto.findUnique.mockResolvedValue({ id: "cat_liquidacion_mecanicos", activo: true });
  tx.$queryRaw.mockResolvedValue([]);
  tx.esquemaLiquidacion.upsert.mockResolvedValue({});
  tx.esquemaLiquidacion.deleteMany.mockResolvedValue({ count: 1 });
  tx.configuracionTaller.upsert.mockResolvedValue({});
  tx.liquidacionMecanico.findUnique.mockResolvedValue(null);
  tx.liquidacionMecanico.create.mockResolvedValue({ id: "l1" });
  tx.liquidacionMecanico.updateMany.mockResolvedValue({ count: 1 });
  tx.gasto.create.mockResolvedValue({ id: "g1" });
  tx.gasto.deleteMany.mockResolvedValue({ count: 1 });
  tx.auditLog.create.mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("guardarEsquemaLiquidacionAction", () => {
  it("guarda un esquema por porcentaje y limpia el monto base", async () => {
    const r = await guardarEsquemaLiquidacionAction("t1", inicial, fd({ tipo: "PORCENTAJE", porcentaje: "40", montoFijo: "800000" }));

    expect(mockRequirePermiso).toHaveBeenCalledWith("liquidaciones.gestionar");
    expect(db.usuario.findFirst).toHaveBeenCalledWith({
      where: { id: "t1", role: "TECNICO", sedes: { some: { sedeId: "sede-1" } } },
      select: { id: true },
    });
    expect(tx.esquemaLiquidacion.upsert).toHaveBeenCalledWith({
      where: { usuarioId: "t1" },
      create: { usuarioId: "t1", tipo: "PORCENTAJE", porcentaje: 40, montoFijo: null },
      update: { tipo: "PORCENTAJE", porcentaje: 40, montoFijo: null },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: "LIQUIDACION_ESQUEMA_ACTUALIZAR",
        actorId: "u1",
        entidadTipo: "EsquemaLiquidacion",
        entidadId: "t1",
      }),
    });
    expect(r).toEqual({ error: null, success: true });
  });

  it("guarda un esquema fijo y limpia el porcentaje", async () => {
    await guardarEsquemaLiquidacionAction("t1", inicial, fd({ tipo: "FIJO", porcentaje: "40", montoFijo: "1500000" }));

    expect(tx.esquemaLiquidacion.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { usuarioId: "t1", tipo: "FIJO", porcentaje: null, montoFijo: 1500000 } }),
    );
  });

  it("rechaza un técnico que no es de la sede activa", async () => {
    db.usuario.findFirst.mockResolvedValue(null);

    const r = await guardarEsquemaLiquidacionAction("ajeno", inicial, fd({ tipo: "FIJO", porcentaje: "", montoFijo: "900000" }));

    expect(r).toEqual({ error: "Técnico no encontrado en tu sede activa", success: false });
    expect(tx.esquemaLiquidacion.upsert).not.toHaveBeenCalled();
  });

  it("valida antes de tocar la base", async () => {
    const r = await guardarEsquemaLiquidacionAction("t1", inicial, fd({ tipo: "PORCENTAJE", porcentaje: "", montoFijo: "" }));

    expect(r.error).toBe("Un esquema por porcentaje necesita el porcentaje");
    expect(db.usuario.findFirst).not.toHaveBeenCalled();
    expect(tx.esquemaLiquidacion.upsert).not.toHaveBeenCalled();
  });

  it("no registra auditoría si el guardado falla", async () => {
    tx.esquemaLiquidacion.upsert.mockRejectedValue({ code: "P2002" });

    const r = await guardarEsquemaLiquidacionAction("t1", inicial, fd({ tipo: "FIJO", porcentaje: "", montoFijo: "900000" }));

    expect(r.success).toBe(false);
    expect(r.error).toBe("Ya existe un registro con ese valor.");
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("getFrecuenciaLiquidacion", () => {
  it("devuelve la frecuencia guardada y exige ADMIN", async () => {
    await expect(getFrecuenciaLiquidacion()).resolves.toBe("MENSUAL");
    expect(mockRequirePermiso).toHaveBeenCalledWith("liquidaciones.gestionar");
  });

  it("cae en el valor por defecto si el taller nunca guardó la configuración", async () => {
    db.configuracionTaller.findUnique.mockResolvedValue(null);

    await expect(getFrecuenciaLiquidacion()).resolves.toBe("MENSUAL");
  });
});

describe("guardarFrecuenciaLiquidacionAction", () => {
  it("guarda la frecuencia en la fila singleton y la audita", async () => {
    const r = await guardarFrecuenciaLiquidacionAction(inicialFrecuencia, fd({ frecuencia: "QUINCENAL" }));

    expect(tx.configuracionTaller.upsert).toHaveBeenCalledWith({
      where: { id: "singleton" },
      create: { id: "singleton", frecuenciaLiquidacion: "QUINCENAL" },
      update: { frecuenciaLiquidacion: "QUINCENAL" },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tipo: "LIQUIDACION_FRECUENCIA_ACTUALIZAR", entidadId: "singleton" }),
    });
    expect(r).toEqual({ error: null, success: true });
  });

  it("informa el error si el guardado falla", async () => {
    tx.configuracionTaller.upsert.mockRejectedValue(new Error("db down"));

    const r = await guardarFrecuenciaLiquidacionAction(inicialFrecuencia, fd({ frecuencia: "QUINCENAL" }));

    expect(r.success).toBe(false);
    expect(r.error).not.toBeNull();
  });

  it("rechaza una frecuencia inventada", async () => {
    const r = await guardarFrecuenciaLiquidacionAction(inicialFrecuencia, fd({ frecuencia: "DIARIA" }));

    expect(r.error).toBe("Frecuencia inválida");
    expect(tx.configuracionTaller.upsert).not.toHaveBeenCalled();
  });
});

const ANA = {
  id: "t1",
  nombre: "Ana",
  esquemaLiquidacion: { tipo: "PORCENTAJE", porcentaje: 40, montoFijo: null },
};
const ORDEN_DE_ANA = {
  mecanicoId: "t1",
  mecanico: { nombre: "Ana" },
  manoDeObra: [
    { valor: "30000", mecanicoId: "t1", mecanico: { nombre: "Ana" } },
    { valor: "15000", mecanicoId: null, mecanico: null },
  ],
};
const PAGADA_OCTUBRE = {
  id: "l1",
  usuarioId: "t1",
  estado: "PAGADA",
  periodo: "2026-10",
  frecuencia: "MENSUAL",
  montoCalculado: 18000,
  ajuste: 2000,
  motivoAjuste: "Bono",
  total: 20000,
  pagadaAt: new Date("2026-10-31T15:00:00.000Z"),
  gastoId: "g1",
};

describe("listLiquidacionesDelPeriodo", () => {
  beforeEach(() => {
    db.usuario.findMany.mockResolvedValue([ANA]);
    db.ordenTrabajo.findMany.mockResolvedValue([ORDEN_DE_ANA]);
  });

  it("cruza la producción del periodo con el esquema vigente; sin pago, la fila está por pagar", async () => {
    const r = await listLiquidacionesDelPeriodo("2026-10");

    expect(mockRequirePermiso).toHaveBeenCalledWith("liquidaciones.gestionar");
    // La ventana corta a medianoche de Bogotá (B2).
    expect(db.ordenTrabajo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sedeId: "sede-1", estado: "ENTREGADA", entregadaAt: { gte: BOG("2026-10-01"), lt: BOG("2026-11-01") } },
      }),
    );
    expect(r.frecuencia).toBe("MENSUAL");
    expect(r.etiqueta).toBe("octubre de 2026");
    expect(r.error).toBeNull();
    expect(r.filas).toEqual([
      {
        usuarioId: "t1",
        nombre: "Ana",
        ordenes: 1,
        trabajos: 2,
        montoManoObra: 45000,
        montoPorTrabajo: 22500,
        tipo: "PORCENTAJE",
        porcentaje: 40,
        montoFijo: null,
        montoSugerido: 18000,
        solapada: false,
        pago: null,
      },
    ]);
  });

  it("muestra el pago congelado de una liquidación pagada", async () => {
    documentosGuardados([PAGADA_OCTUBRE]);

    const [fila] = (await listLiquidacionesDelPeriodo("2026-10")).filas;

    expect(fila!.pago).toEqual({
      id: "l1",
      montoCalculado: 18000,
      ajuste: 2000,
      motivoAjuste: "Bono",
      total: 20000,
      pagadaAt: new Date("2026-10-31T15:00:00.000Z"),
    });
  });

  it("una anulada o una pendiente heredada no cuentan como pago: el periodo sigue por pagar", async () => {
    documentosGuardados([
      { ...PAGADA_OCTUBRE, estado: "ANULADA", gastoId: null },
      { ...PAGADA_OCTUBRE, id: "l2", estado: "PENDIENTE", periodo: "2026-10-Q1", frecuencia: "QUINCENAL", gastoId: null },
    ]);

    const [fila] = (await listLiquidacionesDelPeriodo("2026-10")).filas;

    expect(fila!.pago).toBeNull();
    expect(fila!.solapada).toBe(false);
  });

  it("marca solapada la ventana ya pagada en otro periodo del mismo técnico", async () => {
    documentosGuardados([PAGADA_OCTUBRE]);

    const [fila] = (await listLiquidacionesDelPeriodo("2026-10-Q1")).filas;

    expect(fila!.pago).toBeNull();
    expect(fila!.solapada).toBe(true);
  });

  it("marca al técnico sin esquema y no le calcula monto", async () => {
    db.usuario.findMany.mockResolvedValue([{ id: "t1", nombre: "Ana", esquemaLiquidacion: null }]);

    const [fila] = (await listLiquidacionesDelPeriodo("2026-10")).filas;

    expect(fila!.tipo).toBeNull();
    expect(fila!.montoSugerido).toBeNull();
  });

  it("acepta un periodo de una frecuencia que ya no es la del taller", async () => {
    db.configuracionTaller.findUnique.mockResolvedValue({ frecuenciaLiquidacion: "QUINCENAL" });

    const r = await listLiquidacionesDelPeriodo("2026-10");

    expect(r.frecuencia).toBe("MENSUAL");
    expect(r.error).toBeNull();
  });

  it("incluye al técnico que ya no está en la sede pero tiene un pago del periodo (para poder anularlo)", async () => {
    documentosGuardados([PAGADA_OCTUBRE]);

    await listLiquidacionesDelPeriodo("2026-10");

    expect(db.usuario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ role: "TECNICO", sedes: { some: { sedeId: "sede-1" } } }, { id: { in: ["t1"] } }] },
      }),
    );
  });

  it("informa la mano de obra sin mecánico, que no se le liquida a nadie", async () => {
    db.usuario.findMany.mockResolvedValue([]);
    db.ordenTrabajo.findMany.mockResolvedValue([
      { mecanicoId: null, mecanico: null, manoDeObra: [{ valor: "20000", mecanicoId: null, mecanico: null }] },
    ]);

    const r = await listLiquidacionesDelPeriodo("2026-10");

    expect(r.sinAsignar).toEqual({ ordenes: 1, trabajos: 1, montoManoObra: 20000 });
  });

  it("rechaza un periodo con formato inválido sin consultar órdenes", async () => {
    const r = await listLiquidacionesDelPeriodo("2026-13");

    expect(r.error).toBe("El periodo debe tener el formato AAAA-MM");
    expect(r.filas).toEqual([]);
    expect(db.ordenTrabajo.findMany).not.toHaveBeenCalled();
  });
});

describe("pagarLiquidacionAction", () => {
  const PAGO = { metodoPago: "EFECTIVO", referencia: "recibo 12", fecha: "2026-10-31", ajuste: "", motivoAjuste: "" };

  beforeEach(() => {
    db.usuario.findMany.mockResolvedValue([ANA]);
    db.ordenTrabajo.findMany.mockResolvedValue([ORDEN_DE_ANA]);
  });

  it("congela el cálculo del servidor, crea el gasto y deja la liquidación pagada, todo en una transacción", async () => {
    const r = await pagarLiquidacionAction("t1", "2026-10", inicialPago, fd({ ...PAGO, ajuste: "2000", motivoAjuste: "Bono" }));

    expect(r).toEqual({ error: null, success: true });
    // Primero se bloquea al técnico: dos pagos suyos a la vez se hacen en fila.
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(db.ordenTrabajo.findMany.mock.invocationCallOrder[0]!);
    expect(tx.gasto.create).toHaveBeenCalledWith({
      data: {
        sedeId: "sede-1",
        categoriaId: "cat_liquidacion_mecanicos",
        descripcion: "Liquidación Ana · octubre de 2026",
        monto: 20000,
        fecha: new Date("2026-10-31T00:00:00.000Z"),
        referencia: "recibo 12",
        registradoPorId: "u1",
        pagadoEnEfectivo: true,
      },
    });
    expect(tx.liquidacionMecanico.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        periodo: "2026-10",
        frecuencia: "MENSUAL",
        sedeId: "sede-1",
        usuarioId: "t1",
        estado: "PAGADA",
        ordenes: 1,
        trabajos: 2,
        montoManoObra: 45000,
        tipo: "PORCENTAJE",
        porcentaje: 40,
        montoFijo: null,
        montoCalculado: 18000,
        ajuste: 2000,
        motivoAjuste: "Bono",
        total: 20000,
        gastoId: "g1",
        generadaPorId: "u1",
        pagadaPorId: "u1",
      }),
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tipo: "LIQUIDACION_PAGAR", entidadId: "l1" }),
    });
  });

  it("vuelve a pagar un periodo anulado (o una pendiente heredada) reutilizando su documento", async () => {
    documentosGuardados([{ ...PAGADA_OCTUBRE, estado: "ANULADA", gastoId: null }]);
    tx.liquidacionMecanico.findUnique.mockResolvedValue({ id: "l1" });

    const r = await pagarLiquidacionAction("t1", "2026-10", inicialPago, fd(PAGO));

    expect(r.error).toBeNull();
    expect(tx.liquidacionMecanico.findUnique).toHaveBeenCalledWith({
      where: { periodo_usuarioId_sedeId: { periodo: "2026-10", usuarioId: "t1", sedeId: "sede-1" } },
      select: { id: true },
    });
    expect(tx.liquidacionMecanico.create).not.toHaveBeenCalled();
    expect(tx.liquidacionMecanico.updateMany).toHaveBeenCalledWith({
      where: { id: "l1", estado: { not: "PAGADA" } },
      data: expect.objectContaining({
        estado: "PAGADA",
        total: 18000,
        ajuste: 0,
        motivoAjuste: null,
        gastoId: "g1",
        anuladaAt: null,
        anuladaPorId: null,
        motivoAnulacion: null,
      }),
    });
  });

  it("no paga dos veces el mismo periodo", async () => {
    documentosGuardados([PAGADA_OCTUBRE]);

    const r = await pagarLiquidacionAction("t1", "2026-10", inicialPago, fd(PAGO));

    expect(r.error).toBe("Esa liquidación ya está pagada");
    expect(tx.gasto.create).not.toHaveBeenCalled();
  });

  it("si otro pago reutilizó el documento entre la lectura y la escritura, revierte", async () => {
    tx.liquidacionMecanico.findUnique.mockResolvedValue({ id: "l1" });
    tx.liquidacionMecanico.updateMany.mockResolvedValue({ count: 0 });

    const r = await pagarLiquidacionAction("t1", "2026-10", inicialPago, fd(PAGO));

    expect(r.error).toBe("Esa liquidación ya está pagada");
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("si otro pago creó el documento a la vez (choque del índice único), revierte", async () => {
    tx.liquidacionMecanico.create.mockRejectedValue(Object.assign(new Error("Unique constraint"), { code: "P2002" }));

    const r = await pagarLiquidacionAction("t1", "2026-10", inicialPago, fd(PAGO));

    expect(r.error).toBe("Esa liquidación ya está pagada");
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("no paga una ventana ya pagada en otro periodo del técnico (cambio de frecuencia)", async () => {
    documentosGuardados([PAGADA_OCTUBRE]);

    const r = await pagarLiquidacionAction("t1", "2026-10-Q2", inicialPago, fd(PAGO));

    expect(r.error).toBe("Ese trabajo ya se pagó en otro periodo de este técnico");
    expect(tx.gasto.create).not.toHaveBeenCalled();
  });

  it("no paga a un técnico sin esquema", async () => {
    db.usuario.findMany.mockResolvedValue([{ ...ANA, esquemaLiquidacion: null }]);

    const r = await pagarLiquidacionAction("t1", "2026-10", inicialPago, fd(PAGO));

    expect(r.error).toBe("Ese técnico no tiene esquema de pago: defínelo antes de pagar");
    expect(tx.gasto.create).not.toHaveBeenCalled();
  });

  it("rechaza un técnico que no es de la sede activa", async () => {
    const r = await pagarLiquidacionAction("t-ajeno", "2026-10", inicialPago, fd(PAGO));

    expect(r.error).toBe("Técnico no encontrado en tu sede activa");
    expect(tx.gasto.create).not.toHaveBeenCalled();
  });

  it("no paga un total cero o negativo", async () => {
    const r = await pagarLiquidacionAction(
      "t1",
      "2026-10",
      inicialPago,
      fd({ ...PAGO, ajuste: "-18000", motivoAjuste: "Adelanto" }),
    );

    expect(r.error).toBe("El total a pagar debe ser mayor que cero");
    expect(tx.gasto.create).not.toHaveBeenCalled();
  });

  it("exige el motivo cuando hay ajuste", async () => {
    const r = await pagarLiquidacionAction("t1", "2026-10", inicialPago, fd({ ...PAGO, ajuste: "5000" }));

    expect(r.error).toBe("Explica el motivo del ajuste");
    expect(db.ordenTrabajo.findMany).not.toHaveBeenCalled();
  });

  it("con control de caja, pagarla en efectivo exige la caja abierta (hallazgo M1)", async () => {
    db.configuracionTaller.findUnique.mockResolvedValue({
      frecuenciaLiquidacion: "MENSUAL",
      exigirActaFirmada: false,
      usarControlCaja: true,
    });
    db.cajaSesion.findFirst.mockResolvedValue(null);

    const r = await pagarLiquidacionAction("t1", "2026-10", inicialPago, fd(PAGO));
    expect(r.error).toBe("Abre la caja antes de pagar la liquidación en efectivo");
    expect(tx.gasto.create).not.toHaveBeenCalled();

    // Por transferencia no toca el cajón.
    const transferencia = await pagarLiquidacionAction(
      "t1",
      "2026-10",
      inicialPago,
      fd({ ...PAGO, metodoPago: "TRANSFERENCIA", referencia: "" }),
    );
    expect(transferencia.error).toBeNull();
    expect(tx.gasto.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ pagadoEnEfectivo: false, referencia: null }) }),
    );
  });

  it("avisa si la categoría del sistema no existe o está desactivada", async () => {
    db.categoriaGasto.findUnique.mockResolvedValue(null);
    expect((await pagarLiquidacionAction("t1", "2026-10", inicialPago, fd(PAGO))).error).toBe(
      "Falta la categoría de gasto del sistema: aplica la migración de la fase 19",
    );

    db.categoriaGasto.findUnique.mockResolvedValue({ id: "cat_liquidacion_mecanicos", activo: false });
    expect((await pagarLiquidacionAction("t1", "2026-10", inicialPago, fd(PAGO))).error).toContain("está desactivada");
    expect(tx.gasto.create).not.toHaveBeenCalled();
  });

  it("rechaza un método de pago o un periodo inválidos sin consultar nada", async () => {
    expect((await pagarLiquidacionAction("t1", "2026-10", inicialPago, fd({ ...PAGO, metodoPago: "ANTICIPO" }))).error).toBe(
      "Método de pago inválido",
    );
    expect((await pagarLiquidacionAction("t1", "2026-13", inicialPago, fd(PAGO))).error).toBe(
      "El periodo debe tener el formato AAAA-MM",
    );
    expect(db.ordenTrabajo.findMany).not.toHaveBeenCalled();
  });
});

describe("anularLiquidacionAction", () => {
  it("anula una pagada y borra su gasto en la misma transacción", async () => {
    db.liquidacionMecanico.findFirst.mockResolvedValue({ id: "l1", estado: "PAGADA", gastoId: "g1" });

    const r = await anularLiquidacionAction("l1", "Se pagó dos veces");

    expect(r).toEqual({ error: null });
    expect(tx.gasto.deleteMany).toHaveBeenCalledWith({ where: { id: "g1" } });
    expect(tx.liquidacionMecanico.updateMany).toHaveBeenCalledWith({
      // Condicional al estado y al gasto leídos (hallazgo B1).
      where: { id: "l1", estado: "PAGADA", gastoId: "g1" },
      data: expect.objectContaining({
        estado: "ANULADA",
        motivoAnulacion: "Se pagó dos veces",
        anuladaPorId: "u1",
        gastoId: null,
      }),
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tipo: "LIQUIDACION_ANULAR", entidadId: "l1" }),
    });
  });

  it("no anula si cambió entre la lectura y la escritura (hallazgo B1)", async () => {
    db.liquidacionMecanico.findFirst.mockResolvedValue({ id: "l1", estado: "PAGADA", gastoId: "g1" });
    tx.liquidacionMecanico.updateMany.mockResolvedValue({ count: 0 });

    const r = await anularLiquidacionAction("l1", "Motivo");

    expect(r.error).toBe("La liquidación cambió mientras la anulabas: revisa antes de volver a intentarlo");
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("solo se anula lo que está pagado", async () => {
    db.liquidacionMecanico.findFirst.mockResolvedValue({ id: "l1", estado: "ANULADA", gastoId: null });
    expect((await anularLiquidacionAction("l1", "Otra vez")).error).toBe("Solo se puede anular una liquidación pagada");

    db.liquidacionMecanico.findFirst.mockResolvedValue({ id: "l1", estado: "PENDIENTE", gastoId: null });
    expect((await anularLiquidacionAction("l1", "Heredada")).error).toBe("Solo se puede anular una liquidación pagada");
    expect(tx.liquidacionMecanico.updateMany).not.toHaveBeenCalled();
  });

  it("exige el motivo", async () => {
    const r = await anularLiquidacionAction("l1", "   ");

    expect(r.error).toBe("Explica por qué se anula la liquidación");
    expect(db.liquidacionMecanico.findFirst).not.toHaveBeenCalled();
  });

  it("rechaza una liquidación de otra sede", async () => {
    db.liquidacionMecanico.findFirst.mockResolvedValue(null);

    const r = await anularLiquidacionAction("l-ajena", "Motivo");

    expect(r.error).toBe("Liquidación no encontrada");
  });
});

describe("quitarEsquemaLiquidacionAction", () => {
  it("deja al técnico sin esquema y lo audita", async () => {
    const r = await quitarEsquemaLiquidacionAction("t1");

    expect(r).toEqual({ error: null });
    expect(db.usuario.findFirst).toHaveBeenCalledWith({
      where: { id: "t1", role: "TECNICO", sedes: { some: { sedeId: "sede-1" } } },
      select: { id: true },
    });
    expect(tx.esquemaLiquidacion.deleteMany).toHaveBeenCalledWith({ where: { usuarioId: "t1" } });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: "LIQUIDACION_ESQUEMA_ACTUALIZAR",
        entidadId: "t1",
        detalle: { eliminado: true },
      }),
    });
  });

  it("rechaza un técnico que no es de la sede activa", async () => {
    db.usuario.findFirst.mockResolvedValue(null);

    const r = await quitarEsquemaLiquidacionAction("ajeno");

    expect(r.error).toBe("Técnico no encontrado en tu sede activa");
    expect(tx.esquemaLiquidacion.deleteMany).not.toHaveBeenCalled();
  });

  it("avisa si ese técnico no tenía esquema", async () => {
    tx.esquemaLiquidacion.deleteMany.mockResolvedValue({ count: 0 });

    const r = await quitarEsquemaLiquidacionAction("t1");

    expect(r.error).toBe("Ese técnico no tiene esquema que quitar");
  });
});
