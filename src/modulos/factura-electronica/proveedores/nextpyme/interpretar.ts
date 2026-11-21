// src/modulos/factura-electronica/proveedores/nextpyme/interpretar.ts
import { traducirMensajeDian, traducirMensajesDian } from "../../mensajes-dian";
import type { MensajeDian } from "../../modelo";
import type {
  AmbienteProveedor,
  ReferenciaDocumento,
  ResultadoBusqueda,
  ResultadoConsulta,
  ResultadoEnvio,
} from "../../proveedor";

type Objeto = Record<string, unknown>;
const esObjeto = (v: unknown): v is Objeto => typeof v === "object" && v !== null && !Array.isArray(v);

const MENSAJE_TOKEN = "La conexión con el proveedor no es válida. Revisa el token en Configuración del taller.";

/** Busca dentro de ResponseDian.Envelope.Body el primer objeto que tenga IsValid. */
function resultadoDian(cuerpo: unknown): Objeto | null {
  if (!esObjeto(cuerpo)) return null;
  const respuesta = cuerpo.ResponseDian;
  const sobre = esObjeto(respuesta) ? respuesta.Envelope : undefined;
  const body = esObjeto(sobre) ? sobre.Body : undefined;
  if (!esObjeto(body)) return null;
  for (const envoltura of Object.values(body)) {
    if (!esObjeto(envoltura)) continue;
    for (const resultado of Object.values(envoltura)) {
      if (esObjeto(resultado) && "IsValid" in resultado) return resultado;
    }
  }
  return null;
}

/** ErrorMessage llega como {string: "…"}, {string: ["…"]}, [] o {}. */
function mensajesDe(resultado: Objeto): MensajeDian[] {
  const em = resultado.ErrorMessage;
  if (!esObjeto(em)) return [];
  const s = em.string;
  if (typeof s === "string") return traducirMensajesDian(s);
  if (Array.isArray(s)) return traducirMensajesDian(s.filter((x): x is string => typeof x === "string"));
  return [];
}

/** {date: "2026-07-23 16:25:28.000000", timezone: "-05:00"} → "2026-07-23T16:25:28-05:00" */
function fechaValidacion(cuerpo: Objeto): string | null {
  const f = cuerpo.dian_validation_date_time;
  if (!esObjeto(f) || typeof f.date !== "string") return null;
  const [dia, hora = "00:00:00"] = f.date.split(" ");
  const zona = typeof f.timezone === "string" ? f.timezone : "-05:00";
  return `${dia}T${hora.slice(0, 8)}${zona}`;
}

function erroresDeValidacion(cuerpo: unknown): MensajeDian[] {
  if (!esObjeto(cuerpo)) return [];
  if (esObjeto(cuerpo.errors)) {
    return Object.values(cuerpo.errors)
      .flatMap((v) => (Array.isArray(v) ? v : [v]))
      .filter((x): x is string => typeof x === "string")
      .map(traducirMensajeDian);
  }
  return typeof cuerpo.message === "string" ? [traducirMensajeDian(cuerpo.message)] : [];
}

export function interpretarRespuestaEnvio(status: number, cuerpo: unknown): ResultadoEnvio {
  if (status === 401 || status === 403) return { estado: "ERROR_CONFIGURACION", mensaje: MENSAJE_TOKEN };
  if (status === 422) {
    const motivos = erroresDeValidacion(cuerpo);
    return { estado: "RECHAZADO", motivos: motivos.length ? motivos : [traducirMensajeDian("El proveedor rechazó los datos enviados.")] };
  }
  if (status < 200 || status >= 300) {
    return { estado: "ERROR_TEMPORAL", mensaje: `El proveedor no respondió correctamente (código ${status || "sin respuesta"}).` };
  }
  const r = resultadoDian(cuerpo);
  if (!r || !esObjeto(cuerpo)) return { estado: "ERROR_TEMPORAL", mensaje: "El proveedor respondió algo inesperado." };

  const mensajes = mensajesDe(r);
  if (r.IsValid === "true") {
    const cufe = typeof cuerpo.cufe === "string" ? cuerpo.cufe : String(r.XmlDocumentKey ?? "");
    if (!cufe) {
      return {
        estado: "ERROR_TEMPORAL",
        mensaje: "El proveedor confirmó el documento pero no devolvió el CUFE. Consulta el estado antes de reenviar.",
      };
    }
    return { estado: "ACEPTADO", cufe, fechaValidacion: fechaValidacion(cuerpo), advertencias: mensajes };
  }
  const rechazos = mensajes.filter((m) => m.tipo === "RECHAZO");
  const motivos = rechazos.length
    ? rechazos
    : [traducirMensajeDian(String(r.StatusMessage ?? r.StatusDescription ?? "La DIAN rechazó el documento."))];
  return { estado: "RECHAZADO", motivos };
}

