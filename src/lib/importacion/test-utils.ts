import { HOJAS, type HojaContrato } from "./hojas";

/** Contrato por nombre, para los tests que necesitan una hoja concreta. */
export function porNombre(nombre: string): HojaContrato {
  const hoja = HOJAS.find((candidata) => candidata.nombre === nombre);
  if (!hoja) throw new Error(`No existe la hoja ${nombre} en el contrato`);
  return hoja;
}
