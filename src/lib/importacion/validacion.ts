/**
 * Validación fila por fila (D3/D10): primero se normaliza lo que escribió el
 * taller, después se reutilizan los esquemas Zod del proyecto tal cual, y cada
 * error se traduce a (fila, columna, motivo) con el contrato de hojas.
 *
 * La validación es pura a propósito: la acción de importación solo se encarga de
 * leer, consultar la base y escribir. Todo lo que se puede probar sin base de
 * datos se prueba aquí.
 */

import type { ZodError } from "zod";
import { clienteInputSchema } from "@/lib/validation/cliente";
import { CANTIDAD_MAXIMA_LINEA, repuestoInputSchema, repuestoStockInicialSchema } from "@/lib/validation/inventario";
import { servicioInputSchema } from "@/lib/validation/servicio";
import { vehiculoInputSchema } from "@/lib/validation/vehiculo";
import { claveCodigo, claveDocumento, claveNombreCliente, claveNombreServicio, clavePlaca } from "./duplicados";
import type { FilaCruda, LecturaHoja } from "./lectura";
import { valorDeColumna } from "./lectura";
import { normalizarBooleano, normalizarEncabezado, normalizarEntero, normalizarFecha, normalizarNumero, normalizarTexto } from "./normalizar";
import type { FilaReporte } from "./resultado";

export type LecturaOk = Extract<LecturaHoja, { ok: true }>;

export interface ClienteImportado {
  numeroFila: number;
  claves: string[];
  nombre: string;
  telefono: string | null;
  email: string | null;
  documento: string | null;
}

export interface VehiculoImportado {
  numeroFila: number;
  claves: string[];
  placa: string;
  marca: string;
  modelo: string;
  tipo: string;
  anio: number | null;
  kilometraje: number | null;
  color: string | null;
  vin: string | null;
  combustible: string | null;
  transmision: string | null;
  soatVence: Date | null;
  tecnomecanicaVence: Date | null;
  observaciones: string | null;
  documentoCliente: string | null;
  nombreCliente: string | null;
}

export interface RepuestoImportado {
  numeroFila: number;
  claves: string[];
  codigo: string;
  nombre: string;
  descripcion: string | null;
  precioCompra: number;
  precioVenta: number;
  stockMinimo: number;
  stockMaximo: number | null;
  multiploCompra: number;
  cantidadInicial: number;
}

export interface ServicioImportado {
  numeroFila: number;
  claves: string[];
  nombre: string;
  descripcion: string | null;
  precioManoObra: number;
  activo: boolean;
}

export interface ValidacionHoja<T> {
  validas: T[];
  rechazos: FilaReporte[];
}

type Campo<T> = { ok: true; valor: T } | { ok: false; motivo: string };

const HOJA_CLIENTES = "Clientes";
const HOJA_VEHICULOS = "Vehículos";
const HOJA_REPUESTOS = "Repuestos";
const HOJA_SERVICIOS = "Servicios";

/** Techo de cualquier columna de dinero de la importación: son Decimal(10,2). */
const MONTO_MAXIMO = 99_999_999.99;
const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 2 });

const COLUMNAS_CLIENTE: Record<string, string> = {
  nombre: "Nombre",
  documento: "Documento",
  telefono: "Teléfono",
  email: "Correo",
};

const COLUMNAS_VEHICULO: Record<string, string> = {
  placa: "Placa",
  marca: "Marca",
  modelo: "Modelo",
  tipo: "Tipo",
  anio: "Año",
  kilometraje: "Kilometraje",
  color: "Color",
  vin: "VIN",
  combustible: "Combustible",
  transmision: "Transmisión",
  soatVence: "SOAT vence",
  tecnomecanicaVence: "Tecnomecánica vence",
  observaciones: "Observaciones",
};

const COLUMNAS_REPUESTO: Record<string, string> = {
  codigo: "Código",
  nombre: "Nombre",
  descripcion: "Descripción",
  precioCompra: "Precio compra",
  precioVenta: "Precio venta",
  stockMinimo: "Stock mínimo",
  stockMaximo: "Stock máximo",
  multiploCompra: "Múltiplo compra",
};

