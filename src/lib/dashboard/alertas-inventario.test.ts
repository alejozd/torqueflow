import { describe, expect, it } from "vitest";
import {
  calcularCantidadSugerida,
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
    bodega: { id: "b1", nombre: "Principal" },
    proveedor: { id: "p1", nombre: "Bosch", telefono: null, email: null },
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

describe("calcularCantidadSugerida", () => {
  it("restocks to twice the minimum when there is no consumption history", () => {
    expect(calcularCantidadSugerida(1, 5, 0)).toBe(9);
  });

  it("covers lead time + target coverage when demand is higher than 2x minimum", () => {
    // 1/day * (3 + 14) = 17 units, minus 2 available
    expect(calcularCantidadSugerida(2, 3, 1)).toBe(15);
  });

  it("never suggests less than one unit", () => {
    expect(calcularCantidadSugerida(0, 0, 0)).toBe(1);
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
