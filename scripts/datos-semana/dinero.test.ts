import { describe, expect, it, vi } from "vitest";
import { crearAzar } from "./azar";
import type { Contexto } from "./contexto";
import { abrirCaja, cerrarCaja } from "./dinero";
import type { EstadoEjecucion, TenantTx } from "./ejecutor";
import type { PlanDia } from "./tipos";

const ctx = { recepcionistaId: "rec1" } as unknown as Contexto;
const dia: PlanDia = { fecha: "2026-10-20", sedeId: "s1", eventos: [] };
const nuevoEstado = (): EstadoEjecucion => ({
  ordenes: new Map(), cajaAbierta: new Map(), creados: {},
  clientesCreados: [], clientesUsados: new Set(), citasPorOrden: new Map(),
});
const vacio = () => ({ findMany: vi.fn(async () => []) });

describe("abrirCaja", () => {
  it("crea la sesión con sede, base > 0, hora de Bogotá y la registra", async () => {
    const create = vi.fn(async (_a: unknown) => ({ id: "c1" }));
    const tx = { cajaSesion: { findFirst: vi.fn(async () => null), create } } as unknown as TenantTx;
    const estado = nuevoEstado();
    await abrirCaja(tx, ctx, estado, dia, { tipo: "abrirCaja", hora: "07:45" }, crearAzar(1));
    const data = (create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(data.sedeId).toBe("s1");
    expect(data.baseInicial as number).toBeGreaterThan(0);
    expect(data.abiertaAt).toEqual(new Date("2026-10-20T07:45:00-05:00"));
    expect(data.notas).toContain("[datos-semana]");
    expect(estado.cajaAbierta.get("s1")).toBe("c1");
  });

  it("no toca una caja ya abierta en la sede", async () => {
    const create = vi.fn();
    const tx = { cajaSesion: { findFirst: vi.fn(async () => ({ id: "real" })), create } } as unknown as TenantTx;
    const estado = nuevoEstado();
    await abrirCaja(tx, ctx, estado, dia, { tipo: "abrirCaja", hora: "07:45" }, crearAzar(1));
    expect(create).not.toHaveBeenCalled();
    expect(estado.cajaAbierta.size).toBe(0);
  });
});

describe("cerrarCaja", () => {
  it("calcula el esperado con los movimientos en efectivo y guarda contado = esperado + diferencia", async () => {
    const updateMany = vi.fn(async (_a: unknown) => ({ count: 1 }));
    const tx = {
      cajaSesion: {
        findUnique: vi.fn(async () => ({
          id: "c1", sedeId: "s1", baseInicial: 100000, abiertaAt: new Date("2026-10-20T12:45:00Z"), cerradaAt: null,
        })),
        updateMany,
      },
      pago: { findMany: vi.fn(async () => [{ monto: 50000, metodoPago: "EFECTIVO" }, { monto: 99000, metodoPago: "TARJETA" }]) },
      anticipo: vacio(),
      gasto: { findMany: vi.fn(async () => [{ monto: 20000 }]) },
      pagoVentaMostrador: { findMany: vi.fn(async () => [{ monto: 10000, metodoPago: "EFECTIVO" }]) },
      devolucionMostrador: vacio(),
      pagoProveedor: vacio(),
    } as unknown as TenantTx;
    const estado = nuevoEstado();
    estado.cajaAbierta.set("s1", "c1");
    await cerrarCaja(tx, ctx, estado, dia, { tipo: "cerrarCaja", hora: "17:30", diferencia: -2000 }, crearAzar(1));
    const data = (updateMany.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    // 100000 + 50000 + 10000 - 20000 = 140000
    expect(data.efectivoEsperado).toBe(140000);
    expect(data.efectivoContado).toBe(138000);
    expect(data.cerradaAt).toEqual(new Date("2026-10-20T17:30:00-05:00"));
    expect(estado.cajaAbierta.has("s1")).toBe(false);
  });

  it("sin caja abierta por el script no hace nada", async () => {
    const findUnique = vi.fn();
    const tx = { cajaSesion: { findUnique } } as unknown as TenantTx;
    await cerrarCaja(tx, ctx, nuevoEstado(), dia, { tipo: "cerrarCaja", hora: "17:30", diferencia: 0 }, crearAzar(1));
    expect(findUnique).not.toHaveBeenCalled();
  });
});