const COLUMNAS_SERVICIO: Record<string, string> = {
  nombre: "Nombre",
  descripcion: "Descripción",
  precioManoObra: "Precio mano de obra",
};

function rechazo(
  hoja: string,
  fila: number,
  columna: string | null,
  motivo: string,
  tipo: FilaReporte["tipo"] = "rechazada",
): FilaReporte {
  return { hoja, fila, columna, valor: null, motivo, tipo };
}

function rechazosDeZod(hoja: string, fila: number, error: ZodError, columnas: Record<string, string>): FilaReporte[] {
  return error.issues.map((issue) => {
    const campo = String(issue.path[0] ?? "");
    return rechazo(hoja, fila, columnas[campo] ?? null, issue.message);
  });
}

const clavesDe = (claves: (string | null)[]) => claves.filter((clave): clave is string => clave !== null);

// ---------------------------------------------------------------- campos

function campoTexto(lectura: LecturaOk, fila: FilaCruda, clave: string): string {
  const valor = valorDeColumna(lectura.indices, fila, clave);
  return valor === undefined ? "" : normalizarTexto(valor);
}

interface Limites {
  min?: number;
  max?: number;
}

function campoEntero(
  lectura: LecturaOk,
  fila: FilaCruda,
  clave: string,
  limites: Limites = {},
): Campo<number | null> {
  const valor = valorDeColumna(lectura.indices, fila, clave);
  if (valor === undefined) return { ok: true, valor: null };
  const numero = normalizarEntero(valor);
  if (numero === null) return { ok: false, motivo: `"${normalizarTexto(valor)}" no es un número entero` };
  // Los esquemas del proyecto no siempre traen mensaje propio para los rangos
  // numéricos (Zod contestaría en inglés), así que el rango se avisa aquí.
  if (limites.min !== undefined && numero < limites.min) {
    return { ok: false, motivo: `${numero} es menor que el mínimo permitido (${limites.min})` };
  }
  if (limites.max !== undefined && numero > limites.max) {
    return { ok: false, motivo: `${numero} supera el máximo permitido (${limites.max})` };
  }
  return { ok: true, valor: numero };
}

function campoDinero(lectura: LecturaOk, fila: FilaCruda, clave: string): Campo<number | null> {
  const valor = valorDeColumna(lectura.indices, fila, clave);
  if (valor === undefined) return { ok: true, valor: null };
  const numero = normalizarNumero(valor);
  if (numero === null) return { ok: false, motivo: `"${normalizarTexto(valor)}" no es un número` };
  // Las columnas de dinero son Decimal(10,2): sin este tope, un dígito de más
  // revienta la escritura y tumba la hoja entera con un error genérico.
  if (numero > MONTO_MAXIMO) {
    return { ok: false, motivo: `${formatoMoneda.format(numero)} supera el máximo permitido (${formatoMoneda.format(MONTO_MAXIMO)})` };
  }
  return { ok: true, valor: numero };
}

function campoFecha(lectura: LecturaOk, fila: FilaCruda, clave: string): Campo<Date | null> {
  const valor = valorDeColumna(lectura.indices, fila, clave);
  if (valor === undefined) return { ok: true, valor: null };
  const fecha = normalizarFecha(valor);
  if (fecha === null) return { ok: false, motivo: `"${normalizarTexto(valor)}" no es una fecha válida` };
  return { ok: true, valor: fecha };
}

const MAPA_TIPO_VEHICULO: Record<string, string> = {
  AUTO: "CARRO",
  CARRO: "CARRO",
  MOTOCICLETA: "MOTO",
  MOTO: "MOTO",
  CAMIONETA: "CAMIONETA",
  PICKUP: "CAMIONETA",
  CAMION: "CAMION",
};
const ETIQUETA_TIPO_VEHICULO = "CARRO, MOTO, CAMIONETA o CAMION";

