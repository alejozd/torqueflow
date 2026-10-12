import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...a: unknown[]) => mockRequireRole(...a),
  requireSession: vi.fn(),
}));

const tx = {
  esquemaLiquidacion: { upsert: vi.fn() },
  configuracionTaller: { upsert: vi.fn() },
  auditLog: { create: vi.fn() },
};

const db = {
  usuario: { findMany: vi.fn(), findFirst: vi.fn() },
  configuracionTaller: { findUnique: vi.fn() },
  liquidacionMecanico: { findMany: vi.fn() },
  $transaction: (fn: (cliente: typeof tx) => unknown) => fn(tx),
};
vi.mock("@/lib/db/tenant-client", () => ({ getTenantDb: () => db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  getFrecuenciaLiquidacion,
  guardarEsquemaLiquidacionAction,
  guardarFrecuenciaLiquidacionAction,
  listTecnicosConEsquema,
  type EsquemaLiquidacionFormState,
  type FrecuenciaLiquidacionFormState,
} from "./liquidacion-actions";

const inicial: EsquemaLiquidacionFormState = { error: null, success: false };
const inicialFrecuencia: FrecuenciaLiquidacionFormState = { error: null, success: false, advertencia: null };
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
  db.configuracionTaller.findUnique.mockResolvedValue({ frecuenciaLiquidacion: "MENSUAL" });
  db.liquidacionMecanico.findMany.mockResolvedValue([]);
  tx.esquemaLiquidacion.upsert.mockResolvedValue({});
  tx.configuracionTaller.upsert.mockResolvedValue({});
  tx.auditLog.create.mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("listTecnicosConEsquema", () => {
  it("lista los técnicos de la sede activa con su esquema, sin traer la fila completa", async () => {
    db.usuario.findMany.mockResolvedValue([
      {
        id: "t1",
        nombre: "Ana",
        esquemaLiquidacion: { tipo: "PORCENTAJE", porcentaje: 40, montoFijo: null },
      },
      { id: "t2", nombre: "Beto", esquemaLiquidacion: null },
    ]);

    const filas = await listTecnicosConEsquema();

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
    expect(db.usuario.findMany).toHaveBeenCalledWith({
      where: { role: "TECNICO", sedes: { some: { sedeId: "sede-1" } } },
      select: {
        id: true,
        nombre: true,
        esquemaLiquidacion: { select: { tipo: true, porcentaje: true, montoFijo: true } },
      },
      orderBy: { nombre: "asc" },
    });
    expect(filas).toEqual([
      { usuarioId: "t1", nombre: "Ana", tipo: "PORCENTAJE", porcentaje: 40, montoFijo: null },
      { usuarioId: "t2", nombre: "Beto", tipo: null, porcentaje: null, montoFijo: null },
    ]);
  });

  it("convierte los Decimal del esquema a número", async () => {
    db.usuario.findMany.mockResolvedValue([
      {
        id: "t1",
        nombre: "Ana",
        esquemaLiquidacion: { tipo: "MIXTO", porcentaje: "12.5", montoFijo: "800000.00" },
      },
    ]);

    const [fila] = await listTecnicosConEsquema();

    expect(fila).toEqual({ usuarioId: "t1", nombre: "Ana", tipo: "MIXTO", porcentaje: 12.5, montoFijo: 800000 });
  });
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
