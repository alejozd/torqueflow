import { beforeEach, describe, expect, it, vi } from "vitest";
import { crearAzar } from "./azar";
import type { Contexto } from "./contexto";
import type { EstadoEjecucion, TenantTx } from "./ejecutor";
import { facturarYCobrar, registrarAnticiposPendientes } from "./dinero";
import { anularOrden, crearOrden, entregarOrden, terminarOrden } from "./ordenes";
import type { Evento, PlanDia } from "./tipos";

vi.mock("./dinero", () => ({ facturarYCobrar: vi.fn(async () => undefined), registrarAnticiposPendientes: vi.fn(async () => undefined) }));

const dia: PlanDia = { fecha: "2026-10-20", sedeId: "s1", eventos: [] };
type Llamada = { data: Record<string, unknown> };

function nuevoCtx(sobre: Partial<Contexto> = {}): Contexto {
  return {
    recepcionistaId: "rec1", actorId: "adm1",
    mecanicos: [
      { id: "m-otra", nombre: "Otra", sedeIds: ["s2"] },
      { id: "m1", nombre: "Uno", sedeIds: ["s1"] },
      { id: "m2", nombre: "Dos", sedeIds: ["s1", "s2"] },
    ],
    repuestos: [
      { id: "r1", nombre: "Filtro", precioCompra: 10, precioVenta: 20, stockActual: 2, stockMinimo: 1, bodegaId: "b1", proveedorId: null },
      { id: "r2", nombre: "Aceite", precioCompra: 10, precioVenta: 30, stockActual: 1, stockMinimo: 1, bodegaId: "b1", proveedorId: null },
      { id: "r3", nombre: "Pastillas", precioCompra: 10, precioVenta: 40, stockActual: 0, stockMinimo: 1, bodegaId: "b1", proveedorId: null },
      { id: "r4", nombre: "De otra sede", precioCompra: 10, precioVenta: 50, stockActual: 9, stockMinimo: 1, bodegaId: "b2", proveedorId: null },
    ],
    clientesExistentes: [{ id: "c1", vehiculoIds: ["v1"] }],
    placasOcupadas: new Set(),
    ...sobre,
  } as unknown as Contexto;
}

const nuevoEstado = (): EstadoEjecucion => ({
  ordenes: new Map(), cajaAbierta: new Map(), creados: {},
  clientesCreados: [], clientesUsados: new Set(), citasPorOrden: new Map(), anticiposPendientes: [],
});

function nuevoTx(opciones: { kmVehiculo?: number; kmUltimaOrden?: number; estadoOrden?: string; items?: unknown[] } = {}) {
  const tx = {
    vehiculo: { findUnique: vi.fn(async () => ({ kilometraje: opciones.kmVehiculo ?? 50_000 })) },
    bodega: { findMany: vi.fn(async () => [{ id: "b1" }]) },
    dviChecklistItem: { findMany: vi.fn(async () => [{ key: "luces" }, { key: "frenos" }]) },
    ordenTrabajo: {
      findFirst: vi.fn(async () => (opciones.kmUltimaOrden ? { kilometrajeIngreso: opciones.kmUltimaOrden } : null)),
      findUnique: vi.fn(async () => ({ estado: opciones.estadoOrden ?? "EN_PROCESO" })),
      create: vi.fn(async (_a: Llamada) => ({ id: "o1" })),
      update: vi.fn(async (_a: unknown) => ({})),
      updateMany: vi.fn(async (_a: unknown) => ({ count: 1 })),
    },
    danioOrden: { create: vi.fn(async (_a: Llamada) => ({})) },
    dvi: { create: vi.fn(async (_a: Llamada) => ({})) },
    itemOrden: {
      create: vi.fn(async (_a: Llamada) => ({})),
      findMany: vi.fn(async () => opciones.items ?? []),
    },
    manoDeObra: { create: vi.fn(async (_a: Llamada) => ({})) },
    auditLog: { create: vi.fn(async (_a: unknown) => ({})) },
    cita: { findUnique: vi.fn(async () => ({ clienteId: "c-cita", vehiculoId: "v-cita" })) },
  };
  return { tx: tx as unknown as TenantTx, m: tx };
}

const evento = (sobre: Partial<Extract<Evento, { tipo: "crearOrden" }>> = {}): Extract<Evento, { tipo: "crearOrden" }> =>
  ({ tipo: "crearOrden", hora: "09:30", clave: "o-1", borrador: false, conAnticipo: false, ...sobre });

