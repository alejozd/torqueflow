import { describe, expect, it, vi } from "vitest";
import { crearAzar } from "./azar";
import { MARCA, type Contexto } from "./contexto";
import { registrarLiquidacion } from "./liquidaciones";
import { conCaja, nuevoEstado } from "./soporte-pruebas";
import type { TenantTx } from "./ejecutor";
import type { Evento, PlanDia } from "./tipos";

type Fila = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const dia: PlanDia = { fecha: "2026-10-20", sedeId: "s1", eventos: [] };
const evento = { tipo: "liquidacion", hora: "17:20" } as Extract<Evento, { tipo: "liquidacion" }>;
const ctx = { actorId: "adm1", recepcionistaId: "rec1" } as unknown as Contexto;

const esquema = (tipo: string, porcentaje: number | null, montoFijo: number | null) => ({ tipo, porcentaje, montoFijo });

function escenario(tecnicos: { id: string; nombre: string; esquemaLiquidacion: Fila | null }[], opciones: { pagadas?: Fila[] } = {}) {
  const gastos: Fila[] = [];
  const liquidaciones: Fila[] = [...(opciones.pagadas ?? [])];
  const auditoria: Fila[] = [];
  const tx = {
    configuracionTaller: { findUnique: vi.fn(async () => ({ frecuenciaLiquidacion: "MENSUAL" })) },
    categoriaGasto: { findUnique: vi.fn(async () => ({ id: "cat_liquidacion_mecanicos", activo: true })) },
    liquidacionMecanico: {
      findMany: vi.fn(async () => liquidaciones.filter((l) => l.estado === "PAGADA")),
      findUnique: vi.fn(async () => null),
      create: vi.fn(async (a: { data: Fila }) => { const f = { id: `l${liquidaciones.length + 1}`, ...a.data }; liquidaciones.push(f); return f; }),
    },
    usuario: { findMany: vi.fn(async () => tecnicos) },
    ordenTrabajo: {
      findMany: vi.fn(async () => [{
        mecanicoId: "m1", mecanico: { nombre: "Mario" },
        manoDeObra: [{ valor: 100_000, mecanicoId: "m1", mecanico: { nombre: "Mario" } }, { valor: 50_000, mecanicoId: "m2", mecanico: { nombre: "Lucía" } }],
      }]),
    },
    gasto: { create: vi.fn(async (a: { data: Fila }) => { const f = { id: `g${gastos.length + 1}`, ...a.data }; gastos.push(f); return f; }) },
    auditLog: { create: vi.fn(async (a: { data: Fila }) => { auditoria.push(a.data); return a.data; }) },
  };
  return { tx: tx as unknown as TenantTx, gastos, liquidaciones, auditoria };
}

describe("registrarLiquidacion", () => {
  it("paga solo a los mecánicos con esquema: gasto marcado con el monto de calcularMontoLiquidacion y documento PAGADA", async () => {
    const e = escenario([
      { id: "m1", nombre: "Mario", esquemaLiquidacion: esquema("PORCENTAJE", 40, null) },
      { id: "m2", nombre: "Lucía", esquemaLiquidacion: esquema("MIXTO", 10, 20_000) },
      { id: "m3", nombre: "Sin esquema", esquemaLiquidacion: null },
    ]);
    const estado = nuevoEstado();
    conCaja(estado);
    await registrarLiquidacion(e.tx, ctx, estado, dia, evento, crearAzar(1));
    expect(e.gastos.map((g) => g.monto).sort()).toEqual([25_000, 40_000]); // 40 % de 100.000 ; 20.000 + 10 % de 50.000
    expect(e.liquidaciones).toHaveLength(2);
    for (const l of e.liquidaciones) {
      expect(l).toMatchObject({ estado: "PAGADA", periodo: "2026-10", frecuencia: "MENSUAL", sedeId: "s1", ajuste: 0 });
      expect(l.total).toBe(l.montoCalculado);
      expect(l.gastoId).toBeTruthy();
    }
    for (const g of e.gastos) {
      expect(g.descripcion.startsWith(MARCA)).toBe(true);
      expect(g.categoriaId).toBe("cat_liquidacion_mecanicos");
      expect(g.fecha).toEqual(new Date("2026-10-20T00:00:00.000Z"));
      expect(g.createdAt).toEqual(new Date("2026-10-20T17:20:00-05:00"));
      expect(g.registradoPorId).toBe("adm1");
    }
    expect(e.auditoria.map((a) => a.tipo)).toEqual(["LIQUIDACION_PAGAR", "LIQUIDACION_PAGAR"]);
    expect(estado.creados.liquidacion).toBe(2);
  });

  it("sin caja abierta nunca paga en efectivo", async () => {
    for (let semilla = 1; semilla <= 20; semilla++) {
      const e = escenario([{ id: "m1", nombre: "Mario", esquemaLiquidacion: esquema("PORCENTAJE", 40, null) }]);
      await registrarLiquidacion(e.tx, ctx, nuevoEstado(), dia, evento, crearAzar(semilla));
      expect(e.gastos.every((g) => g.pagadoEnEfectivo === false && g.referencia.startsWith(MARCA))).toBe(true);
    }
  });

  it("si nadie tiene esquema avisa y omite sin fallar", async () => {
    const e = escenario([{ id: "m1", nombre: "Mario", esquemaLiquidacion: null }]);
    const estado = nuevoEstado();
    await registrarLiquidacion(e.tx, ctx, estado, dia, evento, crearAzar(1));
    expect(e.gastos).toHaveLength(0);
    expect(estado.advertencias).toHaveLength(1);
    expect(estado.advertencias![0]).toContain("esquema");
    expect(estado.creados["omitido:liquidacion"]).toBe(1);
  });

  it("no vuelve a pagar un periodo ya pagado del mismo técnico", async () => {
    const e = escenario(
      [{ id: "m1", nombre: "Mario", esquemaLiquidacion: esquema("PORCENTAJE", 40, null) }],
      { pagadas: [{ id: "lx", usuarioId: "m1", periodo: "2026-10", frecuencia: "MENSUAL", estado: "PAGADA", montoCalculado: 1, ajuste: 0, motivoAjuste: null, total: 1, pagadaAt: new Date() }] },
    );
    await registrarLiquidacion(e.tx, ctx, nuevoEstado(), dia, evento, crearAzar(1));
    expect(e.gastos).toHaveLength(0);
  });
});
