// src/modulos/factura-electronica/proveedores/nextpyme/catalogos.ts
import datos from "./catalogos.json";

type NombreCatalogo = Exclude<keyof typeof datos, "fuente">;

const NOMBRES: Record<NombreCatalogo, string> = {
  municipios: "municipio",
  tiposDocumentoIdentidad: "tipo de documento",
  tributos: "impuesto",
  unidades: "unidad de medida",
  mediosPago: "medio de pago",
  formasPago: "forma de pago",
  responsabilidades: "responsabilidad fiscal",
  regimenes: "régimen de IVA",
  tiposOrganizacion: "tipo de persona",
  conceptosNotaCredito: "concepto de nota crédito",
};

/** Código DIAN → ID de Nextpyme. Lanza si el código no existe en sus tablas. */
export function idNextpyme(catalogo: NombreCatalogo, codigoDian: string): number {
  const id = (datos[catalogo] as Record<string, number>)[codigoDian];
  if (id === undefined) {
    throw new Error(`Nextpyme no reconoce el ${NOMBRES[catalogo]} con código DIAN "${codigoDian}".`);
  }
  return id;
}
