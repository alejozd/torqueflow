import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...a: unknown[]) => mockRequireRole(...a),
  requireSession: vi.fn(),
}));

const tx = {
  esquemaLiquidacion: { upsert: vi.fn(), deleteMany: vi.fn() },
  configuracionTaller: { upsert: vi.fn() },
  liquidacionMecanico: { create: vi.fn(), updateMany: vi.fn() },
  gasto: { create: vi.fn(), deleteMany: vi.fn() },
  auditLog: { create: vi.fn() },
};

const db = {
  usuario: { findMany: vi.fn(), findFirst: vi.fn() },
  configuracionTaller: { findUnique: vi.fn() },
  liquidacionMecanico: { findMany: vi.fn(), findFirst: vi.fn() },
  ordenTrabajo: { findMany: vi.fn() },
  categoriaGasto: { findUnique: vi.fn() },
  $transaction: (fn: (cliente: typeof tx) => unknown) => fn(tx),
};
vi.mock("@/lib/db/tenant-client", () => ({ getTenantDb: () => db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  actualizarAjusteLiquidacionAction,
  anularLiquidacionAction,
  generarLiquidacionesAction,
  getFrecuenciaLiquidacion,
  guardarEsquemaLiquidacionAction,
  guardarFrecuenciaLiquidacionAction,
  listLiquidacionesDelPeriodo,
  pagarLiquidacionAction,
  quitarEsquemaLiquidacionAction,
  reactivarLiquidacionAction,
  type AjusteLiquidacionFormState,
  type EsquemaLiquidacionFormState,
  type FrecuenciaLiquidacionFormState,
  type PagoLiquidacionFormState,
} from "./liquidacion-actions";

const inicial: EsquemaLiquidacionFormState = { error: null, success: false };
const inicialFrecuencia: FrecuenciaLiquidacionFormState = { error: null, success: false, advertencia: null };
const inicialAjuste: AjusteLiquidacionFormState = { error: null, success: false };
const inicialPago: PagoLiquidacionFormState = { error: null, success: false };
const ADMIN = { user: { id: "u1", role: "ADMIN", tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };

function fd(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [clave, valor] of Object.entries(campos)) f.set(clave, valor);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireRole.mockResolvedValue(ADMIN);
  db.usuario.findFirst.mockResolvedValue({ id: "t1" });
  db.usuario.findMany.mockResolvedValue([]);
  db.configuracionTaller.findUnique.mockResolvedValue({ frecuenciaLiquidacion: "MENSUAL" });
  db.liquidacionMecanico.findMany.mockResolvedValue([]);
  db.ordenTrabajo.findMany.mockResolvedValue([]);
  db.categoriaGasto.findUnique.mockResolvedValue({ id: "cat_liquidacion_mecanicos", activo: true });
  tx.esquemaLiquidacion.upsert.mockResolvedValue({});
  tx.esquemaLiquidacion.deleteMany.mockResolvedValue({ count: 1 });
  tx.configuracionTaller.upsert.mockResolvedValue({});
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

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
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
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
  });

  it("cae en el valor por defecto si el taller nunca guardó la configuración", async () => {
    db.configuracionTaller.findUnique.mockResolvedValue(null);

    await expect(getFrecuenciaLiquidacion()).resolves.toBe("MENSUAL");
  });
});

