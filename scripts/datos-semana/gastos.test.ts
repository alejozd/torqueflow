import { describe, expect, it } from "vitest";
import { crearAzar } from "./azar";
import { registrarGasto, registrarGastosRecurrentes } from "./gastos";
import { conCaja, nuevaBase, nuevoCtx, nuevoEstado } from "./soporte-pruebas";
import type { Evento, PlanDia } from "./tipos";

const dia: PlanDia = { fecha: "2026-10-20", sedeId: "s1", eventos: [] };
const gasto = (efectivo: boolean) => ({ tipo: "gasto", hora: "15:30", efectivo }) as Extract<Evento, { tipo: "gasto" }>;
const recurrentes = { tipo: "gastosRecurrentes", hora: "08:30" } as Extract<Evento, { tipo: "gastosRecurrentes" }>;

describe("registrarGasto", () => {
  it("en efectivo con caja abierta sale del cajón; la fecha es solo día (@db.Date) y createdAt el instante", async () => {
    const ctx = nuevoCtx({ categorias: ["Papelería", "Aseo", "Alimentación"] });
    const { tx, db } = nuevaBase();
    const estado = nuevoEstado();
    conCaja(estado);
    await registrarGasto(tx, ctx, estado, dia, gasto(true), crearAzar(1));
    const g = db.gastos[0]!;
    expect(g.pagadoEnEfectivo).toBe(true);
    expect(g.fecha).toEqual(new Date("2026-10-20T00:00:00.000Z"));
    expect(g.createdAt).toEqual(new Date("2026-10-20T15:30:00-05:00"));
    expect(g.descripcion.startsWith("[datos-semana]")).toBe(true);
    expect(g.monto).toBeGreaterThan(0);
    expect(g.sedeId).toBe("s1");
    expect(g.registradoPorId).toBe("rec1");
    expect(ctx.categoriasGasto.map((c) => c.id)).toContain(g.categoriaId);
  });

  it("sin caja abierta nunca queda en efectivo: va por transferencia con referencia", async () => {
    for (let semilla = 1; semilla <= 10; semilla++) {
      const ctx = nuevoCtx({ categorias: ["Papelería", "Aseo", "Alimentación"] });
      const { tx, db } = nuevaBase();
      await registrarGasto(tx, ctx, nuevoEstado(), dia, gasto(true), crearAzar(semilla));
      expect(db.gastos[0]!.pagadoEnEfectivo).toBe(false);
      expect(db.gastos[0]!.referencia).toMatch(/^\[datos-semana\] Transferencia/);
    }
  });

  it("un gasto que no es en efectivo tampoco sale del cajón aunque haya caja", async () => {
    const ctx = nuevoCtx({ categorias: ["Papelería", "Aseo", "Alimentación"] });
    const { tx, db } = nuevaBase();
    const estado = nuevoEstado();
    conCaja(estado);
    await registrarGasto(tx, ctx, estado, dia, gasto(false), crearAzar(1));
    expect(db.gastos[0]!.pagadoEnEfectivo).toBe(false);
  });

  it("si faltan categorías crea solo la que usa, la agrega al contexto y la reutiliza", async () => {
    const ctx = nuevoCtx();
    const { tx, m, db } = nuevaBase();
    const estado = nuevoEstado();
    for (let i = 0; i < 12; i++) await registrarGasto(tx, ctx, estado, dia, gasto(false), crearAzar(i + 1));
    const nombres = db.categorias.map((c) => c.nombre);
    expect(new Set(nombres).size).toBe(nombres.length); // ninguna repetida
    expect(nombres.every((n) => ["Papelería", "Aseo", "Alimentación"].includes(n))).toBe(true);
    expect(m.categoriaGasto.create).toHaveBeenCalledTimes(nombres.length);
    expect(ctx.categoriasGasto).toHaveLength(nombres.length);
    expect(db.gastos.every((g) => ctx.categoriasGasto.some((c) => c.id === g.categoriaId))).toBe(true);
  });
});

describe("registrarGastosRecurrentes", () => {
  it("sin plantillas en la sede crea Arriendo y Servicios públicos (con sus categorías) y confirma el mes", async () => {
    const ctx = nuevoCtx();
    const { tx, db } = nuevaBase();
    const estado = nuevoEstado();
    await registrarGastosRecurrentes(tx, ctx, estado, dia, recurrentes, crearAzar(1));
    expect(db.categorias.map((c) => c.nombre).sort()).toEqual(["Arriendo", "Servicios públicos"]);
    expect(db.plantillas).toHaveLength(2);
    expect(db.plantillas.every((p) => p.descripcion.startsWith("[datos-semana]") && p.desde === "2026-10")).toBe(true);
    expect(db.gastos).toHaveLength(2);
    for (const g of db.gastos) {
      expect(g.periodo).toBe("2026-10");
      expect(g.gastoRecurrenteId).toBeTruthy();
      expect(g.fecha).toEqual(new Date("2026-10-20T00:00:00.000Z"));
      expect(g.pagadoEnEfectivo).toBeUndefined();
      expect(g.descripcion.startsWith("[datos-semana]")).toBe(true);
    }
  });

  it("no repite un mes ya confirmado ni toca meses anteriores", async () => {
    const ctx = nuevoCtx({ categorias: ["Arriendo"] });
    const { tx, db } = nuevaBase();
    db.plantillas.push({ id: "gr0", sedeId: "s1", categoriaId: "cg1", descripcion: "[datos-semana] Arriendo", montoEstimado: 1_200_000, diaDelMes: 5, desde: "2026-08", activo: true });
    await registrarGastosRecurrentes(tx, ctx, nuevoEstado(), dia, recurrentes, crearAzar(1));
    expect(db.gastos).toHaveLength(1); // solo octubre, no agosto ni septiembre
    expect(db.gastos[0]).toMatchObject({ periodo: "2026-10", gastoRecurrenteId: "gr0", monto: 1_200_000 });
    expect(db.plantillas).toHaveLength(1); // ya había plantilla del script: no crea otras
    await registrarGastosRecurrentes(tx, ctx, nuevoEstado(), dia, recurrentes, crearAzar(1));
    expect(db.gastos).toHaveLength(1);
  });

  it("nunca confirma una plantilla real (sin marca): crea las suyas y solo confirma esas", async () => {
    const ctx = nuevoCtx({ categorias: ["Arriendo"] });
    const { tx, db } = nuevaBase();
    db.plantillas.push({ id: "real", sedeId: "s1", categoriaId: "cg1", descripcion: "Arriendo", montoEstimado: 1_200_000, diaDelMes: 5, desde: "2026-08", activo: true });
    await registrarGastosRecurrentes(tx, ctx, nuevoEstado(), dia, recurrentes, crearAzar(1));
    expect(db.gastos.some((g) => g.gastoRecurrenteId === "real")).toBe(false);
    expect(db.plantillas).toHaveLength(3); // la real + las dos del script
    expect(db.gastos).toHaveLength(2);
    expect(db.gastos.every((g) => g.gastoRecurrenteId !== "real" && g.descripcion.startsWith("[datos-semana]"))).toBe(true);
  });
});
