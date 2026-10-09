import { describe, expect, it } from "vitest";
import {
  calcularCantidadSugerida,
  calcularObjetivoReposicion,
  calcularSeveridad,
  construirAlertasInventario,
  consumoPorSemana,
  type RepuestoAlertaInput,
} from "./alertas-inventario";

const HOY = new Date("2026-10-09T15:00:00.000Z");
const diasAtras = (n: number) => new Date(HOY.getTime() - n * 24 * 60 * 60 * 1000);

function repuesto(overrides: Partial<RepuestoAlertaInput> & { id: string }): RepuestoAlertaInput {
  return {
    codigo: overrides.id.toUpperCase(),
    nombre: `Repuesto ${overrides.id}`,
    stockActual: 0,
    stockMinimo: 5,
    precioCompra: 1000,
    stockMaximo: null,
    multiploCompra: 1,
    alertaPospuestaHasta: null,
    bodega: { id: "b1", nombre: "Principal" },
    proveedor: { id: "p1", nombre: "Bosch", telefono: null, email: null, diasEntrega: 3 },
    ...overrides,
  };
}

const vacio = { comprometidos: [], consumidos: [], entradas: [], hoy: HOY };

describe("calcularSeveridad", () => {
  it("classifies zero or negative disponible as SIN_DISPONIBLE", () => {
    expect(calcularSeveridad(0, 5)).toBe("SIN_DISPONIBLE");
    expect(calcularSeveridad(-2, 5)).toBe("SIN_DISPONIBLE");
  });

  it("classifies at or below half the minimum as CRITICO and the rest as BAJO_MINIMO", () => {
    expect(calcularSeveridad(2, 4)).toBe("CRITICO");
    expect(calcularSeveridad(3, 4)).toBe("BAJO_MINIMO");
    expect(calcularSeveridad(1, 0)).toBe("BAJO_MINIMO");
  });
});

describe("consumoPorSemana", () => {
  it("buckets units into 8 weeks, oldest first, ignoring older sales", () => {
    const semanas = consumoPorSemana(
      [
        { cantidad: 2, fecha: diasAtras(1) },
        { cantidad: 3, fecha: diasAtras(6) },
        { cantidad: 4, fecha: diasAtras(8) },
        { cantidad: 9, fecha: diasAtras(60) },
      ],
      HOY,
    );
    expect(semanas).toEqual([0, 0, 0, 0, 0, 0, 4, 5]);
  });
});

describe("calcularObjetivoReposicion", () => {
  it("uses the repuesto's stockMaximo when set, whatever the demand", () => {
    expect(calcularObjetivoReposicion({ stockMinimo: 5, stockMaximo: 8, consumoDiario: 3, diasEntrega: 3 })).toBe(8);
  });

  it("falls back to twice the minimum without consumption history", () => {
    expect(calcularObjetivoReposicion({ stockMinimo: 5, stockMaximo: null, consumoDiario: 0, diasEntrega: 3 })).toBe(10);
  });

  it("covers the proveedor's lead time + target coverage when demand is higher", () => {
    // 1/day * (10 + 14) = 24 units
    expect(calcularObjetivoReposicion({ stockMinimo: 3, stockMaximo: null, consumoDiario: 1, diasEntrega: 10 })).toBe(24);
  });
});

describe("calcularCantidadSugerida", () => {
  it("orders what is missing to reach the objetivo", () => {
    expect(calcularCantidadSugerida(1, 10, 1)).toBe(9);
  });

  it("rounds up to the pack size", () => {
    expect(calcularCantidadSugerida(1, 10, 6)).toBe(12);
  });

  it("discounts units already on their way, down to zero when they cover the objetivo", () => {
    expect(calcularCantidadSugerida(1, 10, 1, 4)).toBe(5);
    expect(calcularCantidadSugerida(1, 10, 1, 9)).toBe(0);
    expect(calcularCantidadSugerida(1, 10, 4, 3)).toBe(8);
  });

  it("never suggests less than one pack", () => {
    expect(calcularCantidadSugerida(5, 5, 1)).toBe(1);
    expect(calcularCantidadSugerida(5, 5, 4)).toBe(4);
  });
});