const datos = (mock: { mock: { calls: unknown[][] } }, i = 0) => (mock.mock.calls[i]![0] as Llamada).data;
const datosDe = (llamada: unknown[]) => (llamada[0] as Llamada).data;

describe("crearOrden", () => {
  it("crea la orden con la sede, un mecánico de la sede, el creador y los síntomas marcados", async () => {
    const { tx, m } = nuevoTx();
    const estado = nuevoEstado();
    await crearOrden(tx, nuevoCtx(), estado, dia, evento(), crearAzar(3));
    const d = datos(m.ordenTrabajo.create);
    expect(d.sedeId).toBe("s1");
    expect(d.clienteId).toBe("c1");
    expect(d.vehiculoId).toBe("v1");
    expect(d.creadoPorId).toBe("rec1");
    expect(["m1", "m2"]).toContain(d.mecanicoId);
    expect(d.sintomas).toContain("[datos-semana]");
    expect(d.createdAt).toEqual(new Date("2026-10-20T09:30:00-05:00"));
    expect(estado.ordenes.get("o-1")).toBe("o1");
  });

  it("una cita completada de esa orden aporta el cliente y el vehículo", async () => {
    const { tx, m } = nuevoTx();
    const estado = nuevoEstado();
    estado.citasPorOrden.set("o-1", "cita1");
    await crearOrden(tx, nuevoCtx(), estado, dia, evento(), crearAzar(3));
    expect(m.cita.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "cita1" } }));
    const d = datos(m.ordenTrabajo.create);
    expect(d.clienteId).toBe("c-cita");
    expect(d.vehiculoId).toBe("v-cita");
  });

  it("hoy, justo después de la hora de la orden, ninguna fila queda con marca de tiempo futura", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const ahora = new Date("2026-10-20T09:32:00-05:00");
      vi.setSystemTime(ahora);
      for (let semilla = 1; semilla <= 20; semilla++) {
        const { tx, m } = nuevoTx();
        await crearOrden(tx, nuevoCtx(), nuevoEstado(), dia, evento(), crearAzar(semilla));
        const fechas = [
          ...m.dvi.create.mock.calls.flatMap((c) => [c[0].data.createdAt, c[0].data.updatedAt]),
          ...m.itemOrden.create.mock.calls.map((c) => c[0].data.createdAt),
          ...m.manoDeObra.create.mock.calls.map((c) => c[0].data.createdAt),
          ...m.ordenTrabajo.update.mock.calls.map((c) => (c[0] as Llamada).data.updatedAt),
        ].filter(Boolean) as Date[];
        expect(fechas.length).toBeGreaterThan(0);
        for (const f of fechas) expect(f.getTime()).toBeLessThanOrEqual(ahora.getTime());
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("el trabajo del taller siempre queda antes de los 20 minutos que tarda en terminarse la orden", async () => {
    const { tx, m } = nuevoTx();
    await crearOrden(tx, nuevoCtx(), nuevoEstado(), dia, evento(), crearAzar(5));
    const creada = new Date("2026-10-20T09:30:00-05:00").getTime();
    for (const c of m.manoDeObra.create.mock.calls) expect((datosDe(c).createdAt as Date).getTime()).toBeLessThan(creada + 20 * 60_000);
  });

  it("si ningún mecánico tiene la sede, usa cualquiera", async () => {
    const { tx, m } = nuevoTx();
    const ctx = nuevoCtx({ mecanicos: [{ id: "x", nombre: "X", sedeIds: ["s9"] }] });
    await crearOrden(tx, ctx, nuevoEstado(), dia, evento(), crearAzar(3));
    expect(datos(m.ordenTrabajo.create).mecanicoId).toBe("x");
  });

  it("reserva el stock de cada repuesto usado sin dejarlo negativo y solo de la sede", async () => {
    for (let semilla = 1; semilla <= 40; semilla++) {
      const { tx, m } = nuevoTx();
      const ctx = nuevoCtx();
      await crearOrden(tx, ctx, nuevoEstado(), dia, evento(), crearAzar(semilla));
      const items = m.itemOrden.create.mock.calls.map((c) => (c[0] as Llamada).data);
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items.length).toBeLessThanOrEqual(3);
      const original: Record<string, number> = { r1: 2, r2: 1 };
      for (const r of ctx.repuestos) expect(r.stockActual).toBeGreaterThanOrEqual(0);
      for (const id of ["r1", "r2"]) {
        const usado = items.filter((i) => i.repuestoId === id).reduce((s, i) => s + (i.cantidad as number), 0);
        expect(ctx.repuestos.find((r) => r.id === id)!.stockActual).toBe(original[id]! - usado);
      }
      expect(items.every((i) => i.repuestoId === "r1" || i.repuestoId === "r2")).toBe(true);
      expect(new Set(items.map((i) => i.repuestoId)).size).toBe(items.length);
      // El stock real se descuenta al facturar (crearFacturaAction), no al agregar el ítem.
      expect((m as Record<string, unknown>).repuesto).toBeUndefined();
    }
  });

  it("copia descripción y precio del repuesto, como addItemOrdenAction", async () => {
    const { tx, m } = nuevoTx();
    await crearOrden(tx, nuevoCtx(), nuevoEstado(), dia, evento(), crearAzar(5));
    const item = datos(m.itemOrden.create);
    const rep = { r1: ["Filtro", 20], r2: ["Aceite", 30] }[item.repuestoId as "r1" | "r2"]!;
    expect(item.descripcion).toBe(rep[0]);
    expect(item.precioUnitario).toBe(rep[1]);
    expect(item.ordenId).toBe("o1");
  });

  it("sin repuestos con stock no agrega ítems", async () => {
    const { tx, m } = nuevoTx();
    const ctx = nuevoCtx({ repuestos: [] });
    await crearOrden(tx, ctx, nuevoEstado(), dia, evento(), crearAzar(2));
    expect(m.itemOrden.create).not.toHaveBeenCalled();
    expect(m.manoDeObra.create).toHaveBeenCalled();
  });

  it("1 a 3 líneas de mano de obra con mecánicos de la sede y marca", async () => {
    for (let semilla = 1; semilla <= 30; semilla++) {
      const { tx, m } = nuevoTx();
      await crearOrden(tx, nuevoCtx(), nuevoEstado(), dia, evento(), crearAzar(semilla));
      const lineas = m.manoDeObra.create.mock.calls.map((c) => (c[0] as Llamada).data);
      expect(lineas.length).toBeGreaterThanOrEqual(1);
      expect(lineas.length).toBeLessThanOrEqual(3);
      for (const l of lineas) {
        expect(["m1", "m2"]).toContain(l.mecanicoId);
        expect(l.valor as number).toBeGreaterThan(0);
        expect(l.descripcion).toContain("[datos-semana]");
      }
    }
  });

  it("recepción: kilometraje mayor al del vehículo y de su última orden, combustible y 0 a 2 daños distintos", async () => {
    const cuentas = new Set<number>();
    for (let semilla = 1; semilla <= 40; semilla++) {
      const { tx, m } = nuevoTx({ kmVehiculo: 50_000, kmUltimaOrden: 61_000 });
      await crearOrden(tx, nuevoCtx(), nuevoEstado(), dia, evento(), crearAzar(semilla));
      const rec = (m.ordenTrabajo.update.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
      expect(rec.kilometrajeIngreso as number).toBeGreaterThan(61_000);
      expect(rec.nivelCombustible).toBeTruthy();
      const danios = m.danioOrden.create.mock.calls.map((c) => (c[0] as Llamada).data);
      cuentas.add(danios.length);
      expect(danios.length).toBeLessThanOrEqual(2);
      expect(new Set(danios.map((x) => `${x.zona}/${x.tipo}`)).size).toBe(danios.length);
      for (const x of danios) {
        expect(x.nota).toContain("[datos-semana]");
        expect(x.creadoPorId).toBe("rec1");
      }
    }
    expect([...cuentas].sort()).toEqual([0, 1, 2]);
  });

  it("checklist DVI marcado con cada ítem activo y creado por el mecánico de la orden", async () => {
    const { tx, m } = nuevoTx();
    await crearOrden(tx, nuevoCtx(), nuevoEstado(), dia, evento(), crearAzar(4));
    const d = datos(m.dvi.create);
    expect(Object.keys(d.checklist as object).sort()).toEqual(["frenos", "luces"]);
    expect(Object.values(d.checklist as object).every((v) => ["OK", "ATENCION", "CRITICO", "NO_APLICA"].includes(v as string))).toBe(true);
    expect(d.ordenId).toBe("o1");
    expect(d.creadoPorId).toBe(datos(m.ordenTrabajo.create).mecanicoId);
  });

  it("pasa la orden de BORRADOR a EN_PROCESO", async () => {
    const { tx, m } = nuevoTx();
    await crearOrden(tx, nuevoCtx(), nuevoEstado(), dia, evento(), crearAzar(4));
    const cambios = m.ordenTrabajo.update.mock.calls.map((c) => (c[0] as { data: Record<string, unknown> }).data);
    expect(cambios.some((c) => c.estado === "EN_PROCESO")).toBe(true);
  });

  it("borrador: queda en BORRADOR sin ítems, mano de obra ni checklist", async () => {
    const { tx, m } = nuevoTx();
    const ctx = nuevoCtx();
    await crearOrden(tx, ctx, nuevoEstado(), dia, evento({ borrador: true }), crearAzar(4));
    const cambios = m.ordenTrabajo.update.mock.calls.map((c) => (c[0] as { data: Record<string, unknown> }).data);
    expect(cambios.some((c) => c.estado !== undefined)).toBe(false);
    expect(m.itemOrden.create).not.toHaveBeenCalled();
    expect(m.manoDeObra.create).not.toHaveBeenCalled();
    expect(m.dvi.create).not.toHaveBeenCalled();
    expect(ctx.repuestos.map((r) => r.stockActual)).toEqual([2, 1, 0, 9]);
  });

  it("conAnticipo deja la clave en anticiposPendientes", async () => {
    const { tx } = nuevoTx();
    const estado = nuevoEstado();
    await crearOrden(tx, nuevoCtx(), estado, dia, evento({ conAnticipo: true }), crearAzar(4));
    expect(estado.anticiposPendientes).toEqual(["o-1"]);
    const otro = nuevoEstado();
    await crearOrden(tx, nuevoCtx(), otro, dia, evento(), crearAzar(4));
    expect(otro.anticiposPendientes).toEqual([]);
  });

  it("con anticipo lo registra al terminar de armar la orden; sin anticipo no", async () => {
    const llamadas = vi.mocked(registrarAnticiposPendientes);
    llamadas.mockClear();
    const { tx } = nuevoTx();
    await crearOrden(tx, nuevoCtx(), nuevoEstado(), dia, evento(), crearAzar(4));
    expect(llamadas).not.toHaveBeenCalled();
    await crearOrden(tx, nuevoCtx(), nuevoEstado(), dia, evento({ conAnticipo: true }), crearAzar(4));
    expect(llamadas).toHaveBeenCalledTimes(1);
    expect(llamadas.mock.calls[0]![3]).toBe("s1");
  });
});