describe("guardarFrecuenciaLiquidacionAction", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-11T15:00:00.000Z"));
  });

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
    expect(r).toEqual({ error: null, success: true, advertencia: null });
  });

  it("avisa cuando ya hay liquidaciones del mes en curso", async () => {
    db.liquidacionMecanico.findMany.mockResolvedValue([{ periodo: "2026-10-Q1", frecuencia: "QUINCENAL" }]);

    const r = await guardarFrecuenciaLiquidacionAction(inicialFrecuencia, fd({ frecuencia: "MENSUAL" }));

    expect(r.success).toBe(true);
    expect(r.advertencia).toContain("Ya hay liquidaciones de este mes");
  });

  it("no avisa si las liquidaciones son de otro mes", async () => {
    db.liquidacionMecanico.findMany.mockResolvedValue([{ periodo: "2026-09", frecuencia: "MENSUAL" }]);

    const r = await guardarFrecuenciaLiquidacionAction(inicialFrecuencia, fd({ frecuencia: "MENSUAL" }));

    expect(r.advertencia).toBeNull();
  });

  it("no consulta liquidaciones si el guardado falla", async () => {
    tx.configuracionTaller.upsert.mockRejectedValue(new Error("db down"));

    const r = await guardarFrecuenciaLiquidacionAction(inicialFrecuencia, fd({ frecuencia: "QUINCENAL" }));

    expect(r.success).toBe(false);
    expect(db.liquidacionMecanico.findMany).not.toHaveBeenCalled();
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
const DOCUMENTO_PENDIENTE = {
  id: "l1",
  usuarioId: "t1",
  estado: "PENDIENTE",
  periodo: "2026-10",
  frecuencia: "MENSUAL",
  ordenes: 1,
  trabajos: 1,
  montoManoObra: 30000,
  montoCalculado: 12000,
  ajuste: 0,
  motivoAjuste: null,
  total: 12000,
  pagadaAt: null,
  gastoId: null,
  motivoAnulacion: null,
};

describe("listLiquidacionesDelPeriodo", () => {
  beforeEach(() => {
    db.usuario.findMany.mockResolvedValue([ANA]);
    db.ordenTrabajo.findMany.mockResolvedValue([ORDEN_DE_ANA]);
  });

  it("cruza la producción del periodo, el esquema vigente y el documento", async () => {
    const r = await listLiquidacionesDelPeriodo("2026-10");

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
    // La ventana es la del periodo, con la misma convención que el reporte.
    expect(db.ordenTrabajo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sedeId: "sede-1",
          estado: "ENTREGADA",
          entregadaAt: { gte: new Date("2026-10-01T00:00:00.000Z"), lt: new Date("2026-11-01T00:00:00.000Z") },
        },
      }),
    );
    expect(r.frecuencia).toBe("MENSUAL");
    expect(r.periodo).toBe("2026-10");
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
        documento: null,
      },
    ]);
  });

  it("marca al técnico sin esquema y no le calcula monto", async () => {
    db.usuario.findMany.mockResolvedValue([{ id: "t1", nombre: "Ana", esquemaLiquidacion: null }]);

    const [fila] = (await listLiquidacionesDelPeriodo("2026-10")).filas;

    expect(fila!.tipo).toBeNull();
    expect(fila!.montoSugerido).toBeNull();
  });

  it("avisa cuando el documento congelado ya no coincide con lo producido", async () => {
    db.liquidacionMecanico.findMany.mockResolvedValue([DOCUMENTO_PENDIENTE]);

    const [fila] = (await listLiquidacionesDelPeriodo("2026-10")).filas;

    expect(fila!.documento?.id).toBe("l1");
    expect(fila!.documento?.hayCambios).toBe(true);
  });

  it("marca solapada la liquidación de otro periodo que se pisa con este", async () => {
    db.liquidacionMecanico.findMany.mockResolvedValue([
      { ...DOCUMENTO_PENDIENTE, periodo: "2026-10", frecuencia: "MENSUAL" },
    ]);

    const [fila] = (await listLiquidacionesDelPeriodo("2026-10-Q1")).filas;

    expect(fila!.documento).toBeNull();
    expect(fila!.solapada).toBe(true);
  });

  it("una liquidación anulada no bloquea el periodo: su ventana vuelve a estar libre", async () => {
    db.liquidacionMecanico.findMany.mockResolvedValue([
      { ...DOCUMENTO_PENDIENTE, periodo: "2026-10", frecuencia: "MENSUAL", estado: "ANULADA" },
    ]);

    const [fila] = (await listLiquidacionesDelPeriodo("2026-10-Q1")).filas;

    expect(fila!.solapada).toBe(false);
  });

  it("acepta un periodo de una frecuencia que ya no es la del taller", async () => {
    db.configuracionTaller.findUnique.mockResolvedValue({ frecuenciaLiquidacion: "QUINCENAL" });

    const r = await listLiquidacionesDelPeriodo("2026-10");

    // La frecuencia sale del periodo, no del ajuste: si no, las liquidaciones
    // mensuales ya generadas quedarían inalcanzables al pasar a quincenal.
    expect(r.frecuencia).toBe("MENSUAL");
    expect(r.etiqueta).toBe("octubre de 2026");
    expect(r.error).toBeNull();
    expect(db.ordenTrabajo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entregadaAt: { gte: new Date("2026-10-01T00:00:00.000Z"), lt: new Date("2026-11-01T00:00:00.000Z") },
        }),
      }),
    );
  });

  it("incluye al técnico que ya no está en la sede pero tiene documento del periodo", async () => {
    db.liquidacionMecanico.findMany.mockResolvedValue([DOCUMENTO_PENDIENTE]);

    await listLiquidacionesDelPeriodo("2026-10");

    expect(db.usuario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { role: "TECNICO", sedes: { some: { sedeId: "sede-1" } } },
            { id: { in: ["t1"] } },
          ],
        },
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
    expect(r.sinAsignar).toBeNull();
    expect(db.ordenTrabajo.findMany).not.toHaveBeenCalled();
  });
});