const MAPA_COMBUSTIBLE: Record<string, string> = {
  GASOLINA: "GASOLINA",
  DIESEL: "DIESEL",
  HIBRIDO: "HIBRIDO",
  ELECTRICO: "ELECTRICO",
};
const ETIQUETA_COMBUSTIBLE = "GASOLINA, DIESEL, HIBRIDO o ELECTRICO";

const MAPA_TRANSMISION: Record<string, string> = {
  AUTOMATICA: "AUTOMATICA",
  AUTOMATICO: "AUTOMATICA",
  MECANICA: "MECANICA",
  MANUAL: "MECANICA",
};
const ETIQUETA_TRANSMISION = "AUTOMATICA o MECANICA";

function campoEnumeracion(
  lectura: LecturaOk,
  fila: FilaCruda,
  clave: string,
  mapa: Record<string, string>,
  etiqueta: string,
): Campo<string | null> {
  const valor = valorDeColumna(lectura.indices, fila, clave);
  if (valor === undefined) return { ok: true, valor: null };
  const buscado = normalizarEncabezado(valor).toUpperCase();
  const encontrado = mapa[buscado];
  if (!encontrado) {
    return { ok: false, motivo: `"${normalizarTexto(valor)}" no es un valor válido. Usa: ${etiqueta}` };
  }
  return { ok: true, valor: encontrado };
}

/** Acumula los problemas de una fila y descarta la fila si hubo alguno. */
function recolector(hoja: string, fila: FilaCruda, indices: Map<string, number>) {
  const problemas: { clave: string; rechazo: FilaReporte }[] = [];
  return {
    get problemas(): FilaReporte[] {
      // Se ordenan como las columnas del archivo del usuario, no como los campos
      // internos: el reporte se lee de izquierda a derecha en su propia hoja.
      return [...problemas]
        .sort((a, b) => (indices.get(a.clave) ?? Number.MAX_SAFE_INTEGER) - (indices.get(b.clave) ?? Number.MAX_SAFE_INTEGER))
        .map(({ rechazo }) => rechazo);
    },
    agregar(rechazo: FilaReporte, clave: string) {
      problemas.push({ clave, rechazo });
    },
    tomar<T>(campo: Campo<T>, columna: string, clave: string): T | null {
      if (!campo.ok) {
        this.agregar(rechazo(hoja, fila.numeroFila, columna, campo.motivo), clave);
        return null;
      }
      return campo.valor;
    },
  };
}

// ---------------------------------------------------------------- entidades

export function validarClientes(lectura: LecturaOk): ValidacionHoja<ClienteImportado> {
  const validas: ClienteImportado[] = [];
  const rechazos: FilaReporte[] = [];

  for (const fila of lectura.filas) {
    const bruto = {
      nombre: campoTexto(lectura, fila, "nombre"),
      documento: campoTexto(lectura, fila, "documento") || undefined,
      telefono: campoTexto(lectura, fila, "telefono") || undefined,
      // El correo se guarda en minúsculas (§2 del plan).
      email: campoTexto(lectura, fila, "email").toLowerCase() || undefined,
    };

    const resultado = clienteInputSchema.safeParse(bruto);
    if (!resultado.success) {
      rechazos.push(...rechazosDeZod(HOJA_CLIENTES, fila.numeroFila, resultado.error, COLUMNAS_CLIENTE));
      continue;
    }

    const { nombre, documento, telefono, email } = resultado.data;
    validas.push({
      numeroFila: fila.numeroFila,
      // Con documento se identifica por documento; solo si no lo trae se busca
      // por nombre (D6). Buscar por los dos hacía que un cliente nuevo con el
      // nombre de otro (homónimo) se omitiera como si ya existiera.
      claves: clavesDe([documento ? claveDocumento(documento) : claveNombreCliente(nombre)]),
      nombre: normalizarTexto(nombre),
      documento: documento ?? null,
      telefono: telefono ?? null,
      email: email ?? null,
    });
  }

  return { validas, rechazos };
}

