import { describe, expect, it } from "vitest";
import { armarPlan, contarEventos, VOLUMENES } from "./plan";
import { diasDelRango } from "./fechas";
import type { Evento, PlanDia, Respuestas } from "./tipos";

const R: Respuestas = { desde: "2026-10-19", hasta: "2026-10-24", sedeIds: ["s1"], clientesNuevos: 0, volumen: "medio", liquidar: true };
// Rango largo (4 semanas) para las proporciones; varias semillas fijas para reducir el ruido.
const LARGO: Respuestas = { desde: "2026-09-21", hasta: "2026-10-17", sedeIds: ["s1", "s2"], clientesNuevos: 0, volumen: "alto", liquidar: false };
const SEMILLAS = [1, 2, 3, 4, 5];
const HOY_LARGO = "2026-10-17";

const planesLargos = (r: Respuestas = LARGO): PlanDia[] => SEMILLAS.flatMap((s) => armarPlan(r, s, r.hasta));
const eventosDe = (plan: PlanDia[]): Evento[] => plan.flatMap((d) => d.eventos);
const delTipo = <T extends Evento["tipo"]>(plan: PlanDia[], tipo: T) =>
  eventosDe(plan).filter((e): e is Extract<Evento, { tipo: T }> => e.tipo === tipo);
const proporcion = (parte: number, total: number) => parte / total;
const cerca = (obtenida: number, esperada: number) => expect(Math.abs(obtenida - esperada)).toBeLessThanOrEqual(0.1);