describe("generarLiquidacionesAction", () => {
  beforeEach(() => {
    db.usuario.findMany.mockResolvedValue([ANA]);
    db.ordenTrabajo.findMany.mockResolvedValue([ORDEN_DE_ANA]);
  });

  it("crea la liquidación que falta con el esquema vigente y la audita", async () => {
    const r = await generarLiquidacionesAction("2026-10");

    expect(r).toEqual({
      error: null,
      generadas: 1,
      actualizadas: 0,
      omitidas: 0,
      sinEsquema: 0,
      solapadas: 0,
      ajustesDescartados: 0,
    });
    expect(tx.liquidacionMecanico.create).toHaveBeenCalledWith({
      data: {
        periodo: "2026-10",
        frecuencia: "MENSUAL",
        sedeId: "sede-1",
        usuarioId: "t1",
        estado: "PENDIENTE",
        ordenes: 1,
        trabajos: 2,
        montoManoObra: 45000,
        tipo: "PORCENTAJE",
        porcentaje: 40,
        montoFijo: null,
        montoCalculado: 18000,
        ajuste: 0,
        motivoAjuste: null,
        total: 18000,
        generadaPorId: "u1",
      },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tipo: "LIQUIDACION_GENERAR", entidadId: "l1", actorId: "u1" }),
    });
  });

  it("recalcula solo la pendiente cuyos números cambiaron", async () => {
    db.liquidacionMecanico.findMany.mockResolvedValue([DOCUMENTO_PENDIENTE]);

    const r = await generarLiquidacionesAction("2026-10");

    expect(r.actualizadas).toBe(1);
    expect(tx.liquidacionMecanico.create).not.toHaveBeenCalled();
    expect(tx.liquidacionMecanico.updateMany).toHaveBeenCalledWith({
      // El estado se revalida dentro de la transacción (nada de resucitar una
      // liquidación que otro acaba de pagar).
      where: { id: "l1", estado: { in: ["PENDIENTE", "ANULADA"] } },
      data: expect.objectContaining({
        estado: "PENDIENTE",
        trabajos: 2,
        montoManoObra: 45000,
        montoCalculado: 18000,
        total: 18000,
      }),
    });
  });

  it("no escribe nada si la liquidación cambió de estado mientras tanto", async () => {
    db.liquidacionMecanico.findMany.mockResolvedValue([DOCUMENTO_PENDIENTE]);
    tx.liquidacionMecanico.updateMany.mockResolvedValue({ count: 0 });

    const r = await generarLiquidacionesAction("2026-10");

    expect(r.actualizadas).toBe(0);
    expect(r.omitidas).toBe(1);
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("descarta el ajuste cuando dejaría el total en negativo", async () => {
    db.liquidacionMecanico.findMany.mockResolvedValue([{ ...DOCUMENTO_PENDIENTE, ajuste: -50000 }]);

    const r = await generarLiquidacionesAction("2026-10");

    expect(r.ajustesDescartados).toBe(1);
    expect(tx.liquidacionMecanico.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ajuste: 0, motivoAjuste: null, total: 18000 }),
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ detalle: expect.objectContaining({ ajusteDescartado: -50000 }) }),
    });
  });

  it("omite la que ya está igual", async () => {
    db.liquidacionMecanico.findMany.mockResolvedValue([
      { ...DOCUMENTO_PENDIENTE, ordenes: 1, trabajos: 2, montoManoObra: 45000, montoCalculado: 18000, total: 18000 },
    ]);

    const r = await generarLiquidacionesAction("2026-10");

    expect(r).toEqual({
      error: null,
      generadas: 0,
      actualizadas: 0,
      omitidas: 1,
      sinEsquema: 0,
      solapadas: 0,
      ajustesDescartados: 0,
    });
    expect(tx.liquidacionMecanico.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("no toca una liquidación pagada", async () => {
    db.liquidacionMecanico.findMany.mockResolvedValue([{ ...DOCUMENTO_PENDIENTE, estado: "PAGADA" }]);

    const r = await generarLiquidacionesAction("2026-10");

    expect(r.omitidas).toBe(1);
    expect(tx.liquidacionMecanico.updateMany).not.toHaveBeenCalled();
  });

  it("no reactiva una anulada: eso es explícito fila por fila", async () => {
    db.liquidacionMecanico.findMany.mockResolvedValue([
      { ...DOCUMENTO_PENDIENTE, estado: "ANULADA", motivoAnulacion: "se pagó por fuera" },
    ]);

    const r = await generarLiquidacionesAction("2026-10");

    expect(r.actualizadas).toBe(0);
    expect(r.omitidas).toBe(1);
    expect(tx.liquidacionMecanico.updateMany).not.toHaveBeenCalled();
  });

  it("omite al técnico sin esquema", async () => {
    db.usuario.findMany.mockResolvedValue([{ id: "t1", nombre: "Ana", esquemaLiquidacion: null }]);

    const r = await generarLiquidacionesAction("2026-10");

    expect(r).toEqual({
      error: null,
      generadas: 0,
      actualizadas: 0,
      omitidas: 0,
      sinEsquema: 1,
      solapadas: 0,
      ajustesDescartados: 0,
    });
    expect(tx.liquidacionMecanico.create).not.toHaveBeenCalled();
  });

  it("no crea una liquidación que se solapa con otro periodo (D6)", async () => {
    db.liquidacionMecanico.findMany.mockResolvedValue([{ ...DOCUMENTO_PENDIENTE, periodo: "2026-10" }]);

    const r = await generarLiquidacionesAction("2026-10-Q1");

    expect(r).toEqual({
      error: null,
      generadas: 0,
      actualizadas: 0,
      omitidas: 0,
      sinEsquema: 0,
      solapadas: 1,
      ajustesDescartados: 0,
    });
    expect(tx.liquidacionMecanico.create).not.toHaveBeenCalled();
  });

  it("rechaza un periodo inválido sin escribir", async () => {
    const r = await generarLiquidacionesAction("2026-13");

    expect(r.error).toBe("El periodo debe tener el formato AAAA-MM");
    expect(tx.liquidacionMecanico.create).not.toHaveBeenCalled();
  });
});

describe("actualizarAjusteLiquidacionAction", () => {
  beforeEach(() => {
    db.liquidacionMecanico.findFirst.mockResolvedValue({ id: "l1", estado: "PENDIENTE", montoCalculado: 18000 });
  });

  it("ajusta y recalcula el total, auditando el cambio", async () => {
    const r = await actualizarAjusteLiquidacionAction("l1", inicialAjuste, fd({ ajuste: "-3000", motivo: "Herramienta rota" }));

    expect(r).toEqual({ error: null, success: true });
    expect(db.liquidacionMecanico.findFirst).toHaveBeenCalledWith({
      where: { id: "l1", sedeId: "sede-1" },
      select: { id: true, estado: true, montoCalculado: true },
    });
    expect(tx.liquidacionMecanico.updateMany).toHaveBeenCalledWith({
      // Guardia de estado dentro de la transacción.
      where: { id: "l1", estado: "PENDIENTE" },
      data: { ajuste: -3000, motivoAjuste: "Herramienta rota", total: 15000 },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tipo: "LIQUIDACION_AJUSTAR", entidadId: "l1" }),
    });
  });

  it("no ajusta si dejó de estar pendiente entre la lectura y la escritura", async () => {
    tx.liquidacionMecanico.updateMany.mockResolvedValue({ count: 0 });

    const r = await actualizarAjusteLiquidacionAction("l1", inicialAjuste, fd({ ajuste: "3000", motivo: "Bono" }));

    expect(r.error).toBe("La liquidación ya no está pendiente");
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("exige motivo cuando hay ajuste", async () => {
    const r = await actualizarAjusteLiquidacionAction("l1", inicialAjuste, fd({ ajuste: "3000", motivo: "  " }));

    expect(r.error).toBe("Explica el motivo del ajuste");
    expect(tx.liquidacionMecanico.updateMany).not.toHaveBeenCalled();
  });

  it("no deja el total en negativo", async () => {
    const r = await actualizarAjusteLiquidacionAction("l1", inicialAjuste, fd({ ajuste: "-20000", motivo: "Descuento" }));

    expect(r.error).toBe("El ajuste no puede dejar el total en negativo");
    expect(tx.liquidacionMecanico.updateMany).not.toHaveBeenCalled();
  });

  it("no ajusta una liquidación que no está pendiente", async () => {
    db.liquidacionMecanico.findFirst.mockResolvedValue({ id: "l1", estado: "PAGADA", montoCalculado: 18000 });

    const r = await actualizarAjusteLiquidacionAction("l1", inicialAjuste, fd({ ajuste: "3000", motivo: "Bono" }));

    expect(r.error).toBe("Solo se puede ajustar una liquidación pendiente");
  });

  it("rechaza una liquidación de otra sede", async () => {
    db.liquidacionMecanico.findFirst.mockResolvedValue(null);

    const r = await actualizarAjusteLiquidacionAction("l-ajena", inicialAjuste, fd({ ajuste: "0", motivo: "" }));

    expect(r.error).toBe("Liquidación no encontrada");
  });
});

describe("pagarLiquidacionAction", () => {
  const DOCUMENTO_A_PAGAR = {
    id: "l1",
    estado: "PENDIENTE",
    total: 18000,
    periodo: "2026-10",
    frecuencia: "MENSUAL",
    usuario: { nombre: "Ana" },
    gastoId: null,
  };

  beforeEach(() => {
    db.liquidacionMecanico.findFirst.mockResolvedValue(DOCUMENTO_A_PAGAR);
  });

  it("crea el gasto de la sede con la categoría del sistema y marca la liquidación como pagada", async () => {
    const r = await pagarLiquidacionAction("l1", inicialPago, fd({ metodoPago: "EFECTIVO", referencia: "recibo 12", fecha: "2026-10-31" }));

    expect(r).toEqual({ error: null, success: true });
    expect(tx.gasto.create).toHaveBeenCalledWith({
      data: {
        sedeId: "sede-1",
        categoriaId: "cat_liquidacion_mecanicos",
        descripcion: "Liquidación Ana · octubre de 2026",
        monto: 18000,
        fecha: new Date("2026-10-31T00:00:00.000Z"),
        referencia: "recibo 12",
        registradoPorId: "u1",
        pagadoEnEfectivo: true,
      },
    });
    expect(tx.liquidacionMecanico.updateMany).toHaveBeenCalledWith({
      // Solo si sigue pendiente y sin gasto: dos pagos concurrentes no pueden
      // dejar dos gastos por el mismo trabajo.
      where: { id: "l1", estado: "PENDIENTE", gastoId: null },
      data: expect.objectContaining({ estado: "PAGADA", gastoId: "g1", pagadaPorId: "u1" }),
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tipo: "LIQUIDACION_PAGAR", entidadId: "l1" }),
    });
  });

  it("una transferencia no cuenta como efectivo de la caja", async () => {
    await pagarLiquidacionAction("l1", inicialPago, fd({ metodoPago: "TRANSFERENCIA", referencia: "", fecha: "2026-10-31" }));

    expect(tx.gasto.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ pagadoEnEfectivo: false, referencia: null }) }),
    );
  });

  it("no paga dos veces la misma liquidación", async () => {
    db.liquidacionMecanico.findFirst.mockResolvedValue({ ...DOCUMENTO_A_PAGAR, estado: "PAGADA" });

    const r = await pagarLiquidacionAction("l1", inicialPago, fd({ metodoPago: "EFECTIVO", referencia: "", fecha: "2026-10-31" }));

    expect(r.error).toBe("Solo se puede pagar una liquidación pendiente");
    expect(tx.gasto.create).not.toHaveBeenCalled();
  });

  it("no paga una pendiente que ya tiene gasto (sería un segundo pago)", async () => {    db.liquidacionMecanico.findFirst.mockResolvedValue({ ...DOCUMENTO_A_PAGAR, gastoId: "g-viejo" });

    const r = await pagarLiquidacionAction("l1", inicialPago, fd({ metodoPago: "EFECTIVO", referencia: "", fecha: "2026-10-31" }));

    expect(r.error).toContain("ya tiene un gasto asociado");
    expect(tx.gasto.create).not.toHaveBeenCalled();
  });

  it("no paga una liquidación de monto no positivo", async () => {
    db.liquidacionMecanico.findFirst.mockResolvedValue({ ...DOCUMENTO_A_PAGAR, total: 0 });

    const r = await pagarLiquidacionAction("l1", inicialPago, fd({ metodoPago: "EFECTIVO", referencia: "", fecha: "2026-10-31" }));

    expect(r.error).toBe("El total de la liquidación debe ser mayor que cero antes de pagarla");
    expect(tx.gasto.create).not.toHaveBeenCalled();
  });

  it("no paga si la liquidación dejó de estar pendiente entre la lectura y la escritura", async () => {
    tx.liquidacionMecanico.updateMany.mockResolvedValue({ count: 0 });

    const r = await pagarLiquidacionAction("l1", inicialPago, fd({ metodoPago: "EFECTIVO", referencia: "", fecha: "2026-10-31" }));

    expect(r.error).toBe("La liquidación ya no está pendiente");
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("avisa si la categoría del sistema no existe (migración sin aplicar)", async () => {
    db.categoriaGasto.findUnique.mockResolvedValue(null);

    const r = await pagarLiquidacionAction("l1", inicialPago, fd({ metodoPago: "EFECTIVO", referencia: "", fecha: "2026-10-31" }));

    expect(r.error).toBe("Falta la categoría de gasto del sistema: aplica la migración de la fase 19");
    expect(tx.gasto.create).not.toHaveBeenCalled();
  });

  it("avisa si la categoría del sistema está desactivada", async () => {
    db.categoriaGasto.findUnique.mockResolvedValue({ id: "cat_liquidacion_mecanicos", activo: false });

    const r = await pagarLiquidacionAction("l1", inicialPago, fd({ metodoPago: "EFECTIVO", referencia: "", fecha: "2026-10-31" }));

    expect(r.error).toContain("está desactivada");
    expect(tx.gasto.create).not.toHaveBeenCalled();
  });

  it("rechaza un método de pago inválido", async () => {
    const r = await pagarLiquidacionAction("l1", inicialPago, fd({ metodoPago: "ANTICIPO", referencia: "", fecha: "2026-10-31" }));

    expect(r.error).toBe("Método de pago inválido");
    expect(db.liquidacionMecanico.findFirst).not.toHaveBeenCalled();
  });
});