describe("terminarOrden", () => {
  const ev: Extract<Evento, { tipo: "terminarOrden" }> = { tipo: "terminarOrden", hora: "16:00", clave: "o-1" };

  it("de una clave desconocida lanza con mensaje claro", async () => {
    const { tx } = nuevoTx();
    await expect(terminarOrden(tx, nuevoCtx(), nuevoEstado(), dia, ev, crearAzar(1))).rejects.toThrow(/o-1/);
  });

  it("pasa EN_PROCESO a TERMINADA", async () => {
    const { tx, m } = nuevoTx();
    const estado = nuevoEstado();
    estado.ordenes.set("o-1", "o1");
    await terminarOrden(tx, nuevoCtx(), estado, dia, ev, crearAzar(1));
    const arg = m.ordenTrabajo.updateMany.mock.calls[0]![0] as { where: unknown; data: Record<string, unknown> };
    expect(arg.where).toEqual({ id: "o1", estado: "EN_PROCESO" });
    expect(arg.data.estado).toBe("TERMINADA");
    expect(arg.data.updatedAt).toEqual(new Date("2026-10-20T16:00:00-05:00"));
  });

  it("rechaza una transición inválida", async () => {
    const { tx, m } = nuevoTx({ estadoOrden: "ANULADA" });
    const estado = nuevoEstado();
    estado.ordenes.set("o-1", "o1");
    await expect(terminarOrden(tx, nuevoCtx(), estado, dia, ev, crearAzar(1))).rejects.toThrow(/ANULADA/);
    expect(m.ordenTrabajo.updateMany).not.toHaveBeenCalled();
  });
});