export function validarVehiculos(lectura: LecturaOk): ValidacionHoja<VehiculoImportado> {
  const validas: VehiculoImportado[] = [];
  const rechazos: FilaReporte[] = [];

  for (const fila of lectura.filas) {
    const recolectado = recolector(HOJA_VEHICULOS, fila, lectura.indices);

    const bruto = {
      placa: campoTexto(lectura, fila, "placa"),
      marca: campoTexto(lectura, fila, "marca"),
      modelo: campoTexto(lectura, fila, "modelo"),
      color: campoTexto(lectura, fila, "color") || undefined,
      observaciones: campoTexto(lectura, fila, "observaciones") || undefined,
      anio:
        recolectado.tomar(campoEntero(lectura, fila, "anio", { min: 1900, max: 2100 }), "Año", "anio") ?? undefined,
      kilometraje:
        recolectado.tomar(campoEntero(lectura, fila, "kilometraje", { min: 0 }), "Kilometraje", "kilometraje") ??
        undefined,
      vin: campoTexto(lectura, fila, "vin") || undefined,
      tipo:
        recolectado.tomar(
          campoEnumeracion(lectura, fila, "tipo", MAPA_TIPO_VEHICULO, ETIQUETA_TIPO_VEHICULO),
          "Tipo",
          "tipo",
        ) ?? undefined,
      combustible:
        recolectado.tomar(
          campoEnumeracion(lectura, fila, "combustible", MAPA_COMBUSTIBLE, ETIQUETA_COMBUSTIBLE),
          "Combustible",
          "combustible",
        ) ?? undefined,
      transmision:
        recolectado.tomar(
          campoEnumeracion(lectura, fila, "transmision", MAPA_TRANSMISION, ETIQUETA_TRANSMISION),
          "Transmisión",
          "transmision",
        ) ?? undefined,
      soatVence:
        recolectado.tomar(campoFecha(lectura, fila, "soatVence"), "SOAT vence", "soatVence") ?? undefined,
      tecnomecanicaVence:
        recolectado.tomar(
          campoFecha(lectura, fila, "tecnomecanicaVence"),
          "Tecnomecánica vence",
          "tecnomecanicaVence",
        ) ?? undefined,
    };

    const documentoCliente = campoTexto(lectura, fila, "documentoCliente") || null;
    const nombreCliente = campoTexto(lectura, fila, "nombreCliente") || null;

    if (recolectado.problemas.length > 0) {
      rechazos.push(...recolectado.problemas);
      continue;
    }

    if (!documentoCliente && !nombreCliente) {
      rechazos.push(
        rechazo(
          HOJA_VEHICULOS,
          fila.numeroFila,
          "Documento cliente",
          "Indica el documento o el nombre del cliente del vehículo",
        ),
      );
      continue;
    }

    const resultado = vehiculoInputSchema.safeParse(bruto);
    if (!resultado.success) {
      rechazos.push(...rechazosDeZod(HOJA_VEHICULOS, fila.numeroFila, resultado.error, COLUMNAS_VEHICULO));
      continue;
    }

    const { placa, marca, modelo, tipo, anio, kilometraje, color, vin, combustible, transmision } = resultado.data;
    validas.push({
      numeroFila: fila.numeroFila,
      claves: clavesDe([clavePlaca(placa)]),
      // La placa se guarda tal como la escribió el taller (D12).
      placa: normalizarTexto(placa),
      marca: normalizarTexto(marca),
      modelo: normalizarTexto(modelo),
      tipo,
      anio: anio ?? null,
      kilometraje: kilometraje ?? null,
      color: color ?? null,
      vin: vin ?? null,
      combustible: combustible ?? null,
      transmision: transmision ?? null,
      soatVence: resultado.data.soatVence ?? null,
      tecnomecanicaVence: resultado.data.tecnomecanicaVence ?? null,
      observaciones: resultado.data.observaciones ?? null,
      documentoCliente,
      nombreCliente,
    });
  }

  return { validas, rechazos };
}

export interface OpcionesRepuestos {
  bodegaId: string;
  proveedorId: string | null;
}

