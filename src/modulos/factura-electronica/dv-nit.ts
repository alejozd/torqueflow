// src/modulos/factura-electronica/dv-nit.ts
const PESOS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

/** Dígito de verificación de un NIT colombiano (algoritmo módulo 11 de la DIAN). */
export function calcularDvNit(nit: string): string {
  const digitos = nit.replace(/\D/g, "");
  if (digitos.length === 0 || digitos.length > PESOS.length) {
    throw new Error(`NIT inválido: "${nit}"`);
  }
  let suma = 0;
  const invertido = digitos.split("").reverse();
  invertido.forEach((d, i) => {
    suma += Number(d) * PESOS[i];
  });
  const residuo = suma % 11;
  return String(residuo > 1 ? 11 - residuo : residuo);
}
