/**
 * Contrato de las hojas de la plantilla de importación (Fase 20).
 *
 * Es la única fuente de verdad de las columnas: lo usan el generador de la
 * plantilla, el lector de lo que sube el taller y los tests, así que la
 * plantilla que se descarga y lo que el importador entiende no pueden divergir.
 * Los encabezados se comparan normalizados (ver `normalizarEncabezado`), por eso
 * aquí se escriben con tildes: es lo que ve el usuario en el Excel.
 */

import { normalizarEncabezado } from "./normalizar";

export type TipoColumna = "texto" | "entero" | "dinero" | "fecha" | "booleano" | "enum";

export interface ColumnaHoja {
  /** Clave interna del dato, la que usan el validador y el importador. */
  clave: string;
  /** Encabezado que se escribe en la plantilla. */
  encabezado: string;
  /** Otras formas en que el taller puede titular la misma columna. */
  aliases: string[];
  obligatoria: boolean;
  tipo: TipoColumna;
  /** Valor de la fila de ejemplo de la plantilla. */
  ejemplo: string;
  nota?: string;
}

export interface HojaContrato {
  nombre: string;
  /** Columna cuya clave decide si la fila ya existe (D6). */
  claveDuplicado: string;
  columnas: ColumnaHoja[];
  nota?: string;
}

/** Tope de filas por hoja: lo que sobre se reporta como rechazado (D7). */
export const MAX_FILAS_POR_HOJA = 2000;
/** Tope de rechazos que se devuelven al navegador; el resto se cuenta (D7). */
export const MAX_RECHAZOS_VISIBLES = 200;
/** Tope de tamaño del archivo, por debajo del `bodySizeLimit` de 6 MB (D7). */
export const MAX_BYTES_ARCHIVO = 5 * 1024 * 1024;
export const HOJA_INSTRUCCIONES = "Instrucciones";