describe("anularLiquidacionAction", () => {
  it("anula una pendiente con su motivo", async () => {
    db.liquidacionMecanico.findFirst.mockResolvedValue({ id: "l1", estado: "PENDIENTE", gastoId: null });

    const r = await anularLiquidacionAction("l1", "Se pagó por fuera");

    expect(r).toEqual({ error: null });
    expect(tx.gasto.deleteMany).not.toHaveBeenCalled();
    expect(tx.liquidacionMecanico.updateMany).toHaveBeenCalledWith({
      where: { id: "l1", estado: { not: "ANULADA" } },
      data: expect.objectContaining({ estado: "ANULADA", motivoAnulacion: "Se pagó por fuera", anuladaPorId: "u1" }),
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tipo: "LIQUIDACION_ANULAR", entidadId: "l1" }),
    });
  });

  it("anular una pagada borra su gasto en la misma transacción", async () => {
    db.liquidacionMecanico.findFirst.mockResolvedValue({ id: "l1", estado: "PAGADA", gastoId: "g1" });

    const r = await anularLiquidacionAction("l1", "Se pagó dos veces");

    expect(r).toEqual({ error: null });
    expect(tx.gasto.deleteMany).toHaveBeenCalledWith({ where: { id: "g1" } });
    expect(tx.liquidacionMecanico.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: "ANULADA", gastoId: null }) }),
    );
  });

  it("no anula si cambió de estado entre la lectura y la escritura", async () => {
    db.liquidacionMecanico.findFirst.mockResolvedValue({ id: "l1", estado: "PENDIENTE", gastoId: null });
    tx.liquidacionMecanico.updateMany.mockResolvedValue({ count: 0 });

    const r = await anularLiquidacionAction("l1", "Motivo");

    expect(r.error).toBe("La liquidación ya está anulada");
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("exige el motivo", async () => {
    const r = await anularLiquidacionAction("l1", "   ");

    expect(r.error).toBe("Explica por qué se anula la liquidación");
    expect(db.liquidacionMecanico.findFirst).not.toHaveBeenCalled();
  });

  it("no anula dos veces", async () => {
    db.liquidacionMecanico.findFirst.mockResolvedValue({ id: "l1", estado: "ANULADA", gastoId: null });

    const r = await anularLiquidacionAction("l1", "Otra vez");

    expect(r.error).toBe("La liquidación ya está anulada");
  });

  it("rechaza una liquidación de otra sede", async () => {
    db.liquidacionMecanico.findFirst.mockResolvedValue(null);

    const r = await anularLiquidacionAction("l-ajena", "Motivo");

    expect(r.error).toBe("Liquidación no encontrada");
  });
});

