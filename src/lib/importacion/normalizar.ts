/**
 * Normalización de lo que llega en una hoja de Excel (D10).
 *
 * El taller escribe en español de Colombia: los números llevan coma decimal y
 * punto de miles ("1.500,50"), las fechas van como "15/03/2027" y los
 * encabezados llevan tildes y espacios de sobra. Los esquemas Zod del proyecto
 * esperan otra forma ("1500.50", fechas ISO), así que este módulo traduce antes
 * de validar: es el único sitio que conoce esas costumbres.
 */

const DIACRITICOS = /[\u0300-\u036f]/g;
const MS_DIA = 86_400_000;
/** 31/12/9999, el último día que Excel representa como número de serie. */
const SERIE_MAXIMA_EXCEL = 2_958_465;

function aTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (valor instanceof Date) return valor.toISOString();
  return String(valor).trim();
}

/** Único texto vacío del módulo: todo lo demás se apoya en esto. */
function sinTildes(texto: string): string {
  return texto.normalize("NFD").replace(DIACRITICOS, "");
}

/**
 * Encabezado comparable: sin BOM, sin tildes, en minúsculas y sin espacios ni
 * separadores, para que "Teléfono", "TELEFONO" y "teléfono " sean lo mismo.
 */
export function normalizarEncabezado(valor: unknown): string {
  return sinTildes(aTexto(valor).replace(/^\uFEFF/, ""))
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

/** Texto tal como se guarda: recortado y con los espacios internos colapsados. */
export function normalizarTexto(valor: unknown): string {
  return aTexto(valor).replace(/\s+/g, " ");
}

/** Forma comparable de un dato (documento, nombre, código): sin tildes ni signos. */
export function normalizarClave(valor: unknown): string {
  return sinTildes(aTexto(valor))
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Placa normalizada **para comparar** (mayúsculas, sin espacios ni guiones): el
 * taller puede tener "ABC-123" guardado y escribir "ABC123" en el archivo, y eso
 * no debe crear un vehículo repetido. El valor guardado es el que escribió el
 * taller (D12).
 */
export function normalizarPlaca(valor: unknown): string {
  return aTexto(valor).toUpperCase().replace(/[\s-]/g, "");
}

/** Código de repuesto para comparar: mayúsculas y sin espacios (el guion se respeta). */
export function normalizarCodigo(valor: unknown): string {
  return aTexto(valor).toUpperCase().replace(/\s+/g, "");
}

/**
 * Número en formato colombiano. Reglas, en orden:
 * - si aparecen coma y punto, el último es el decimal y el otro es de miles
 *   ("1.234.567,89" → 1234567.89 y "1,234,567.89" → 1234567.89);
 * - con un solo separador, la coma siempre es decimal y el punto es decimal
 *   salvo que agrupe de tres en tres ("12.500" → 12500, "12.50" → 12.5);
 * - se limpian símbolos de moneda y espacios, y el signo solo vale al principio.
 * Devuelve null si no hay un número reconocible, para que Zod dé el mensaje.
 */
export function normalizarNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor === "boolean") return null;

  const limpio = aTexto(valor).replace(/[^\d.,-]/g, "");
  if (!/\d/.test(limpio)) return null;
  if (limpio.includes("-") && !limpio.startsWith("-")) return null;

  const negativo = limpio.startsWith("-");
  const cuerpo = limpio.replace(/-/g, "");
  const ultimaComa = cuerpo.lastIndexOf(",");
  const ultimoPunto = cuerpo.lastIndexOf(".");

  let decimal: "." | "," | null = null;
  if (ultimaComa >= 0 && ultimoPunto >= 0) {
    decimal = ultimaComa > ultimoPunto ? "," : ".";
  } else if (ultimaComa >= 0) {
    decimal = ",";
  } else if (ultimoPunto >= 0) {
    const partes = cuerpo.split(".");
    const agrupaMiles =
      partes.length > 1 &&
      partes[0]!.length >= 1 &&
      partes[0]!.length <= 3 &&
      partes.slice(1).every((parte) => parte.length === 3);
    decimal = agrupaMiles ? null : ".";
  }

  let normalizado: string;
  if (decimal) {
    const partes = cuerpo.split(decimal);
    if (partes.length > 2) return null;
    const otro = decimal === "," ? "." : ",";
    normalizado = `${partes[0]!.replaceAll(otro, "")}.${partes[1]!.replaceAll(otro, "")}`;
  } else {
    normalizado = cuerpo.replace(/[.,]/g, "");
  }

  const numero = Number(normalizado);
  if (!Number.isFinite(numero)) return null;
  return negativo ? -numero : numero;
}

