/**
 * Plantilla que se descarga el taller desde `/importar`: un libro con una hoja
 * por entidad (encabezados del contrato, fila de ejemplo y ancho de columna) más
 * una hoja de instrucciones.
 *
 * Las columnas obligatorias se marcan con un asterisco en el encabezado, que la
 * normalización ignora al leer, así que la plantilla sigue siendo legible por el
 * propio importador (hay un test de ida y vuelta que lo comprueba).
 */

import { HOJAS, HOJA_INSTRUCCIONES, type ColumnaHoja } from "./hojas";
import { escribirLibro, type HojaEscrita } from "./xlsx";

const ANCHO_MINIMO = 14;
const ANCHO_MAXIMO = 42;

export const ENCABEZADO_OBLIGATORIO = (columna: ColumnaHoja) =>
  columna.obligatoria ? `${columna.encabezado} *` : columna.encabezado;

export const NOTA_OBLIGATORIAS = "Las columnas marcadas con * son obligatorias.";

function anchoDe(columna: ColumnaHoja): number {
  const largo = Math.max(ENCABEZADO_OBLIGATORIO(columna).length, columna.ejemplo.length) + 2;
  return Math.min(Math.max(largo, ANCHO_MINIMO), ANCHO_MAXIMO);
}

const INSTRUCCIONES: (string | number | boolean | null)[][] = [
  ["Importar desde Excel — TorqueFlow"],
  [],
  ["Cómo usarlo"],
  ["1. Llena las hojas que necesites. Las que dejes vacías no se importan."],
  ["2. No cambies los encabezados de las columnas: el sistema los busca por su nombre."],
  [NOTA_OBLIGATORIAS],
  ["3. La segunda fila de cada hoja es un EJEMPLO, no un dato real: reemplázala por tus datos o bórrala."],
  ["4. Guarda y sube el archivo en Administración → Importar."],
  [],
  ["Qué hace con tus datos"],
  ["- Solo agrega. Si un cliente, vehículo, repuesto o servicio ya existe, esa fila se omite y se te informa."],
  ["- Nada se sobrescribe: puedes volver a subir el mismo archivo sin miedo."],
  ["- Las filas con errores se listan con su número de fila y el motivo, y las demás sí entran."],
  [],
  ["Cómo escribir los datos"],
  ["- Números: como en Colombia, con coma decimal y punto de miles. Ejemplo: 1.500,50"],
  ["- Fechas: día/mes/año. Ejemplo: 15/03/2027"],
  ["- Sí/No: escribe sí o no."],
  [],
  ["Hojas"],
  ...HOJAS.map((hoja) => [`- ${hoja.nombre}: ${hoja.nota ?? ""}`]),
  [],
  ["Orden recomendado (si subes todo en un solo archivo)"],
  ["- Clientes primero: los vehículos buscan su cliente por documento o por nombre."],
  [
    "- Repuestos: se cargan en la bodega que elijas al subir el archivo. Si pones cantidad inicial, " +
      "elegirás también un proveedor y quedará registrada la entrada de mercancía.",
  ],
  ["- Servicios: solo los puede importar un administrador."],
];

/** Construye el libro completo de la plantilla. */
export async function construirPlantilla(): Promise<Buffer> {
  const hojas: HojaEscrita[] = HOJAS.map((hoja) => ({
    nombre: hoja.nombre,
    filas: [hoja.columnas.map(ENCABEZADO_OBLIGATORIO), hoja.columnas.map((columna) => columna.ejemplo)],
    anchos: hoja.columnas.map(anchoDe),
  }));

  hojas.push({ nombre: HOJA_INSTRUCCIONES, filas: INSTRUCCIONES, anchos: [110] });

  return escribirLibro(hojas);
}
