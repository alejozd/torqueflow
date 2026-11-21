// src/modulos/factura-electronica/iva-incluido.ts
import { calcularTotales } from "./calculo";
import type { Centavos, Linea } from "./modelo";

/** Concepto tal como lo guarda un programa con precios que ya incluyen el IVA. */
export interface LineaConIva {
  codigo: string;
  descripcion: string;
  /** Hasta 2 decimales. */
  cantidad: number;
  unidad: string;
  /** Precio unitario final (con IVA incluido), en centavos. */
  precioFinalUnitario: Centavos;
  /** null = excluido (sin IVA); 0 = exento. */
  tarifa: number | null;
}

export interface ConversionIvaIncluido {
  /** Líneas con precio SIN IVA y sin descuento de línea (el descuento ya va restado del precio). */
  lineas: Linea[];
  /** Suma de los precios finales menos el descuento: lo que dice la factura interna. */
  totalEsperado: Centavos;
  /** calcularTotales(lineas).totalAPagar: lo que dirá el documento electrónico. */
  totalElectronico: Centavos;
  /** totalElectronico − totalEsperado. Casi siempre 0; si no, la factura interna se ajusta. */
  diferencia: Centavos;
}

/** Igual que calcularLinea: precio × cantidad con la cantidad escalada a entero. */
const importe = (precio: Centavos, cantidad: number) => Math.round((precio * Math.round(cantidad * 100)) / 100);

/**
 * Reparte `total` en proporción a `pesos` por el método del mayor residuo: la suma es exacta
 * y ninguna parte queda negativa ni mayor que su peso. Los empates favorecen a las últimas líneas.
 */
function repartir(total: Centavos, pesos: Centavos[]): Centavos[] {
  const suma = pesos.reduce((a, b) => a + b, 0);
  if (total === 0 || suma === 0) return pesos.map(() => 0);
  const exactas = pesos.map((p) => (total * p) / suma);
  const partes = exactas.map((e) => Math.floor(e));
  let resto = total - partes.reduce((a, b) => a + b, 0);
  const orden = exactas
    .map((e, i) => ({ i, fraccion: e - Math.floor(e) }))
    .sort((a, b) => b.fraccion - a.fraccion || b.i - a.i);
  for (const { i } of orden) {
    if (resto <= 0) break;
    partes[i] += 1;
    resto -= 1;
  }
  return partes;
}

/**
 * Precio unitario sin IVA `p` tal que importe(p) + IVA(importe(p)) quede lo más cerca posible de
 * `total` (spec §11.3). Replica el redondeo de calcularLinea. En empate gana el menor.
 */
function precioSinIva(total: Centavos, cantidad: number, tarifa: number | null): Centavos {
  const q100 = Math.round(cantidad * 100);
  if (q100 <= 0) return 0;
  const valor = (p: number) => {
    const bruto = Math.round((p * q100) / 100);
    return bruto + (tarifa === null ? 0 : Math.round((bruto * tarifa) / 100));
  };
  const estimado = Math.round(total / ((q100 / 100) * (1 + (tarifa ?? 0) / 100)));
  let mejor = Math.max(0, estimado - 3);
  for (let p = mejor + 1; p <= estimado + 3; p++) {
    if (Math.abs(valor(p) - total) < Math.abs(valor(mejor) - total)) mejor = p;
  }
  return mejor;
}

/**
 * Convierte conceptos con IVA incluido y un descuento global en líneas del núcleo (spec §11.3–11.5):
 * el descuento se reparte en proporción al valor de cada concepto y se resta de su precio; luego se
 * busca el precio sin IVA que reproduce el valor final.
 */
export function lineasDesdePreciosConIva(lineas: LineaConIva[], descuentoTotal: Centavos): ConversionIvaIncluido {
  const importes = lineas.map((l) => importe(l.precioFinalUnitario, l.cantidad));
  const subtotal = importes.reduce((a, b) => a + b, 0);
  if (!Number.isInteger(descuentoTotal) || descuentoTotal < 0 || descuentoTotal > subtotal) {
    throw new Error("El descuento no puede ser negativo ni mayor que el valor de los conceptos.");
  }
  const descuentos = repartir(descuentoTotal, importes);
  const convertidas: Linea[] = lineas.map((l, i) => ({
    codigo: l.codigo,
    descripcion: l.descripcion,
    cantidad: l.cantidad,
    unidad: l.unidad,
    precioUnitario: precioSinIva(importes[i] - descuentos[i], l.cantidad, l.tarifa),
    descuento: 0,
    iva: l.tarifa === null ? null : { tarifa: l.tarifa },
  }));
  const totalEsperado = subtotal - descuentoTotal;
  const totalElectronico = calcularTotales(convertidas).totalAPagar;
  return { lineas: convertidas, totalEsperado, totalElectronico, diferencia: totalElectronico - totalEsperado };
}
