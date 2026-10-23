import { describe, expect, it, vi } from "vitest";
import { crearAzar } from "./azar";
import type { Contexto } from "./contexto";
import { registrarCotizacion } from "./cotizaciones";
import type { EstadoEjecucion, TenantTx } from "./ejecutor";
import { crearOrden } from "./ordenes";
import { computeCotizacionTotales } from "@/lib/cotizacion/totales";
import type { Evento, PlanDia } from "./tipos";

vi.mock("./dinero", () => ({ facturarYCobrar: vi.fn(async () => undefined), registrarAnticiposPendientes: vi.fn(async () => undefined) }));

const dia: PlanDia = { fecha: "2026-10-20", sedeId: "s1", eventos: [] };
type Llamada = { data: Record<string, unknown>; where?: Record<string, unknown> };

function nuevoCtx(): Contexto {
  return {
    recepcionistaId: "rec1", actorId: "adm1",
    mecanicos: [{ id: "m1", nombre: "Uno", sedeIds: ["s1"] }],
    repuestos: [
      { id: "r1", nombre: "Filtro", precioCompra: 10, precioVenta: 20_000, stockActual: 2, stockMinimo: 1, bodegaId: "b1", proveedorId: null },
      { id: "r2", nombre: "Sin stock", precioCompra: 10, precioVenta: 30_000, stockActual: 0, stockMinimo: 1, bodegaId: "b1", proveedorId: null },
      { id: "r4", nombre: "De otra sede", precioCompra: 10, precioVenta: 50_000, stockActual: 9, stockMinimo: 1, bodegaId: "b2", proveedorId: null },
    ],
    clientesExistentes: [{ id: "c1", vehiculoIds: ["v1"] }],
    placasOcupadas: new Set(),
  } as unknown as Contexto;
}

const nuevoEstado = (): EstadoEjecucion => ({
  ordenes: new Map(), cajaAbierta: new Map(), creados: {},
  clientesCreados: [], clientesUsados: new Set(), citasPorOrden: new Map(), anticiposPendientes: [],
});

function nuevoTx() {
  let n = 0;
  const m = {
    bodega: { findMany: vi.fn(async () => [{ id: "b1" }]) },
    cotizacion: {
      create: vi.fn(async (_a: Llamada) => ({ id: "q1" })),
      update: vi.fn(async (_a: Llamada) => ({})),
    },
    itemCotizacion: { create: vi.fn(async (_a: Llamada) => ({ id: `i${++n}` })) },
    cotizacionSeguimiento: { create: vi.fn(async (_a: Llamada) => ({})) },
    ordenTrabajo: {
      create: vi.fn(async (_a: Llamada) => ({ id: "o1" })),
      findUnique: vi.fn(async () => ({ vehiculoId: "v1", mecanicoId: null })),
      findFirst: vi.fn(async () => null),
      update: vi.fn(async (_a: Llamada) => ({})),
    },
    vehiculo: { findUnique: vi.fn(async () => ({ kilometraje: 50_000 })) },
    itemOrden: { create: vi.fn(async (_a: Llamada) => ({})) },
    manoDeObra: { create: vi.fn(async (_a: Llamada) => ({})) },
    danioOrden: { create: vi.fn(async (_a: Llamada) => ({})) },
    dvi: { create: vi.fn(async (_a: Llamada) => ({})) },
    dviChecklistItem: { findMany: vi.fn(async () => [{ key: "luces" }]) },
  };
  return { tx: m as unknown as TenantTx, m };
}

const evento = (destino: Extract<Evento, { tipo: "cotizacion" }>["destino"], ordenClave?: string) =>
  ({ tipo: "cotizacion", hora: "09:30", destino, ordenClave }) as Extract<Evento, { tipo: "cotizacion" }>;

const datos = (mock: { mock: { calls: unknown[][] } }, i = 0) => (mock.mock.calls[i]![0] as Llamada).data;
const todas = (mock: { mock: { calls: unknown[][] } }) => mock.mock.calls.map((c) => (c[0] as Llamada).data);
const ultimoEstado = (m: ReturnType<typeof nuevoTx>["m"]) =>
  todas(m.cotizacion.update).filter((d) => d.estado !== undefined).at(-1)!;