describe("construirAlertasInventario", () => {
  it("alerts on disponible (stock minus units on open ordenes), not raw stockActual", () => {
    const { alertas } = construirAlertasInventario({
      ...vacio,
      repuestos: [repuesto({ id: "a", stockActual: 8, stockMinimo: 5 })],
      comprometidos: [
        { repuestoId: "a", cantidad: 3, orden: { id: "o1", estado: "EN_PROCESO", placa: "ABC123", vehiculo: "Mazda 3" } },
        { repuestoId: "a", cantidad: 1, orden: { id: "o1", estado: "EN_PROCESO", placa: "ABC123", vehiculo: "Mazda 3" } },
      ],
    });

    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({ comprometido: 4, disponible: 4, severidad: "BAJO_MINIMO", frenaOrdenes: false });
    expect(alertas[0].ordenes).toEqual([{ id: "o1", estado: "EN_PROCESO", placa: "ABC123", vehiculo: "Mazda 3", cantidad: 4 }]);
  });

  it("skips repuestos whose disponible is above the minimum", () => {
    const { alertas } = construirAlertasInventario({ ...vacio, repuestos: [repuesto({ id: "a", stockActual: 6, stockMinimo: 5 })] });
    expect(alertas).toEqual([]);
  });

  it("flags frenaOrdenes when open ordenes need more than physical stock and lists them in the resumen", () => {
    const { alertas, resumen } = construirAlertasInventario({
      ...vacio,
      repuestos: [repuesto({ id: "a", stockActual: 1, stockMinimo: 4 })],
      comprometidos: [
        { repuestoId: "a", cantidad: 2, orden: { id: "o1", estado: "BORRADOR", placa: "XYZ987", vehiculo: "Chevrolet Onix" } },
      ],
    });

    expect(alertas[0]).toMatchObject({ disponible: -1, severidad: "SIN_DISPONIBLE", frenaOrdenes: true, diasCobertura: 0 });
    expect(resumen.ordenesFrenadas).toEqual([{ id: "o1", placa: "XYZ987", vehiculo: "Chevrolet Onix" }]);
  });

  it("derives consumo, cobertura and the price change between the last two purchases", () => {
    const { alertas, resumen } = construirAlertasInventario({
      ...vacio,
      repuestos: [repuesto({ id: "a", stockActual: 3, stockMinimo: 5, precioCompra: 2000 })],
      consumidos: [{ repuestoId: "a", cantidad: 45, fecha: diasAtras(10) }],
      entradas: [
        { repuestoId: "a", cantidad: 10, precioCompraUnitario: 1000, fecha: diasAtras(40), proveedorNombre: "Bosch" },
        { repuestoId: "a", cantidad: 6, precioCompraUnitario: 1100, fecha: diasAtras(5), proveedorNombre: "Bosch" },
      ],
    });

    const [alerta] = alertas;
    expect(alerta.consumoDiario).toBeCloseTo(0.5);
    expect(alerta.diasCobertura).toBe(6);
    expect(alerta.ultimaCompra).toMatchObject({ cantidad: 6, precioUnitario: 1100, proveedorNombre: "Bosch" });
    expect(alerta.ultimaCompra?.variacionPrecioPct).toBeCloseTo(10);
    expect(alerta.cantidadSugerida).toBe(7);
    expect(alerta.costoSugerido).toBe(14000);
    expect(resumen).toMatchObject({ total: 1, criticos: 0, bajoMinimo: 1, seAgotanEn7Dias: 1, costoReposicion: 14000 });
  });

  it("flags rows that run out before an order placed today would arrive", () => {
    const { alertas } = construirAlertasInventario({
      ...vacio,
      repuestos: [
        repuesto({
          id: "a",
          stockActual: 2,
          stockMinimo: 5,
          multiploCompra: 4,
          proveedor: { id: "p1", nombre: "Bosch", telefono: null, email: null, diasEntrega: 5 },
        }),
      ],
      consumidos: [{ repuestoId: "a", cantidad: 45, fecha: diasAtras(10) }],
    });

    // 0.5/day: 2 units last 4 days, delivery takes 5
    expect(alertas[0]).toMatchObject({ diasCobertura: 4, diasEntrega: 5, seAgotaAntesDeEntrega: true });
    // objetivo max(10, ceil(0.5 * 19) = 10) = 10 -> 8 missing -> 2 packs of 4
    expect(alertas[0]).toMatchObject({ objetivoReposicion: 10, cantidadSugerida: 8 });
  });

  it("marks only alerts snoozed into the future as pospuestas, and keeps counting them", () => {
    const { alertas, resumen } = construirAlertasInventario({
      ...vacio,
      repuestos: [
        repuesto({ id: "futura", stockActual: 1, alertaPospuestaHasta: new Date(HOY.getTime() + 2 * 24 * 60 * 60 * 1000) }),
        repuesto({ id: "vencida", stockActual: 1, alertaPospuestaHasta: diasAtras(1) }),
      ],
    });

    expect(alertas.find((alerta) => alerta.id === "futura")?.pospuestaHasta).toBe("2026-10-11T15:00:00.000Z");
    expect(alertas.find((alerta) => alerta.id === "vencida")?.pospuestaHasta).toBeNull();
    expect(resumen).toMatchObject({ total: 2, pospuestas: 1 });
  });

  it("uses the default lead time for repuestos without proveedor", () => {
    const { alertas } = construirAlertasInventario({ ...vacio, repuestos: [repuesto({ id: "a", stockActual: 1, proveedor: null })] });
    expect(alertas[0].diasEntrega).toBe(3);
  });

  it("leaves diasCobertura null without consumption history", () => {
    const { alertas } = construirAlertasInventario({ ...vacio, repuestos: [repuesto({ id: "a", stockActual: 2, stockMinimo: 5 })] });
    expect(alertas[0].diasCobertura).toBeNull();
    expect(alertas[0].ultimaCompra).toBeNull();
  });

  it("sorts ordenes-blocking rows first, then by severity, then by deficit", () => {
    const { alertas, resumen } = construirAlertasInventario({
      ...vacio,
      repuestos: [
        repuesto({ id: "bajo", stockActual: 4, stockMinimo: 5 }),
        repuesto({ id: "critico", stockActual: 1, stockMinimo: 5 }),
        repuesto({ id: "agotado", stockActual: 0, stockMinimo: 5 }),
        repuesto({ id: "frena", stockActual: 4, stockMinimo: 5 }),
      ],
      comprometidos: [
        { repuestoId: "frena", cantidad: 5, orden: { id: "o1", estado: "EN_PROCESO", placa: "AAA111", vehiculo: "Kia Rio" } },
      ],
    });

    expect(alertas.map((alerta) => alerta.id)).toEqual(["frena", "agotado", "critico", "bajo"]);
    expect(resumen).toMatchObject({ total: 4, sinDisponible: 2, criticos: 1, bajoMinimo: 1 });
  });
});