export function validarRepuestos(lectura: LecturaOk, opciones: OpcionesRepuestos): ValidacionHoja<RepuestoImportado> {
  const validas: RepuestoImportado[] = [];
  const rechazos: FilaReporte[] = [];

  for (const fila of lectura.filas) {
    const recolectado = recolector(HOJA_REPUESTOS, fila, lectura.indices);

    const bruto = {
      codigo: campoTexto(lectura, fila, "codigo"),
      nombre: campoTexto(lectura, fila, "nombre"),
      descripcion: campoTexto(lectura, fila, "descripcion") || undefined,
      precioCompra:
        recolectado.tomar(campoDinero(lectura, fila, "precioCompra"), "Precio compra", "precioCompra") ?? undefined,
      precioVenta:
        recolectado.tomar(campoDinero(lectura, fila, "precioVenta"), "Precio venta", "precioVenta") ?? undefined,
      // El esquema exige el mínimo; en la hoja es opcional y se asume 0.
      stockMinimo:
        recolectado.tomar(campoEntero(lectura, fila, "stockMinimo", { min: 0 }), "Stock mínimo", "stockMinimo") ?? 0,
      stockMaximo:
        recolectado.tomar(campoEntero(lectura, fila, "stockMaximo", { min: 1 }), "Stock máximo", "stockMaximo") ??
        undefined,
      multiploCompra:
        recolectado.tomar(campoEntero(lectura, fila, "multiploCompra", { min: 1 }), "Múltiplo compra", "multiploCompra") ??
        undefined,
      bodegaId: opciones.bodegaId,
      proveedorId: opciones.proveedorId ?? undefined,
    };

    const cantidadInicial =
      recolectado.tomar(campoEntero(lectura, fila, "cantidadInicial", { min: 0 }), "Cantidad inicial", "cantidadInicial") ??
      0;

    if (recolectado.problemas.length > 0) {
      rechazos.push(...recolectado.problemas);
      continue;
    }

    if (cantidadInicial > CANTIDAD_MAXIMA_LINEA) {
      rechazos.push(
        rechazo(HOJA_REPUESTOS, fila.numeroFila, "Cantidad inicial", `La cantidad no puede superar ${CANTIDAD_MAXIMA_LINEA}`),
      );
      continue;
    }
    if (cantidadInicial > 0 && !opciones.proveedorId) {
      rechazos.push(
        rechazo(
          HOJA_REPUESTOS,
          fila.numeroFila,
          "Cantidad inicial",
          "Para registrar la cantidad inicial elige un proveedor al subir el archivo (queda como entrada de mercancía)",
        ),
      );
      continue;
    }

    const resultado = repuestoInputSchema.safeParse(bruto);
    if (!resultado.success) {
      rechazos.push(...rechazosDeZod(HOJA_REPUESTOS, fila.numeroFila, resultado.error, COLUMNAS_REPUESTO));
      continue;
    }

    const stock = repuestoStockInicialSchema.safeParse(cantidadInicial);
    if (!stock.success) {
      rechazos.push(
        rechazo(HOJA_REPUESTOS, fila.numeroFila, "Cantidad inicial", stock.error.issues[0]?.message ?? "Cantidad inválida"),
      );
      continue;
    }

    const { codigo, nombre, descripcion, precioCompra, precioVenta, stockMinimo, stockMaximo, multiploCompra } =
      resultado.data;
    validas.push({
      numeroFila: fila.numeroFila,
      claves: clavesDe([claveCodigo(codigo)]),
      codigo: normalizarTexto(codigo),
      nombre: normalizarTexto(nombre),
      descripcion: descripcion ? normalizarTexto(descripcion) : null,
      precioCompra,
      precioVenta,
      stockMinimo,
      stockMaximo: stockMaximo ?? null,
      multiploCompra,
      cantidadInicial,
    });
  }

  return { validas, rechazos };
}