describe("armarPlan", () => {
  // Regla 1
  it("un PlanDia por día hábil y sede, sin domingos ni días futuros", () => {
    const plan = armarPlan({ ...R, hasta: "2026-10-25" }, 7, "2026-10-22");
    expect(plan.map((d) => d.fecha)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22"]);
    const doble = armarPlan({ ...R, sedeIds: ["s1", "s2"], hasta: "2026-10-25" }, 7, "2026-10-24");
    expect(doble).toHaveLength(6 * 2);
    expect(new Set(doble.map((d) => `${d.fecha}|${d.sedeId}`)).size).toBe(12);
    expect(doble.some((d) => d.fecha === "2026-10-25")).toBe(false);
  });

  // Regla 2
  it("cada día abre y cierra caja, salvo hoy que queda abierta", () => {
    const plan = armarPlan(R, 7, "2026-10-22");
    for (const dia of plan) {
      expect(dia.eventos[0]!.tipo).toBe("abrirCaja");
      const ultimo = dia.eventos.at(-1)!.tipo;
      if (dia.fecha === "2026-10-22") expect(dia.eventos.some((e) => e.tipo === "cerrarCaja")).toBe(false);
      else expect(ultimo).toBe("cerrarCaja");
    }
  });
  it("abre entre 07:30 y 08:00, cierra entre 17:30 y 18:00 y la diferencia es 0 en ~80 % de los días", () => {
    const plan = planesLargos();
    for (const e of delTipo(plan, "abrirCaja")) expect(e.hora >= "07:30" && e.hora <= "08:00").toBe(true);
    const cierres = delTipo(plan, "cerrarCaja");
    for (const e of cierres) {
      expect(e.hora >= "17:30" && e.hora <= "18:00").toBe(true);
      expect(e.diferencia >= -5000 && e.diferencia <= 5000).toBe(true);
    }
    cerca(proporcion(cierres.filter((e) => e.diferencia === 0).length, cierres.length), 0.8);
  });

  // Regla 3
  it("una orden nunca se entrega antes de terminarse ni se termina antes de crearse", () => {
    const plan = armarPlan(R, 11, "2026-10-24");
    const momento = new Map<string, Record<string, string>>();
    for (const dia of plan) for (const e of dia.eventos) {
      if ("clave" in e) {
        const m = momento.get(e.clave) ?? {};
        m[e.tipo] = `${dia.fecha} ${e.hora}`;
        momento.set(e.clave, m);
      }
    }
    for (const m of momento.values()) {
      if (m.terminarOrden) expect(m.crearOrden! < m.terminarOrden).toBe(true);
      if (m.entregarOrden) expect(m.terminarOrden! < m.entregarOrden).toBe(true);
    }
  });
  it("respeta el volumen de órdenes por día", () => {
    for (const v of ["bajo", "medio", "alto"] as const) {
      const plan = armarPlan({ ...R, volumen: v }, 3, "2026-10-24");
      for (const dia of plan) expect(dia.eventos.filter((e) => e.tipo === "crearOrden")).toHaveLength(VOLUMENES[v].ordenes);
    }
  });
  it("el ciclo de la orden queda dentro del rango, a 0-2 días por etapa, y se corta al final", () => {
    const plan = armarPlan(LARGO, 9, HOY_LARGO);
    const dias = [...new Set(plan.map((d) => d.fecha))];
    const indice = (f: string) => dias.indexOf(f);
    const fechaDe = new Map<string, Record<string, string>>();
    for (const dia of plan) for (const e of dia.eventos) {
      if ("clave" in e) fechaDe.set(e.clave, { ...fechaDe.get(e.clave), [e.tipo]: dia.fecha });
    }
    for (const m of fechaDe.values()) {
      if (m.terminarOrden) expect(indice(m.terminarOrden) - indice(m.crearOrden!)).toBeGreaterThanOrEqual(0);
      if (m.terminarOrden) expect(indice(m.terminarOrden) - indice(m.crearOrden!)).toBeLessThanOrEqual(2);
      if (m.entregarOrden) expect(indice(m.entregarOrden) - indice(m.terminarOrden!)).toBeLessThanOrEqual(2);
    }
    // Las órdenes de los últimos días no pueden completarse: hay algunas sin entregar.
    const sinEntregar = [...fechaDe.values()].filter((m) => !m.entregarOrden && !m.anularOrden && m.terminarOrden).length;
    expect(sinEntregar).toBeGreaterThan(0);
  });
  it("~5 % anuladas (sin ciclo), ~5 % borradores (sin ciclo), ~15 % con anticipo", () => {
    const plan = planesLargos();
    const ordenes = delTipo(plan, "crearOrden");
    cerca(proporcion(delTipo(plan, "anularOrden").length, ordenes.length), 0.05);
    cerca(proporcion(ordenes.filter((o) => o.borrador).length, ordenes.length), 0.05);
    cerca(proporcion(ordenes.filter((o) => o.conAnticipo).length, ordenes.length), 0.15);
    // Las claves se repiten entre semillas: el ciclo se revisa por plan.
    const unico = armarPlan(LARGO, 3, HOY_LARGO);
    const anuladas = new Set(delTipo(unico, "anularOrden").map((e) => e.clave));
    const borradores = new Set(delTipo(unico, "crearOrden").filter((o) => o.borrador).map((o) => o.clave));
    for (const e of eventosDe(unico)) {
      if (e.tipo === "terminarOrden" || e.tipo === "entregarOrden") {
        expect(anuladas.has(e.clave)).toBe(false);
        expect(borradores.has(e.clave)).toBe(false);
      }
      if (e.tipo === "anularOrden") expect(borradores.has(e.clave)).toBe(false);
    }
  });
  it("al entregar: pago COMPLETO ~70 %, PARCIAL ~15 %, PENDIENTE ~15 %, garantía ~20 %", () => {
    const entregas = delTipo(planesLargos(), "entregarOrden");
    cerca(proporcion(entregas.filter((e) => e.pago === "COMPLETO").length, entregas.length), 0.7);
    cerca(proporcion(entregas.filter((e) => e.pago === "PARCIAL").length, entregas.length), 0.15);
    cerca(proporcion(entregas.filter((e) => e.pago === "PENDIENTE").length, entregas.length), 0.15);
    cerca(proporcion(entregas.filter((e) => e.garantia).length, entregas.length), 0.2);
  });
  it("las claves tienen la forma o-fecha-sede-n y las etapas de una orden del mismo día van en horas crecientes", () => {
    const plan = armarPlan(R, 5, "2026-10-24");
    for (const dia of plan) {
      const hora = new Map<string, string[]>();
      for (const e of dia.eventos) if ("clave" in e) hora.set(e.clave, [...(hora.get(e.clave) ?? []), e.hora]);
      for (const [clave, horas] of hora) {
        expect(clave).toMatch(/^o-\d{4}-\d{2}-\d{2}-s1-\d+$/);
        expect(horas).toEqual([...horas].sort());
        expect(new Set(horas).size).toBe(horas.length);
      }
    }
    expect(delTipo(plan, "crearOrden").map((e) => e.clave)).toContain("o-2026-10-19-s1-1");
  });

  // Reglas 4 y 5
  it("citas: volumen por día y ~60/20/10/10 de estados", () => {
    const dia1 = armarPlan({ ...R, volumen: "medio" }, 3, "2026-10-24");
    for (const d of dia1) expect(d.eventos.filter((e) => e.tipo === "cita")).toHaveLength(VOLUMENES.medio.citas);
    const citas = delTipo(planesLargos(), "cita");
    const p = (estado: string) => proporcion(citas.filter((c) => c.estado === estado).length, citas.length);
    cerca(p("COMPLETADA"), 0.6);
    cerca(p("CONFIRMADA"), 0.2);
    cerca(p("PROGRAMADA"), 0.1);
    cerca(p("CANCELADA"), 0.1);
  });
  it("cotizaciones: volumen por día y ~40/30/15/15 de destinos", () => {
    const plan = armarPlan({ ...R, volumen: "alto" }, 3, "2026-10-24");
    for (const d of plan) expect(d.eventos.filter((e) => e.tipo === "cotizacion")).toHaveLength(VOLUMENES.alto.cotizaciones);
    const cots = delTipo(planesLargos(), "cotizacion");
    const p = (destino: string) => proporcion(cots.filter((c) => c.destino === destino).length, cots.length);
    cerca(p("APROBADA"), 0.4);
    cerca(p("ENVIADA"), 0.3);
    cerca(p("RECHAZADA"), 0.15);
    cerca(p("VENCIDA"), 0.15);
  });
  it("citas completadas y cotizaciones aprobadas enlazan una orden del mismo día y sede, creada después y no repetida", () => {
    for (const semilla of SEMILLAS) for (const v of ["bajo", "medio", "alto"] as const) {
      const plan = armarPlan({ ...LARGO, volumen: v }, semilla, HOY_LARGO);
      const usadas = new Set<string>();
      for (const dia of plan) {
        const ordenes = new Map(
          dia.eventos.flatMap((e) => (e.tipo === "crearOrden" ? [[e.clave, e] as const] : [])),
        );
        for (const e of dia.eventos) {
          if (e.tipo !== "cita" && e.tipo !== "cotizacion") continue;
          const completa = e.tipo === "cita" ? e.estado === "COMPLETADA" : e.destino === "APROBADA";
          if (!completa) {
            expect(e.ordenClave).toBeUndefined();
            continue;
          }
          expect(e.ordenClave).toBeDefined();
          const orden = ordenes.get(e.ordenClave!);
          expect(orden).toBeDefined();
          expect(orden!.borrador).toBe(false);
          expect(orden!.hora > e.hora).toBe(true);
          expect(dia.eventos.some((x) => x.tipo === "anularOrden" && x.clave === e.ordenClave)).toBe(false);
          expect(usadas.has(e.ordenClave!)).toBe(false);
          usadas.add(e.ordenClave!);
        }
      }
    }
  });

  // Regla 6
  it("ventas de mostrador: volumen por día, ~20 % fiadas, ~10 % devoluciones", () => {
    const plan = planesLargos();
    for (const d of plan) expect(d.eventos.filter((e) => e.tipo === "ventaMostrador")).toHaveLength(VOLUMENES.alto.ventas);
    const ventas = delTipo(plan, "ventaMostrador");
    cerca(proporcion(ventas.filter((v) => v.fiada).length, ventas.length), 0.2);
    cerca(proporcion(ventas.filter((v) => v.devolucion).length, ventas.length), 0.1);
  });

  // Regla 7
  it("gastos: volumen por día, ~60 % en efectivo, y un gasto recurrente por sede el primer día", () => {
    const plan = planesLargos();
    for (const d of plan) expect(d.eventos.filter((e) => e.tipo === "gasto")).toHaveLength(VOLUMENES.alto.gastos);
    const gastos = delTipo(plan, "gasto");
    cerca(proporcion(gastos.filter((g) => g.efectivo).length, gastos.length), 0.6);
    const unaVez = armarPlan(LARGO, 4, HOY_LARGO);
    const recurrentes = unaVez.filter((d) => d.eventos.some((e) => e.tipo === "gastosRecurrentes"));
    expect(recurrentes.map((d) => `${d.fecha}|${d.sedeId}`).sort()).toEqual(["2026-09-21|s1", "2026-09-21|s2"]);
    expect(delTipo(unaVez, "gastosRecurrentes")).toHaveLength(2);
  });

  // Regla 8
  it("compras: un pedido cada 2 días hábiles por sede (el primero incluido), ~70 % recibidos, un abono cada 3", () => {
    const dias = diasDelRango(LARGO.desde, LARGO.hasta);
    const plan = armarPlan(LARGO, 4, HOY_LARGO);
    for (const sede of LARGO.sedeIds) {
      const propios = plan.filter((d) => d.sedeId === sede);
      const conPedido = propios.filter((d) => d.eventos.some((e) => e.tipo === "pedidoCompra")).map((d) => d.fecha);
      expect(conPedido).toEqual(dias.filter((_, i) => i % 2 === 0));
      expect(delTipo(propios, "abonoProveedor")).toHaveLength(Math.floor(dias.length / 3));
    }
    const pedidos = delTipo(planesLargos(), "pedidoCompra");
    cerca(proporcion(pedidos.filter((p) => p.recibir).length, pedidos.length), 0.7);
  });

  // Regla 9
  it("clientes nuevos: ninguno si es 0; si no, exactamente ese total, antes de las órdenes de la mañana", () => {
    expect(contarEventos(armarPlan(R, 3, "2026-10-24")).crearCliente).toBe(0);
    const plan = armarPlan({ ...R, sedeIds: ["s1", "s2"], clientesNuevos: 9 }, 3, "2026-10-24");
    expect(contarEventos(plan).crearCliente).toBe(9);
    for (const dia of plan) {
      const primeraOrden = dia.eventos.find((e) => e.tipo === "crearOrden")!.hora;
      for (const e of dia.eventos) if (e.tipo === "crearCliente") expect(e.hora < primeraOrden).toBe(true);
    }
  });

  // Regla 10
  it("una sola liquidación, el último día y en la primera sede, tras las entregas y antes de cerrar caja", () => {
    const plan = armarPlan({ ...R, sedeIds: ["s1", "s2"] }, 2, "2026-10-25");
    expect(contarEventos(plan).liquidacion).toBe(1);
    const dia = plan.find((d) => d.eventos.some((e) => e.tipo === "liquidacion"))!;
    expect(dia.fecha).toBe("2026-10-24");
    expect(dia.sedeId).toBe("s1");
    const liq = dia.eventos.find((e) => e.tipo === "liquidacion")!;
    for (const e of dia.eventos) if (e.tipo === "entregarOrden") expect(e.hora < liq.hora).toBe(true);
    expect(liq.hora < dia.eventos.find((e) => e.tipo === "cerrarCaja")!.hora).toBe(true);
    expect(contarEventos(armarPlan({ ...R, liquidar: false }, 2, "2026-10-24")).liquidacion).toBe(0);
  });

  // Regla 11
  it("eventos ordenados por hora, con abrirCaja primero y cerrarCaja último", () => {
    for (const dia of armarPlan({ ...LARGO, desde: "2026-10-12" }, 6, "2026-10-18")) {
      const horas = dia.eventos.map((e) => e.hora);
      expect(horas).toEqual([...horas].sort());
      expect(dia.eventos[0]!.tipo).toBe("abrirCaja");
      expect(dia.eventos.filter((e) => e.tipo === "abrirCaja")).toHaveLength(1);
      expect(dia.eventos.at(-1)!.tipo).toBe("cerrarCaja");
    }
  });
  it("horas dentro del horario", () => {
    for (const dia of armarPlan(R, 5, "2026-10-24")) for (const e of dia.eventos) {
      expect(e.hora >= "07:30" && e.hora <= "18:00").toBe(true);
    }
  });

  // Regla 12
  it("es repetible con la misma semilla y cambia con otra", () => {
    expect(armarPlan(R, 7, "2026-10-24")).toEqual(armarPlan(R, 7, "2026-10-24"));
    expect(armarPlan(R, 7, "2026-10-24")).not.toEqual(armarPlan(R, 8, "2026-10-24"));
  });
});

describe("contarEventos", () => {
  it("cuenta por tipo, con cero para los que no hay", () => {
    const conteo = contarEventos(armarPlan({ ...R, volumen: "bajo" }, 3, "2026-10-24"));
    expect(conteo.crearOrden).toBe(3 * 6);
    expect(conteo.abrirCaja).toBe(6);
    expect(conteo.crearCliente).toBe(0);
  });
});