describe("anularOrden", () => {
  const ev: Extract<Evento, { tipo: "anularOrden" }> = { tipo: "anularOrden", hora: "11:00", clave: "o-1" };

  it("de una clave desconocida lanza con mensaje claro", async () => {
    const { tx } = nuevoTx();
    await expect(anularOrden(tx, nuevoCtx(), nuevoEstado(), dia, ev, crearAzar(1))).rejects.toThrow(/o-1/);
  });

  it("deja la orden ANULADA con anuladaAt, audita y devuelve la reserva de stock", async () => {
    const ctx = nuevoCtx();
    ctx.repuestos[0]!.stockActual = 0; // lo reservó esta orden
    const { tx, m } = nuevoTx({ items: [{ repuestoId: "r1", cantidad: 2 }, { repuestoId: null, cantidad: 4 }] });
    const estado = nuevoEstado();
    estado.ordenes.set("o-1", "o1");
    await anularOrden(tx, ctx, estado, dia, ev, crearAzar(1));
    const arg = m.ordenTrabajo.updateMany.mock.calls[0]![0] as { where: unknown; data: Record<string, unknown> };
    expect(arg.where).toEqual({ id: "o1", estado: "EN_PROCESO" });
    expect(arg.data.estado).toBe("ANULADA");
    expect(arg.data.anuladaAt).toEqual(new Date("2026-10-20T11:00:00-05:00"));
    const auditoria = datos(m.auditLog.create);
    expect(auditoria).toMatchObject({
      tipo: "ORDEN_ANULAR", actorId: "adm1", entidadTipo: "OrdenTrabajo", entidadId: "o1",
      detalle: { estadoAnterior: "EN_PROCESO" },
    });
    expect(ctx.repuestos[0]!.stockActual).toBe(2);
  });

  it("no anula una orden ya TERMINADA", async () => {
    const { tx, m } = nuevoTx({ estadoOrden: "TERMINADA" });
    const estado = nuevoEstado();
    estado.ordenes.set("o-1", "o1");
    await expect(anularOrden(tx, nuevoCtx(), estado, dia, ev, crearAzar(1))).rejects.toThrow(/TERMINADA/);
    expect(m.ordenTrabajo.updateMany).not.toHaveBeenCalled();
  });
});