export function validarServicios(lectura: LecturaOk): ValidacionHoja<ServicioImportado> {
  const validas: ServicioImportado[] = [];
  const rechazos: FilaReporte[] = [];

  for (const fila of lectura.filas) {
    const recolectado = recolector(HOJA_SERVICIOS, fila, lectura.indices);

    const bruto = {
      nombre: campoTexto(lectura, fila, "nombre"),
      descripcion: campoTexto(lectura, fila, "descripcion") || undefined,
      precioManoObra:
        recolectado.tomar(campoDinero(lectura, fila, "precioManoObra"), "Precio mano de obra", "precioManoObra") ??
        undefined,
    };

    const activoBruto = valorDeColumna(lectura.indices, fila, "activo");
    let activo = true;
    if (activoBruto !== undefined) {
      const leido = normalizarBooleano(activoBruto);
      if (leido === null) {
        recolectado.agregar(rechazo(HOJA_SERVICIOS, fila.numeroFila, "Activo", "Escribe sí o no"), "activo");
      } else {
        activo = leido;
      }
    }

    if (recolectado.problemas.length > 0) {
      rechazos.push(...recolectado.problemas);
      continue;
    }

    const resultado = servicioInputSchema.safeParse(bruto);
    if (!resultado.success) {
      rechazos.push(...rechazosDeZod(HOJA_SERVICIOS, fila.numeroFila, resultado.error, COLUMNAS_SERVICIO));
      continue;
    }

    const { nombre, descripcion, precioManoObra } = resultado.data;
    validas.push({
      numeroFila: fila.numeroFila,
      claves: clavesDe([claveNombreServicio(nombre)]),
      nombre: normalizarTexto(nombre),
      descripcion: descripcion ? normalizarTexto(descripcion) : null,
      precioManoObra,
      activo,
    });
  }

  return { validas, rechazos };
}

// ---------------------------------------------------------------- dependencias

export interface ClienteResuelto {
  id: string;
  nombre: string;
}

export interface IndiceClientes {
  porClave: Map<string, ClienteResuelto>;
  /** Nombres que corresponden a más de un cliente: por nombre no se puede elegir. */
  nombresAmbiguos: Set<string>;
}

export type ClienteDeVehiculo =
  | { estado: "resuelto"; cliente: ClienteResuelto }
  | { estado: "ambiguo" }
  | { estado: "sin_cliente" };

/** Índice de clientes por documento y por nombre, para resolver los vehículos. */
export function indexarClientes(
  clientes: { id: string; nombre: string; documento: string | null }[],
): IndiceClientes {
  const porClave = new Map<string, ClienteResuelto>();
  const nombresAmbiguos = new Set<string>();

  for (const cliente of clientes) {
    const resuelto: ClienteResuelto = { id: cliente.id, nombre: cliente.nombre };
    const porDocumento = claveDocumento(cliente.documento);
    if (porDocumento) porClave.set(porDocumento, resuelto);

    const porNombre = claveNombreCliente(cliente.nombre);
    if (!porNombre) continue;
    const previo = porClave.get(porNombre);
    // El mismo cliente puede venir dos veces (base y creados en esta corrida):
    // eso no es ambigüedad.
    if (previo && previo.id !== cliente.id) nombresAmbiguos.add(porNombre);
    else porClave.set(porNombre, resuelto);
  }

  return { porClave, nombresAmbiguos };
}

/**
 * Cliente de un vehículo: si la fila trae documento, manda el documento (caer al
 * nombre podría asignar el vehículo a un homónimo); solo si no lo trae se busca
 * por nombre, y si ese nombre lo comparten dos clientes se avisa en vez de
 * elegir uno al azar.
 */
export function buscarCliente(indice: IndiceClientes, fila: VehiculoImportado): ClienteDeVehiculo {
  const porDocumento = claveDocumento(fila.documentoCliente);
  if (porDocumento) {
    const cliente = indice.porClave.get(porDocumento);
    return cliente ? { estado: "resuelto", cliente } : { estado: "sin_cliente" };
  }

  const porNombre = claveNombreCliente(fila.nombreCliente);
  if (!porNombre) return { estado: "sin_cliente" };
  if (indice.nombresAmbiguos.has(porNombre)) return { estado: "ambiguo" };

  const cliente = indice.porClave.get(porNombre);
  return cliente ? { estado: "resuelto", cliente } : { estado: "sin_cliente" };
}