describe("registrarCotizacion", () => {
  it("la cotización nace marcada, de la sede y del cliente/vehículo, con ítems y totales de src/lib", async () => {
    const { tx, m } = nuevoTx();
    await registrarCotizacion(tx, nuevoCtx(), nuevoEstado(), dia, evento("ENVIADA"), crearAzar(5));
    const c = datos(m.cotizacion.create);
    expect(c).toMatchObject({ clienteId: "c1", vehiculoId: "v1", sedeId: "s1", creadoPorId: "rec1" });
    expect(c.motivo).toContain("[datos-semana]");
    const items = todas(m.itemCotizacion.create);
    expect(items.length).toBeGreaterThan(0);
    const actualizaciones = todas(m.cotizacion.update);
    const totales = actualizaciones.find((d) => d.total !== undefined)!;
    const dto = actualizaciones.find((d) => d.descuentoTipo !== undefined);
    const esperado = computeCotizacionTotales({
      items: items.map((i) => ({ tipo: i.tipo as "REPUESTO" | "MANO_OBRA", cantidad: Number(i.cantidad), precioUnitario: Number(i.precioUnitario) })),
      descuentoTipo: "PORCENTAJE", descuentoPct: Number(dto?.descuentoPct ?? 0),
    });
    expect(totales).toMatchObject({ subtotal: esperado.subtotal, descuento: esperado.descuento, iva: esperado.iva, total: esperado.total });
  });

  it("ENVIADA: pasa a ENVIADA con vigencia futura y al menos un seguimiento", async () => {
    const { tx, m } = nuevoTx();
    await registrarCotizacion(tx, nuevoCtx(), nuevoEstado(), dia, evento("ENVIADA"), crearAzar(5));
    const e = ultimoEstado(m);
    expect(e.estado).toBe("ENVIADA");
    expect((e.validaHasta as Date).getTime()).toBeGreaterThan(Date.now());
    expect(m.cotizacionSeguimiento.create.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(datos(m.cotizacionSeguimiento.create)).toMatchObject({ cotizacionId: "q1", creadoPorId: "rec1" });
  });

  it("RECHAZADA: pasa por ENVIADA y termina RECHAZADA, sin orden", async () => {
    const { tx, m } = nuevoTx();
    const estado = nuevoEstado();
    await registrarCotizacion(tx, nuevoCtx(), estado, dia, evento("RECHAZADA"), crearAzar(5));
    const estados = todas(m.cotizacion.update).map((d) => d.estado).filter(Boolean);
    expect(estados).toEqual(["ENVIADA", "RECHAZADA"]);
    expect(m.ordenTrabajo.create).not.toHaveBeenCalled();
    expect(estado.ordenes.size).toBe(0);
  });

  it("VENCIDA: con vigencia ya pasada respecto al evento y creada antes del evento", async () => {
    const { tx, m } = nuevoTx();
    await registrarCotizacion(tx, nuevoCtx(), nuevoEstado(), dia, evento("VENCIDA"), crearAzar(5));
    const inicio = new Date("2026-10-20T09:30:00-05:00").getTime();
    expect((datos(m.cotizacion.create).createdAt as Date).getTime()).toBeLessThan(inicio);
    expect(ultimoEstado(m).estado).toBe("VENCIDA");
    const enviada = todas(m.cotizacion.update).find((d) => d.estado === "ENVIADA")!;
    expect((enviada.validaHasta as Date).getTime()).toBeLessThan(inicio);
  });

  it("APROBADA: crea la orden con las líneas de la cotización, la enlaza y la registra en el estado", async () => {
    const { tx, m } = nuevoTx();
    const estado = nuevoEstado();
    await registrarCotizacion(tx, nuevoCtx(), estado, dia, evento("APROBADA", "o-1"), crearAzar(5));
    expect(estado.ordenes.get("o-1")).toBe("o1");
    expect(datos(m.ordenTrabajo.create)).toMatchObject({ clienteId: "c1", vehiculoId: "v1", sedeId: "s1" });
    expect(String(datos(m.ordenTrabajo.create).sintomas)).toContain("[datos-semana]");
    const tipos = todas(m.itemCotizacion.create).map((i) => i.tipo);
    expect(m.itemOrden.create.mock.calls.length).toBe(tipos.filter((t) => t === "REPUESTO").length);
    expect(m.manoDeObra.create.mock.calls.length).toBe(tipos.filter((t) => t === "MANO_OBRA").length);
    expect(ultimoEstado(m)).toMatchObject({ estado: "APROBADA", ordenId: "o1" });
  });

  it("APROBADA sin ordenClave es un error del plan", async () => {
    const { tx } = nuevoTx();
    await expect(registrarCotizacion(tx, nuevoCtx(), nuevoEstado(), dia, evento("APROBADA"), crearAzar(5)))
      .rejects.toThrow(/ordenClave/);
  });

  it("solo cotiza repuestos de la sede con existencias y reserva en ctx lo que la orden copia", async () => {
    for (let semilla = 1; semilla <= 20; semilla++) {
      const { tx, m } = nuevoTx();
      const ctx = nuevoCtx();
      await registrarCotizacion(tx, ctx, nuevoEstado(), dia, evento("APROBADA", "o-1"), crearAzar(semilla));
      const copiados = m.itemOrden.create.mock.calls.map((c) => (c[0] as Llamada).data);
      for (const it of copiados) expect(it.repuestoId).toBe("r1");
      const pedido = copiados.reduce((s, it) => s + Number(it.cantidad), 0);
      expect(ctx.repuestos.find((r) => r.id === "r1")!.stockActual).toBe(2 - pedido);
      expect(ctx.repuestos.every((r) => r.stockActual >= 0)).toBe(true);
    }
  });
});

describe("cotización atrasada y clientes del script", () => {
  it.each(["VENCIDA", "RECHAZADA"] as const)("%s nunca usa un cliente creado después de ella", async (destino) => {
    const { tx, m } = nuevoTx();
    const estado = nuevoEstado();
    estado.clientesCreados.push({ clienteId: "nuevo", vehiculoIds: ["nv"], creadoEn: new Date("2026-10-20T09:00:00-05:00") });
    await registrarCotizacion(tx, nuevoCtx(), estado, dia, evento(destino), crearAzar(5));
    expect(datos(m.cotizacion.create)).toMatchObject({ clienteId: "c1", vehiculoId: "v1" });
    expect(estado.clientesUsados.has("nuevo")).toBe(false);
  });

  it("ENVIADA (sin atraso) sí puede usar un cliente creado antes del evento", async () => {
    const { tx, m } = nuevoTx();
    const estado = nuevoEstado();
    estado.clientesCreados.push({ clienteId: "nuevo", vehiculoIds: ["nv"], creadoEn: new Date("2026-10-20T08:00:00-05:00") });
    await registrarCotizacion(tx, nuevoCtx(), estado, dia, evento("ENVIADA"), crearAzar(5));
    expect(datos(m.cotizacion.create)).toMatchObject({ clienteId: "nuevo", vehiculoId: "nv" });
  });

  it("VENCIDA: vigencia ya pasada y creada como mucho vigencia + 3 días antes", async () => {
    for (let semilla = 1; semilla <= 20; semilla++) {
      const { tx, m } = nuevoTx();
      await registrarCotizacion(tx, nuevoCtx(), nuevoEstado(), dia, evento("VENCIDA"), crearAzar(semilla));
      const inicio = new Date("2026-10-20T09:30:00-05:00").getTime();
      const enviada = todas(m.cotizacion.update).find((d) => d.estado === "ENVIADA")!;
      const vigencia = (enviada.validaHasta as Date).getTime();
      expect(vigencia).toBeLessThan(inicio);
      expect(inicio - (datos(m.cotizacion.create).createdAt as Date).getTime()).toBeLessThanOrEqual(10.1 * 86_400_000);
    }
  });
});

describe("crearOrden sobre una orden aprobada", () => {
  it("la completa (recepción, DVI, mano de obra, EN_PROCESO) sin crear otra ni más repuestos", async () => {
    const { tx, m } = nuevoTx();
    const estado = nuevoEstado();
    estado.ordenes.set("o-1", "o1");
    await crearOrden(tx, nuevoCtx(), estado, dia,
      { tipo: "crearOrden", hora: "11:00", clave: "o-1", borrador: false, conAnticipo: false }, crearAzar(3));
    expect(m.ordenTrabajo.create).not.toHaveBeenCalled();
    expect(m.itemOrden.create).not.toHaveBeenCalled();
    expect(m.dvi.create).toHaveBeenCalledTimes(1);
    expect(m.manoDeObra.create.mock.calls.length).toBeGreaterThanOrEqual(1);
    const updates = todas(m.ordenTrabajo.update);
    expect(updates.some((d) => d.mecanicoId === "m1")).toBe(true);
    expect(updates.some((d) => d.kilometrajeIngreso !== undefined)).toBe(true);
    expect(updates.at(-1)).toMatchObject({ estado: "EN_PROCESO" });
    expect(estado.ordenes.get("o-1")).toBe("o1");
  });
});