export function interpretarRespuestaEstado(status: number, cuerpo: unknown, cufe: string): ResultadoConsulta {
  if (status === 404) return { estado: "NO_ENCONTRADO" };
  if (status === 401 || status === 403) return { estado: "ERROR_CONFIGURACION", mensaje: MENSAJE_TOKEN };
  if (status < 200 || status >= 300) {
    return { estado: "ERROR_TEMPORAL", mensaje: `El proveedor no respondió correctamente (código ${status || "sin respuesta"}).` };
  }
  const r = resultadoDian(cuerpo);
  if (!r) return { estado: "NO_ENCONTRADO" };
  const mensajes = mensajesDe(r);
  if (r.IsValid === "true") return { estado: "ACEPTADO", cufe, fechaValidacion: null, advertencias: mensajes };
  const rechazos = mensajes.filter((m) => m.tipo === "RECHAZO");
  return rechazos.length ? { estado: "RECHAZADO", motivos: rechazos } : { estado: "NO_ENCONTRADO" };
}

/** GET /config/company → data.type_environment_id: 1 = producción, 2 = pruebas. */
export function interpretarAmbiente(cuerpo: unknown): AmbienteProveedor | null {
  if (!esObjeto(cuerpo) || !esObjeto(cuerpo.data)) return null;
  const id = Number(cuerpo.data.type_environment_id);
  if (id === 1) return "PRODUCCION";
  if (id === 2) return "PRUEBAS";
  return null;
}

/** Código DIAN del tipo de documento en el histórico. */
const TIPO_DOCUMENTO_DIAN = { FACTURA: "01", NOTA_CREDITO: "91" } as const;

/** GET /dian/documents/get-uuids → el documento con ese prefijo y número, con su CUFE y total. */
export function interpretarEmitidos(status: number, cuerpo: unknown, ref: ReferenciaDocumento): ResultadoBusqueda {
  if (status === 401 || status === 403) return { estado: "ERROR_CONFIGURACION", mensaje: MENSAJE_TOKEN };
  const documentos =
    esObjeto(cuerpo) && cuerpo.success !== false && Array.isArray(cuerpo.documents) ? (cuerpo.documents as unknown[]) : null;
  if (status < 200 || status >= 300 || !documentos) {
    return {
      estado: "ERROR_TEMPORAL",
      mensaje: `No se pudo consultar el histórico de la DIAN (código ${status || "sin respuesta"}).`,
    };
  }
  const buscado = `${ref.prefijo}${ref.numero}`;
  const encontrado = documentos.filter(esObjeto).find((d) => {
    const tipo = esObjeto(d.document_type) ? d.document_type.id : undefined;
    if (tipo !== undefined && String(tipo) !== TIPO_DOCUMENTO_DIAN[ref.tipo]) return false;
    const serie =
      typeof d.serie_and_number === "string" ? d.serie_and_number : `${String(d.prefix ?? "")}${String(d.number ?? "")}`;
    return serie === buscado;
  });
  if (!encontrado) {
    return esObjeto(cuerpo) && cuerpo.truncated === true
      ? { estado: "ERROR_TEMPORAL", mensaje: "El histórico de la DIAN llegó incompleto; intenta de nuevo más tarde." }
      : { estado: "NO_ENCONTRADO" };
  }
  const total = Number(encontrado.total_amount);
  if (typeof encontrado.cufe !== "string" || !encontrado.cufe || !Number.isFinite(total)) {
    return { estado: "ERROR_TEMPORAL", mensaje: "El histórico de la DIAN no trae el CUFE o el total del documento." };
  }
  return { estado: "ENCONTRADO", cufe: encontrado.cufe, total: Math.round(total * 100) };
}
