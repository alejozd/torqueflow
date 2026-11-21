// src/modulos/factura-electronica/calculo.ts
import type { ImpuestoTotal, Linea, Totales, TotalesLinea } from "./modelo";

export function calcularLinea(l: Linea): TotalesLinea {
  const bruto = Math.round((l.precioUnitario * Math.round(l.cantidad * 100)) / 100);
  const neto = bruto - l.descuento;
  const iva = l.iva ? Math.round((neto * l.iva.tarifa) / 100) : 0;
  return { bruto, descuento: l.descuento, neto, iva };
}

/**
 * Totales del documento según las reglas DIAN: el impuesto del documento es la
 * suma de los impuestos de sus líneas (consolidado por tarifa) y la base
 * gravable solo suma las líneas que llevan IVA (las exentas al 0 % sí cuentan,
 * las excluidas no).
 */
export function calcularTotales(lineas: Linea[]): Totales {
  const totalesLineas = lineas.map(calcularLinea);
  const porTarifa = new Map<number, ImpuestoTotal>();
  let bruto = 0;
  let baseGravable = 0;
  let totalImpuestos = 0;

  lineas.forEach((l, i) => {
    const t = totalesLineas[i];
    bruto += t.neto;
    if (!l.iva) return;
    baseGravable += t.neto;
    totalImpuestos += t.iva;
    const acumulado = porTarifa.get(l.iva.tarifa) ?? { tarifa: l.iva.tarifa, base: 0, valor: 0 };
    acumulado.base += t.neto;
    acumulado.valor += t.iva;
    porTarifa.set(l.iva.tarifa, acumulado);
  });

  const impuestos = [...porTarifa.values()].sort((a, b) => b.tarifa - a.tarifa);
  const totalConImpuestos = bruto + totalImpuestos;
  return {
    lineas: totalesLineas,
    bruto,
    baseGravable,
    impuestos,
    totalImpuestos,
    totalConImpuestos,
    totalAPagar: totalConImpuestos,
  };
}
