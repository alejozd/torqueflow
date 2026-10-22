import { describe, expect, it, vi } from "vitest";
import { crearAzar } from "./azar";
import { crearCliente, elegirClienteYVehiculo } from "./clientes";
import type { Contexto } from "./contexto";
import type { EstadoEjecucion, TenantTx } from "./ejecutor";
import type { PlanDia } from "./tipos";

const nuevoEstado = (): EstadoEjecucion => ({
  ordenes: new Map(), cajaAbierta: new Map(), creados: {},
  clientesCreados: [], clientesUsados: new Set(), citasPorOrden: new Map(),
});
const dia: PlanDia = { fecha: "2026-10-20", sedeId: "s1", eventos: [] };

function txFalsa() {
  let n = 0;
  const vehiculos: Record<string, unknown>[] = [];
  const clientes: Record<string, unknown>[] = [];
  const tx = {
    cliente: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { clientes.push(data); return { id: `c${++n}` }; }) },
    vehiculo: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { vehiculos.push(data); return { id: `v${++n}` }; }) },
    marcaVehiculo: { findMany: vi.fn(async () => [{ id: "m1", nombre: "Mazda", modelos: [{ id: "mo1", nombre: "3" }] }]) },
  } as unknown as TenantTx;
  return { tx, vehiculos, clientes };
}

const ctxCon = (placas: string[], existentes: Contexto["clientesExistentes"] = []) =>
  ({ placasOcupadas: new Set(placas), clientesExistentes: existentes }) as unknown as Contexto;

describe("crearCliente", () => {
  it("nunca repite placas ocupadas, las agrega al set, usa @ejemplo.test y marca", async () => {
    const protegidas = ["JKT482", "MRW615", "HBL290", "DFN734"];
    const ctx = ctxCon(protegidas);
    const { tx, vehiculos, clientes } = txFalsa();
    const estado = nuevoEstado();
    const az = crearAzar(7);
    for (let i = 0; i < 40; i++) {
      await crearCliente(tx, ctx, estado, dia, { tipo: "crearCliente", hora: "09:00" }, az);
    }
    const placas = vehiculos.map((v) => v.placa as string);
    expect(new Set(placas).size).toBe(placas.length);
    for (const p of placas) {
      expect(protegidas).not.toContain(p);
      expect(ctx.placasOcupadas.has(p)).toBe(true);
    }
    expect(vehiculos.every((v) => (v.observaciones as string).includes("[datos-semana]"))).toBe(true);
    expect(clientes.every((c) => (c.email as string).endsWith("@ejemplo.test"))).toBe(true);
    expect(estado.clientesCreados).toHaveLength(40);
    expect(vehiculos.length).toBeGreaterThanOrEqual(40);
    expect(vehiculos.length).toBeLessThanOrEqual(80);
  });

  it("los vencimientos caen 5 a 40 días después, como medianoche UTC", async () => {
    const { tx, vehiculos } = txFalsa();
    const az = crearAzar(3);
    for (let i = 0; i < 60; i++) {
      await crearCliente(tx, ctxCon([]), nuevoEstado(), dia, { tipo: "crearCliente", hora: "09:00" }, az);
    }
    const fechas = vehiculos.flatMap((v) => [v.soatVence, v.tecnomecanicaVence]).filter(Boolean) as Date[];
    expect(fechas.length).toBeGreaterThan(0);
    for (const f of fechas) {
      const dias = (f.getTime() - Date.UTC(2026, 9, 20)) / 86_400_000;
      expect(dias).toBeGreaterThanOrEqual(5);
      expect(dias).toBeLessThanOrEqual(40);
    }
  });
});

describe("elegirClienteYVehiculo", () => {
  it("usa primero los creados por el script y luego los existentes con vehículo", async () => {
    const existentes = [{ id: "e1", vehiculoIds: ["ev1"] }, { id: "sin", vehiculoIds: [] }];
    const estado = nuevoEstado();
    estado.clientesCreados.push({ clienteId: "n1", vehiculoIds: ["nv1"] });
    const { tx } = txFalsa();
    const az = crearAzar(5);
    const ctx = ctxCon([], existentes);
    expect(await elegirClienteYVehiculo(tx, ctx, estado, az, dia.fecha)).toEqual({ clienteId: "n1", vehiculoId: "nv1" });
    for (let i = 0; i < 20; i++) {
      expect(await elegirClienteYVehiculo(tx, ctx, estado, az, dia.fecha)).toEqual({ clienteId: "e1", vehiculoId: "ev1" });
    }
  });

  it("nunca devuelve el protegido (el contexto ya lo excluye) ni crea si hay existentes", async () => {
    const { tx, clientes } = txFalsa();
    const r = await elegirClienteYVehiculo(tx, ctxCon([], [{ id: "e1", vehiculoIds: ["ev1"] }]), nuevoEstado(), crearAzar(9), dia.fecha);
    expect(r.clienteId).not.toBe("protegido");
    expect(clientes).toHaveLength(0);
  });

  it("si no hay ninguno crea uno nuevo", async () => {
    const { tx, clientes } = txFalsa();
    const estado = nuevoEstado();
    const r = await elegirClienteYVehiculo(tx, ctxCon([]), estado, crearAzar(2), dia.fecha);
    expect(clientes).toHaveLength(1);
    expect(r.clienteId).toBe("c1");
    expect(estado.clientesCreados).toHaveLength(1);
  });
});