describe("entregarOrden", () => {
  const ev = (sobre: Partial<Extract<Evento, { tipo: "entregarOrden" }>> = {}): Extract<Evento, { tipo: "entregarOrden" }> =>
    ({ tipo: "entregarOrden", hora: "17:00", clave: "o-1", pago: "COMPLETO", garantia: false, ...sobre });

  function txEntrega(sobre: { estado?: string; km?: number | null } = {}) {
    const m = {
      ordenTrabajo: {
        findUnique: vi.fn(async () => ({
          estado: sobre.estado ?? "TERMINADA", clienteId: "c1", kilometrajeIngreso: sobre.km === undefined ? 50_000 : sobre.km,
          cliente: { nombre: "Ana Pérez", documento: "123" },
          items: [{ id: "i1", repuestoId: "r1", descripcion: "Filtro", cantidad: 1, precioUnitario: 20 }],
          manoDeObra: [{ id: "mo1", descripcion: "[datos-semana] Cambio de aceite", valor: 50_000 }],
        })),
        updateMany: vi.fn(async (_a: unknown) => ({ count: 1 })),
      },
      actaEntrega: { upsert: vi.fn(async (_a: unknown) => ({ id: "ac1" })) },
      garantia: { create: vi.fn(async (_a: Llamada) => ({ id: "g1" })) },
      auditLog: { create: vi.fn(async (_a: unknown) => ({})) },
    };
    return { tx: m as unknown as TenantTx, m };
  }
  const conOrden = () => { const e = nuevoEstado(); e.ordenes.set("o-1", "o1"); return e; };
  const entregar = (tx: TenantTx, evento: Extract<Evento, { tipo: "entregarOrden" }>, estado = conOrden()) =>
    entregarOrden(tx, nuevoCtx(), estado, dia, evento, crearAzar(5));

  beforeEach(() => { vi.mocked(facturarYCobrar).mockClear(); });

  it("de una clave desconocida lanza con mensaje claro", async () => {
    await expect(entregar(txEntrega().tx, ev(), nuevoEstado())).rejects.toThrow(/o-1/);
  });

  it("una orden que no está TERMINADA lanza y no escribe nada", async () => {
    for (const estadoOrden of ["EN_PROCESO", "BORRADOR", "ANULADA", "ENTREGADA"]) {
      const { tx, m } = txEntrega({ estado: estadoOrden });
      await expect(entregar(tx, ev())).rejects.toThrow(estadoOrden);
      expect(m.ordenTrabajo.updateMany).not.toHaveBeenCalled();
    }
    expect(facturarYCobrar).not.toHaveBeenCalled();
  });

  it("factura y cobra según el evento antes de entregar, con la hora del evento", async () => {
    const { tx } = txEntrega();
    await entregar(tx, ev({ pago: "PARCIAL" }));
    const args = vi.mocked(facturarYCobrar).mock.calls[0]!;
    expect(args[3]).toBe("s1");
    expect(args[4]).toMatchObject({ id: "o1", clienteId: "c1" });
    expect(args[5]).toBe("PARCIAL");
    expect(args[7]).toEqual(new Date("2026-10-20T17:00:00-05:00"));
  });

  it("entrega: ENTREGADA condicional al estado leído, con entregadaAt, y acta firmada por el cliente con firma de ejemplo", async () => {
    const { tx, m } = txEntrega();
    await entregar(tx, ev());
    const t = m.ordenTrabajo.updateMany.mock.calls[0]![0] as { where: unknown; data: Record<string, unknown> };
    expect(t.where).toEqual({ id: "o1", estado: "TERMINADA" });
    expect(t.data.estado).toBe("ENTREGADA");
    expect(t.data.entregadaAt).toBeInstanceOf(Date);
    const acta = m.actaEntrega.upsert.mock.calls[0]![0] as { where: unknown; create: Record<string, unknown>; update: Record<string, unknown> };
    expect(acta.where).toEqual({ ordenId: "o1" });
    expect(acta.create).toMatchObject({ ordenId: "o1", recibidoPor: "Ana Pérez", documentoRecibe: "123", creadoPorId: "rec1", firmaFotoUrl: null });
    expect(acta.create.observaciones).toContain("[datos-semana]");
    expect(acta.create.firmaUrl).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/);
    expect(acta.create.firmadaAt).toBeInstanceOf(Date);
    expect(acta.update).toMatchObject({ recibidoPor: "Ana Pérez" });
    expect(datos(m.auditLog.create)).toMatchObject({
      tipo: "ACTA_FIRMAR", entidadTipo: "ActaEntrega", entidadId: "ac1",
      detalle: { ordenId: "o1", estadoAnterior: "TERMINADA", firma: "pantalla" },
    });
  });

  it("sin garantía no la crea; con garantía registra una sola, marcada, antes de entregar y la audita", async () => {
    const sin = txEntrega();
    await entregar(sin.tx, ev({ garantia: false }));
    expect(sin.m.garantia.create).not.toHaveBeenCalled();

    const { tx, m } = txEntrega();
    await entregar(tx, ev({ garantia: true }));
    expect(m.garantia.create).toHaveBeenCalledTimes(1);
    const g = datos(m.garantia.create);
    expect(["TRABAJO", "REPUESTO"]).toContain(g.tipo);
    expect(g.manoDeObraId).toBe(g.tipo === "TRABAJO" ? "mo1" : null);
    expect(g.itemOrdenId).toBe(g.tipo === "REPUESTO" ? "i1" : null);
    expect(g.descripcion).toMatch(/^\[datos-semana\]/);
    expect(g).toMatchObject({ ordenId: "o1", creadoPorId: "rec1" });
    expect(g.cubreHasta).toBeInstanceOf(Date);
    expect((g.cubreHasta as Date).toISOString()).toMatch(/T00:00:00\.000Z$/);
    const auditoria = m.auditLog.create.mock.calls.map((c) => (c[0] as Llamada).data.tipo);
    expect(auditoria).toEqual(["GARANTIA_REGISTRAR", "ACTA_FIRMAR"]);
    expect(m.garantia.create.mock.invocationCallOrder[0]!).toBeLessThan(m.ordenTrabajo.updateMany.mock.invocationCallOrder[0]!);
  });

  it("si la orden cambió de estado durante la ejecución lanza", async () => {
    const { tx, m } = txEntrega();
    m.ordenTrabajo.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(entregar(tx, ev())).rejects.toThrow(/cambió/);
  });
});