/** Entero: rechaza los decimales con fracción ("12,5") en vez de redondear a ciegas. */
export function normalizarEntero(valor: unknown): number | null {
  const numero = normalizarNumero(valor);
  if (numero === null || !Number.isInteger(numero)) return null;
  return numero;
}

function fechaUtc(anio: number, mes: number, dia: number): Date | null {
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || !Number.isInteger(dia)) return null;
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  // Round-trip: descarta días que no existen (31/02, mes 13…).
  if (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) return null;
  return fecha;
}

const RE_ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const RE_LOCAL = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

/**
 * Fecha a medianoche UTC, la convención del proyecto para campos `@db.Date`
 * (igual que `src/lib/reportes/rango-fechas.ts`). Acepta lo que puede venir de
 * Excel: `dd/mm/aaaa`, `dd-mm-aa`, ISO, un `Date` ya parseado por el lector y el
 * número de serie de Excel. La hora, si viene, se ignora.
 */
export function normalizarFecha(valor: unknown): Date | null {
  if (valor === null || valor === undefined || valor === "") return null;

  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    // El lector de xlsx puede devolver medianoche UTC o medianoche local según
    // cómo esté formateada la celda: se usan las componentes del reloj que
    // corresponda para no correr la fecha un día.
    const enUtc = valor.getUTCHours() === 0 && valor.getUTCMinutes() === 0 && valor.getUTCSeconds() === 0;
    return enUtc
      ? fechaUtc(valor.getUTCFullYear(), valor.getUTCMonth() + 1, valor.getUTCDate())
      : fechaUtc(valor.getFullYear(), valor.getMonth() + 1, valor.getDate());
  }

  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return null;
    const serie = Math.floor(valor);
    if (serie < 1 || serie > SERIE_MAXIMA_EXCEL) return null;
    // Excel arrastra el bug de 1900 (cree que ese año fue bisiesto): hasta la
    // serie 59 el epoch correcto es un día después.
    const epoch = serie < 61 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30);
    return new Date(epoch + serie * MS_DIA);
  }

  const texto = aTexto(valor);
  if (!texto) return null;

  const iso = RE_ISO.exec(texto);
  if (iso) return fechaUtc(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const local = RE_LOCAL.exec(texto);
  if (local) {
    const tresDigitos = local[3]!.length <= 2;
    const corto = Number(local[3]);
    const anio = tresDigitos ? (corto <= 50 ? 2000 + corto : 1900 + corto) : corto;
    return fechaUtc(anio, Number(local[2]), Number(local[1]));
  }

  return null;
}

const SI = new Set(["si", "s", "x", "1", "true", "verdadero", "yes", "y"]);
const NO = new Set(["no", "n", "0", "false", "falso"]);

/** Booleano de hoja: "sí/no", "x", "1/0", true/false. Null si no se entiende. */
export function normalizarBooleano(valor: unknown): boolean | null {
  if (typeof valor === "boolean") return valor;
  if (typeof valor === "number") return valor === 1 ? true : valor === 0 ? false : null;
  const texto = sinTildes(aTexto(valor).toLowerCase());
  if (!texto) return null;
  if (SI.has(texto)) return true;
  if (NO.has(texto)) return false;
  return null;
}

const VACIOS = new Set(["", "-", "—", "n/a", "na", "null", "sin dato", "sin datos"]);

/**
 * Hueco de hoja: vacío, un guion o el clásico "N/A". Un campo opcional con esto
 * se trata como no enviado en vez de fallar la validación por basura.
 */
export function esVacio(valor: unknown): boolean {
  if (valor === null || valor === undefined) return true;
  if (typeof valor === "string") return VACIOS.has(valor.trim().toLowerCase());
  return false;
}
