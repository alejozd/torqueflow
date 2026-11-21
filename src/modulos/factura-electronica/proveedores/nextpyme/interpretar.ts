// src/modulos/factura-electronica/proveedores/nextpyme/interpretar.ts
import { traducirMensajeDian, traducirMensajesDian } from "../../mensajes-dian";
import type { MensajeDian } from "../../modelo";
import type { ResultadoConsulta, ResultadoEnvio } from "../../proveedor";

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
function fechaValidacion(cuerpo: Objeto): string {
  const f = cuerpo.dian_validation_date_time;
  if (!esObjeto(f) || typeof f.date !== "string") return "";
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
  if (r.IsValid === "true") return { estado: "ACEPTADO", cufe, fechaValidacion: "", advertencias: mensajes };
  const rechazos = mensajes.filter((m) => m.tipo === "RECHAZO");
  return rechazos.length ? { estado: "RECHAZADO", motivos: rechazos } : { estado: "NO_ENCONTRADO" };
}
