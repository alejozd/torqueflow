import { describe, expect, it } from "vitest";
import type { Contexto, TenantDb } from "./contexto";
import { ejecutarPlan, MANEJADORES, recortarAlPresente } from "./ejecutor";
import type { PlanDia } from "./tipos";

const ctx = { sedes: [{ id: "s1", nombre: "Principal" }] } as unknown as Contexto;

function dbFalsa() {
  let transacciones = 0;
  const db = {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      transacciones++;
      return fn({});
    },
  } as unknown as TenantDb;
  return { db, cuenta: () => transacciones };
}

const dia = (fecha: string, ...tipos: string[]): PlanDia => ({
  fecha, sedeId: "s1",
  eventos: tipos.map((tipo, i) => ({ tipo, hora: `0${8 + i}:00` }) as PlanDia["eventos"][number]),
});

describe("ejecutarPlan", () => {
  it("una transacción por día, despacha y cuenta omitidos", async () => {
    const { db, cuenta } = dbFalsa();
    const vistos: string[] = [];
    MANEJADORES.gasto = async (_tx, _c, estado, d, e) => {
      vistos.push(`${d.fecha}:${e.tipo}`);
      estado.creados.gasto = (estado.creados.gasto ?? 0) + 1;
    };
    try {
      const estado = await ejecutarPlan(db, ctx, [dia("2026-10-19", "gasto", "liquidacion"), dia("2026-10-20", "gasto")], 1, () => {});
      expect(cuenta()).toBe(2);
      expect(vistos).toEqual(["2026-10-19:gasto", "2026-10-20:gasto"]);
      expect(estado.creados.gasto).toBe(2);
      expect(estado.creados["omitido:liquidacion"]).toBe(1);
    } finally {
      delete MANEJADORES.gasto;
    }
  });

  it("si falla el día 2 reporta fecha y tipo y no ejecuta el día 3", async () => {
    const { db } = dbFalsa();
    const vistos: string[] = [];
    MANEJADORES.gasto = async (_tx, _c, _e, d) => {
      vistos.push(d.fecha);
      if (d.fecha === "2026-10-20") throw new Error("boom");
    };
    try {
      await expect(
        ejecutarPlan(db, ctx, [dia("2026-10-19", "gasto"), dia("2026-10-20", "gasto"), dia("2026-10-21", "gasto")], 1, () => {}),
      ).rejects.toThrow('Falló el 2026-10-20 (sede Principal) en "gasto": boom');
      expect(vistos).toEqual(["2026-10-19", "2026-10-20"]);
    } finally {
      delete MANEJADORES.gasto;
    }
  });
});

describe("recortarAlPresente", () => {
  const hoy = "2026-10-22";
  const plan: PlanDia[] = [
    {
      fecha: "2026-10-21", sedeId: "s1",
      eventos: [{ tipo: "gasto", hora: "17:00", efectivo: true }],
    },
    {
      fecha: hoy, sedeId: "s1",
      eventos: [
        { tipo: "abrirCaja", hora: "17:30" },
        { tipo: "gasto", hora: "09:00", efectivo: false },
        { tipo: "crearOrden", hora: "09:30", clave: "o1", borrador: false, conAnticipo: false },
        { tipo: "crearOrden", hora: "15:00", clave: "o2", borrador: false, conAnticipo: false },
        { tipo: "cita", hora: "09:45", estado: "COMPLETADA", ordenClave: "o2" },
        { tipo: "cotizacion", hora: "09:50", destino: "APROBADA", ordenClave: "o1" },
        { tipo: "terminarOrden", hora: "16:00", clave: "o2" },
      ],
    },
  ];

  it("quita lo posterior a la hora actual, conserva abrirCaja y no toca otros días", () => {
    const r = recortarAlPresente(plan, hoy, "10:00");
    expect(r[0]).toEqual(plan[0]);
    expect(r[1].eventos.map((e) => e.tipo)).toEqual(["abrirCaja", "gasto", "crearOrden", "cotizacion"]);
  });

  it("quita eventos enlazados a una orden descartada, incluso en otros días", () => {
    const conOtroDia: PlanDia[] = [
      plan[1],
      { fecha: "2026-10-23", sedeId: "s1", eventos: [{ tipo: "entregarOrden", hora: "08:00", clave: "o2", pago: "COMPLETO", garantia: false }] },
    ];
    const r = recortarAlPresente(conOtroDia, hoy, "10:00");
    expect(r[1].eventos).toEqual([]);
    expect(r[0].eventos.some((e) => e.tipo === "cita")).toBe(false);
  });

  it("no muta el plan original", () => {
    recortarAlPresente(plan, hoy, "10:00");
    expect(plan[1].eventos.length).toBe(7);
  });
});