describe("reactivarLiquidacionAction", () => {
  beforeEach(() => {
    db.liquidacionMecanico.findFirst.mockResolvedValue({
      id: "l1",
      estado: "ANULADA",
      periodo: "2026-10",
      frecuencia: "MENSUAL",
      usuarioId: "t1",
    });
    db.usuario.findMany.mockResolvedValue([ANA]);
    db.ordenTrabajo.findMany.mockResolvedValue([ORDEN_DE_ANA]);
  });

  it("reactiva recalculando con el esquema vigente y limpiando el ciclo anterior", async () => {
    const r = await reactivarLiquidacionAction("l1");

    expect(r).toEqual({ error: null });
    expect(tx.liquidacionMecanico.updateMany).toHaveBeenCalledWith({
      where: { id: "l1", estado: "ANULADA" },
      data: expect.objectContaining({
        estado: "PENDIENTE",
        trabajos: 2,
        montoManoObra: 45000,
        montoCalculado: 18000,
        // Nada del ciclo anterior sobrevive: ajuste, pago ni anulación.
        ajuste: 0,
        motivoAjuste: null,
        total: 18000,
        pagadaAt: null,
        pagadaPorId: null,
        gastoId: null,
        anuladaAt: null,
        anuladaPorId: null,
        motivoAnulacion: null,
      }),
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: "LIQUIDACION_GENERAR",
        entidadId: "l1",
        detalle: expect.objectContaining({ reactivada: true }),
      }),
    });
  });

  it("solo reactiva lo que está anulado", async () => {
    db.liquidacionMecanico.findFirst.mockResolvedValue({
      id: "l1",
      estado: "PENDIENTE",
      periodo: "2026-10",
      frecuencia: "MENSUAL",
      usuarioId: "t1",
    });

    const r = await reactivarLiquidacionAction("l1");

    expect(r.error).toBe("Solo se puede reactivar una liquidación anulada");
    expect(tx.liquidacionMecanico.updateMany).not.toHaveBeenCalled();
  });

  it("no reactiva a un técnico sin esquema vigente", async () => {
    db.usuario.findMany.mockResolvedValue([{ id: "t1", nombre: "Ana", esquemaLiquidacion: null }]);

    const r = await reactivarLiquidacionAction("l1");

    expect(r.error).toContain("no tiene esquema de pago");
    expect(tx.liquidacionMecanico.updateMany).not.toHaveBeenCalled();
  });

  it("no reactiva si la ventana ya está liquidada en otro documento", async () => {
    db.liquidacionMecanico.findMany.mockResolvedValue([
      { ...DOCUMENTO_PENDIENTE, periodo: "2026-10-Q1", frecuencia: "QUINCENAL" },
    ]);

    const r = await reactivarLiquidacionAction("l1");

    expect(r.error).toContain("ya está liquidado en otro documento");
    expect(tx.liquidacionMecanico.updateMany).not.toHaveBeenCalled();
  });

  it("rechaza una liquidación de otra sede", async () => {
    db.liquidacionMecanico.findFirst.mockResolvedValue(null);

    const r = await reactivarLiquidacionAction("l-ajena");

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
