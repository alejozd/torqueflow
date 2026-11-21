// src/modulos/factura-electronica/modelo.ts
// Núcleo de facturación electrónica DIAN. No importa nada de la app.

/** Montos en centavos enteros (COP). $1.234,56 = 123456. */
export type Centavos = number;

/** Tipos de documento de identidad (códigos DIAN). */
export const TIPOS_DOCUMENTO_IDENTIDAD = {
  "11": "Registro civil",
  "12": "Tarjeta de identidad",
  "13": "Cédula de ciudadanía",
  "21": "Tarjeta de extranjería",
  "22": "Cédula de extranjería",
  "31": "NIT",
  "41": "Pasaporte",
  "42": "Documento de identificación extranjero",
  "47": "PEP",
  "50": "NIT de otro país",
  "91": "NUIP",
} as const;
export type TipoDocumentoIdentidad = keyof typeof TIPOS_DOCUMENTO_IDENTIDAD;

export type TipoPersona = "JURIDICA" | "NATURAL";

/** 48 = responsable de IVA, 49 = no responsable de IVA. */
export type RegimenIva = "48" | "49";

export const RESPONSABILIDADES_FISCALES = {
  "O-13": "Gran contribuyente",
  "O-15": "Autorretenedor",
  "O-23": "Agente de retención en el impuesto sobre las ventas",
  "O-47": "Régimen simple de tributación",
  "R-99-PN": "No responsable",
} as const;
export type ResponsabilidadFiscal = keyof typeof RESPONSABILIDADES_FISCALES;

export interface AdquirenteIdentificado {
  tipo: "IDENTIFICADO";
  tipoDocumento: TipoDocumentoIdentidad;
  numeroDocumento: string;
  /** Obligatorio cuando tipoDocumento = "31" (NIT). */
  dv?: string;
  nombre: string;
  tipoPersona: TipoPersona;
  regimen: RegimenIva;
  responsabilidad: ResponsabilidadFiscal;
  /** Código DANE de 5 dígitos, p. ej. "05001" (Medellín). */
  municipioDane: string;
  direccion: string;
  telefono?: string;
  email?: string;
}

export interface ConsumidorFinal {
  tipo: "CONSUMIDOR_FINAL";
}

export type Adquirente = AdquirenteIdentificado | ConsumidorFinal;

export const NUMERO_CONSUMIDOR_FINAL = "222222222222";

/** Unidades de medida DIAN más usadas en talleres. */
export const UNIDADES = { UNIDAD: "94", HORA: "HUR", SERVICIO: "ZZ" } as const;

export interface Linea {
  codigo: string;
  descripcion: string;
  /** Hasta 2 decimales (p. ej. 1.5 horas). */
  cantidad: number;
  /** Código DIAN de unidad de medida (ver UNIDADES). */
  unidad: string;
  /** Precio unitario SIN IVA, en centavos. */
  precioUnitario: Centavos;
  /** Descuento de la línea en centavos (sobre precio × cantidad). */
  descuento: Centavos;
  /** null = excluido (no lleva IVA); { tarifa: 0 } = exento (IVA 0 %). */
  iva: { tarifa: number } | null;
}

export type FormaPago = "CONTADO" | "CREDITO";

export const MEDIOS_PAGO = {
  EFECTIVO: "10",
  TRANSFERENCIA: "47",
  TARJETA_CREDITO: "48",
  TARJETA_DEBITO: "49",
  OTRO: "1",
} as const;
export type MedioPago = (typeof MEDIOS_PAGO)[keyof typeof MEDIOS_PAGO];

export interface Pago {
  forma: FormaPago;
  medio: MedioPago;
  /** YYYY-MM-DD. En contado, la misma fecha del documento. */
  vencimiento: string;
}

export const CONCEPTOS_NOTA_CREDITO = {
  "1": "Devolución parcial de los bienes o no aceptación parcial del servicio",
  "2": "Anulación de factura electrónica",
  "3": "Rebaja o descuento parcial o total",
  "4": "Ajuste de precio",
  "5": "Otros",
} as const;
export type ConceptoNotaCredito = keyof typeof CONCEPTOS_NOTA_CREDITO;

interface DocumentoBase {
  prefijo: string;
  numero: number;
  /** YYYY-MM-DD (hora de Colombia). */
  fecha: string;
  /** HH:mm:ss (hora de Colombia). */
  hora: string;
  adquirente: Adquirente;
  lineas: Linea[];
  pago: Pago;
  notas?: string;
  /** Pedir al proveedor que envíe el documento al correo del adquirente. */
  enviarCorreo: boolean;
}

export interface FacturaVenta extends DocumentoBase {
  tipo: "FACTURA";
  resolucionNumero: string;
}

export interface ReferenciaFactura {
  /** Prefijo + número, p. ej. "SETP990000001". */
  numeroCompleto: string;
  cufe: string;
  /** YYYY-MM-DD de emisión de la factura. */
  fecha: string;
}

export interface NotaCredito extends DocumentoBase {
  tipo: "NOTA_CREDITO";
  concepto: ConceptoNotaCredito;
  motivo: string;
  facturaReferencia: ReferenciaFactura;
}

export type DocumentoElectronico = FacturaVenta | NotaCredito;

export interface Resolucion {
  numero: string;
  prefijo: string;
  desde: number;
  hasta: number;
  /** YYYY-MM-DD */
  vigenciaDesde: string;
  /** YYYY-MM-DD */
  vigenciaHasta: string;
}

export interface Emisor {
  nit: string;
  dv: string;
  razonSocial: string;
}

export interface TotalesLinea {
  /** precio × cantidad, redondeado a centavos */
  bruto: Centavos;
  descuento: Centavos;
  /** bruto − descuento (line_extension_amount) */
  neto: Centavos;
  iva: Centavos;
}

export interface ImpuestoTotal {
  tarifa: number;
  base: Centavos;
  valor: Centavos;
}

export interface Totales {
  lineas: TotalesLinea[];
  /** Suma de netos de todas las líneas (line_extension_amount). */
  bruto: Centavos;
  /** Suma de netos de las líneas con IVA, incluidas las exentas (tax_exclusive_amount). */
  baseGravable: Centavos;
  /** Consolidado por tarifa, de mayor a menor. */
  impuestos: ImpuestoTotal[];
  totalImpuestos: Centavos;
  /** bruto + impuestos (tax_inclusive_amount). */
  totalConImpuestos: Centavos;
  /** payable_amount (v1: sin descuentos ni cargos globales, igual a totalConImpuestos). */
  totalAPagar: Centavos;
}

export type TipoMensajeDian = "RECHAZO" | "NOTIFICACION";

export interface MensajeDian {
  /** Código de la regla ("FAU02", "90"…); null si el texto no trae regla. */
  codigo: string | null;
  tipo: TipoMensajeDian;
  /** Texto original de la DIAN o del proveedor. */
  textoDian: string;
  /** Qué pasó, en español sencillo. */
  explicacion: string;
  /** Qué hacer; null si no aplica o no se conoce. */
  comoCorregir: string | null;
}

export interface ErrorValidacion {
  /** Ruta del dato, p. ej. "adquirente.dv" o "lineas[0].cantidad". */
  campo: string;
  mensaje: string;
}