export const HOJAS: HojaContrato[] = [
  {
    nombre: "Clientes",
    claveDuplicado: "documento",
    nota: "El documento y el correo son opcionales; el nombre es obligatorio.",
    columnas: [
      { clave: "nombre", encabezado: "Nombre", aliases: ["cliente"], obligatoria: true, tipo: "texto", ejemplo: "María Pérez" },
      {
        clave: "documento",
        encabezado: "Documento",
        aliases: ["nit", "cedula", "cédula", "cc", "identificacion"],
        obligatoria: false,
        tipo: "texto",
        ejemplo: "1.020.456.789",
        nota: "Si ya existe un cliente con este documento, la fila se omite.",
      },
      {
        clave: "telefono",
        encabezado: "Teléfono",
        aliases: ["celular", "whatsapp", "movil", "móvil"],
        obligatoria: false,
        tipo: "texto",
        ejemplo: "310 555 1234",
      },
      {
        clave: "email",
        encabezado: "Correo",
        aliases: ["email", "correo electronico", "correo electrónico", "e-mail"],
        obligatoria: false,
        tipo: "texto",
        ejemplo: "maria@correo.com",
      },
    ],
  },
  {
    nombre: "Vehículos",
    claveDuplicado: "placa",
    nota: "Cada vehículo necesita su cliente: por documento o por nombre, en esta hoja o en la de Clientes.",
    columnas: [
      {
        clave: "placa",
        encabezado: "Placa",
        aliases: ["matricula", "matrícula", "patente"],
        obligatoria: true,
        tipo: "texto",
        ejemplo: "ABC123",
        nota: "Se compara sin espacios ni guiones: ABC-123 y ABC123 son la misma placa.",
      },
      { clave: "marca", encabezado: "Marca", aliases: [], obligatoria: true, tipo: "texto", ejemplo: "Renault" },
      { clave: "modelo", encabezado: "Modelo", aliases: ["linea", "línea"], obligatoria: true, tipo: "texto", ejemplo: "Logan" },
      {
        clave: "documentoCliente",
        encabezado: "Documento cliente",
        aliases: ["documento", "cedula", "cédula", "nit", "cc"],
        obligatoria: false,
        tipo: "texto",
        ejemplo: "1.020.456.789",
      },
      {
        clave: "nombreCliente",
        encabezado: "Nombre cliente",
        aliases: ["cliente", "propietario"],
        obligatoria: false,
        tipo: "texto",
        ejemplo: "María Pérez",
      },
      {
        clave: "tipo",
        encabezado: "Tipo",
        aliases: ["clase"],
        obligatoria: false,
        tipo: "enum",
        ejemplo: "CARRO",
        nota: "CARRO o MOTO; vacío se toma CARRO.",
      },
      { clave: "anio", encabezado: "Año", aliases: ["anio", "modelo año"], obligatoria: false, tipo: "entero", ejemplo: "2021" },
      { clave: "kilometraje", encabezado: "Kilometraje", aliases: ["km", "kms", "kilómetros"], obligatoria: false, tipo: "entero", ejemplo: "85000" },
      { clave: "color", encabezado: "Color", aliases: [], obligatoria: false, tipo: "texto", ejemplo: "Gris" },
      {
        clave: "vin",
        encabezado: "VIN",
        aliases: ["chasis", "numero de chasis", "número de chasis"],
        obligatoria: false,
        tipo: "texto",
        ejemplo: "9BD12345678901234",
        nota: "17 caracteres, sin las letras I, O ni Q.",
      },
      { clave: "combustible", encabezado: "Combustible", aliases: [], obligatoria: false, tipo: "enum", ejemplo: "GASOLINA" },
      { clave: "transmision", encabezado: "Transmisión", aliases: ["transmision", "caja"], obligatoria: false, tipo: "enum", ejemplo: "MANUAL" },
      {
        clave: "soatVence",
        encabezado: "SOAT vence",
        aliases: ["soat", "vencimiento soat"],
        obligatoria: false,
        tipo: "fecha",
        ejemplo: "15/03/2027",
      },
      {
        clave: "tecnomecanicaVence",
        encabezado: "Tecnomecánica vence",
        aliases: ["tecnomecanica", "tecnicomecanica", "rtm"],
        obligatoria: false,
        tipo: "fecha",
        ejemplo: "20/11/2026",
      },
      { clave: "observaciones", encabezado: "Observaciones", aliases: ["notas"], obligatoria: false, tipo: "texto", ejemplo: "Cliente frecuente" },
    ],
  },
  {
    nombre: "Repuestos",
    claveDuplicado: "codigo",
    nota: "Los repuestos entran en la bodega que elijas al subir el archivo; la cantidad inicial deja una entrada de mercancía.",
    columnas: [
      {
        clave: "codigo",
        encabezado: "Código",
        aliases: ["codigo", "sku", "referencia", "cod"],
        obligatoria: true,
        tipo: "texto",
        ejemplo: "FIL-001",
        nota: "Único en todo el taller: si ya existe, la fila se omite.",
      },
      { clave: "nombre", encabezado: "Nombre", aliases: ["repuesto"], obligatoria: true, tipo: "texto", ejemplo: "Filtro de aceite" },
      { clave: "descripcion", encabezado: "Descripción", aliases: ["descripcion", "observaciones"], obligatoria: false, tipo: "texto", ejemplo: "Filtro de aceite motor 1.6" },
      {
        clave: "precioCompra",
        encabezado: "Precio compra",
        aliases: ["costo", "precio costo"],
        obligatoria: true,
        tipo: "dinero",
        ejemplo: "12.500,00",
      },
      { clave: "precioVenta", encabezado: "Precio venta", aliases: ["precio", "pvp"], obligatoria: true, tipo: "dinero", ejemplo: "25.000,00" },
      { clave: "stockMinimo", encabezado: "Stock mínimo", aliases: ["minimo", "mínimo", "min"], obligatoria: false, tipo: "entero", ejemplo: "5" },
      { clave: "stockMaximo", encabezado: "Stock máximo", aliases: ["maximo", "máximo", "max"], obligatoria: false, tipo: "entero", ejemplo: "20" },
      { clave: "multiploCompra", encabezado: "Múltiplo compra", aliases: ["multiplo", "múltiplo", "empaque"], obligatoria: false, tipo: "entero", ejemplo: "1" },
      {
        clave: "cantidadInicial",
        encabezado: "Cantidad inicial",
        aliases: ["stock inicial", "cantidad", "stock"],
        obligatoria: false,
        tipo: "entero",
        ejemplo: "10",
        nota: "Requiere elegir un proveedor al subir el archivo.",
      },
    ],
  },
  {
    nombre: "Servicios",
    claveDuplicado: "nombre",
    nota: "Solo un administrador puede importar esta hoja; los kits se arman después en el catálogo.",
    columnas: [
      {
        clave: "nombre",
        encabezado: "Nombre",
        aliases: ["servicio"],
        obligatoria: true,
        tipo: "texto",
        ejemplo: "Cambio de aceite",
        nota: "Único sin distinguir mayúsculas: si ya existe, la fila se omite.",
      },
      { clave: "descripcion", encabezado: "Descripción", aliases: ["descripcion", "detalle"], obligatoria: false, tipo: "texto", ejemplo: "Incluye filtro y revisión" },
      {
        clave: "precioManoObra",
        encabezado: "Precio mano de obra",
        aliases: ["precio", "valor", "mano de obra"],
        obligatoria: true,
        tipo: "dinero",
        ejemplo: "45.000",
      },
      { clave: "activo", encabezado: "Activo", aliases: [], obligatoria: false, tipo: "booleano", ejemplo: "sí" },
    ],
  },
];

/** Hoja del contrato a partir del nombre que trae el archivo (tildes aparte). */
export function buscarHoja(nombre: unknown): HojaContrato | null {
  const buscado = normalizarEncabezado(nombre);
  if (!buscado) return null;
  return HOJAS.find((hoja) => normalizarEncabezado(hoja.nombre) === buscado) ?? null;
}

export interface ColumnasResueltas {
  /** clave de la columna → índice en la fila del archivo. */
  indices: Map<string, number>;
  /** Claves de las columnas obligatorias que no aparecieron. */
  faltantes: string[];
}

/**
 * Empareja los encabezados reales del archivo con las columnas del contrato.
 * Un encabezado solo se usa una vez, así que dos columnas parecidas del contrato
 * ("Precio compra" y "Precio venta") no pueden quedarse con la misma celda.
 */
export function resolverColumnas(hoja: HojaContrato, encabezados: unknown[]): ColumnasResueltas {
  const normalizados = encabezados.map((encabezado) => normalizarEncabezado(encabezado));
  const indices = new Map<string, number>();
  const usados = new Set<number>();

  for (const columna of hoja.columnas) {
    const candidatos = [columna.encabezado, ...columna.aliases].map((valor) => normalizarEncabezado(valor));
    const posicion = normalizados.findIndex(
      (encabezado, indice) => encabezado !== "" && !usados.has(indice) && candidatos.includes(encabezado),
    );
    if (posicion >= 0) {
      indices.set(columna.clave, posicion);
      usados.add(posicion);
    }
  }

  const faltantes = hoja.columnas
    .filter((columna) => columna.obligatoria && !indices.has(columna.clave))
    .map((columna) => columna.clave);

  return { indices, faltantes };
}
