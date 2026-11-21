"use server";

import { revalidatePath } from "next/cache";
import { puede, requirePermiso, requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { scopeFactura } from "@/lib/sede/scope";
import { leerConfiguracionFe } from "@/lib/factura-electronica/configuracion";
import { emitirDocumentoFactura, emitirNotaCredito, reintentarDocumento, type ResultadoFe } from "@/lib/factura-electronica/servicio";
import { ENVIO_INTERRUMPIDO_MS, ESTADOS_DOCUMENTO_PENDIENTES, cuentaParaDian } from "@/lib/factura-electronica/textos";
import { CONCEPTOS_NOTA_CREDITO, type ConceptoNotaCredito, type ErrorValidacion, type MensajeDian } from "@/modulos/factura-electronica";
import type { AmbienteFacturaElectronica, EnvioFacturaElectronica, EstadoDocumentoElectronico } from "@/generated/prisma-tenant";

export interface DocumentoFeVista {
  id: string;
  estado: EstadoDocumentoElectronico;
  prefijo: string;
  numero: number;
  cufe: string | null;
  fechaValidacion: Date | null;
  mensajes: MensajeDian[];
  xmlRuta: string | null;
  pdfRuta: string | null;
  ambiente: AmbienteFacturaElectronica;
  intentos: number;
  ultimoIntentoAt: Date | null;
}

export interface FacturaFeVista {
  activa: boolean;
  envio: EnvioFacturaElectronica;
  ambiente: AmbienteFacturaElectronica;
  /** Creada desde la activación (las anteriores no se marcan como pendientes). */
  cuenta: boolean;
  documento: DocumentoFeVista | null;
  notaCredito: DocumentoFeVista | null;
}

export interface EnvioFeState {
  error: string | null;
  success: boolean;
  mensaje: string | null;
  errores: ErrorValidacion[];
}

const SELECT_DOCUMENTO = {
  id: true,
  estado: true,
  prefijo: true,
  numero: true,
  cufe: true,
  fechaValidacion: true,
  mensajes: true,
  xmlRuta: true,
  pdfRuta: true,
  ambiente: true,
  intentos: true,
  ultimoIntentoAt: true,
} as const;

export async function getFacturaFe(facturaId: string): Promise<FacturaFeVista | null> {
  const session = await requirePermiso("facturas.ver");
  const db = getTenantDb(session.user.tenantSchema);
  const config = await leerConfiguracionFe(db);
  if (!config?.activa) return null;
  const factura = await db.factura.findFirst({
    where: { id: facturaId, ...scopeFactura(session.user.sedeActivaId) },
    select: {
      createdAt: true,
      documentosElectronicos: {
        where: { tipo: { in: ["FACTURA", "NOTA_CREDITO"] } },
        select: { ...SELECT_DOCUMENTO, tipo: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!factura) return null;
  const aVista = (d: (typeof factura.documentosElectronicos)[number] | undefined): DocumentoFeVista | null => {
    if (!d) return null;
    const { tipo: _tipo, ...resto } = d;
    return { ...resto, mensajes: Array.isArray(d.mensajes) ? (d.mensajes as unknown as MensajeDian[]) : [] };
  };
  return {
    activa: true,
    envio: config.envio,
    ambiente: config.ambiente,
    cuenta: cuentaParaDian(factura.createdAt, config.activadaDesde),
    documento: aVista(factura.documentosElectronicos.find((d) => d.tipo === "FACTURA")),
    notaCredito: aVista(factura.documentosElectronicos.find((d) => d.tipo === "NOTA_CREDITO")),
  };
}

const MENSAJE_ESTADO: Record<EstadoDocumentoElectronico, { ok: boolean; texto: string }> = {
  ACEPTADO: { ok: true, texto: "La DIAN aceptó la factura." },
  RECHAZADO: { ok: false, texto: "La DIAN rechazó la factura. Revisa los motivos, corrige y vuelve a enviarla." },
  POR_CONFIRMAR: { ok: false, texto: "No se pudo confirmar si la DIAN la recibió. Vuelve a intentarlo en unos minutos." },
  PENDIENTE: { ok: false, texto: "No se pudo enviar a la DIAN. Vuelve a intentarlo." },
  ENVIANDO: { ok: false, texto: "Se está enviando. Espera unos segundos y recarga." },
  ANULADO: { ok: true, texto: "La factura ya está anulada." },
};

function aEstado(r: ResultadoFe): EnvioFeState {
  if (!r.ok) return { error: r.mensaje, success: false, mensaje: null, errores: r.errores };
  const m = MENSAJE_ESTADO[r.estado];
  return m.ok
    ? { error: null, success: true, mensaje: m.texto, errores: [] }
    : { error: m.texto, success: false, mensaje: null, errores: [] };
}

async function prepararEnvio(facturaId: string) {
  const session = await requirePermiso("facturas.facturar");
  const db = getTenantDb(session.user.tenantSchema);
  const factura = await db.factura.findFirst({
    where: { id: facturaId, ...scopeFactura(session.user.sedeActivaId) },
    select: { id: true },
  });
  return { session, db, factura };
}

export async function enviarFacturaDianAction(facturaId: string, _prev: EnvioFeState, _formData: FormData): Promise<EnvioFeState> {
  const { session, db, factura } = await prepararEnvio(facturaId);
  if (!factura) return { error: "La factura no existe.", success: false, mensaje: null, errores: [] };
  const r = await emitirDocumentoFactura({ db, tenantSchema: session.user.tenantSchema, usuarioId: session.user.id }, facturaId);
  revalidatePath(`/facturas/${facturaId}`);
  return aEstado(r);
}

export async function reenviarDocumentoAction(
  facturaId: string,
  documentoId: string,
  _prev: EnvioFeState,
  _formData: FormData,
): Promise<EnvioFeState> {
  const { session, db, factura } = await prepararEnvio(facturaId);
  if (!factura) return { error: "La factura no existe.", success: false, mensaje: null, errores: [] };
  const doc = await db.documentoElectronico.findFirst({ where: { id: documentoId, facturaId }, select: { id: true } });
  if (!doc) return { error: "El documento no existe.", success: false, mensaje: null, errores: [] };
  const r = await reintentarDocumento({ db, tenantSchema: session.user.tenantSchema, usuarioId: session.user.id }, documentoId);
  revalidatePath(`/facturas/${facturaId}`);
  return aEstado(r);
}

const MENSAJE_NOTA_CREDITO: Partial<Record<EstadoDocumentoElectronico, string>> = {
  ACEPTADO: "La DIAN aceptó la nota crédito. La factura quedó anulada.",
  RECHAZADO: "La DIAN rechazó la nota crédito. Revisa los motivos y vuelve a intentarlo.",
  POR_CONFIRMAR: "No se pudo confirmar si la DIAN recibió la nota crédito. Vuelve a intentarlo en unos minutos.",
};

export async function anularConNotaCreditoAction(facturaId: string, _prev: EnvioFeState, formData: FormData): Promise<EnvioFeState> {
  const session = await requirePermiso("facturaElectronica.anular");
  const db = getTenantDb(session.user.tenantSchema);
  const factura = await db.factura.findFirst({ where: { id: facturaId, ...scopeFactura(session.user.sedeActivaId) }, select: { id: true } });
  if (!factura) return { error: "La factura no existe.", success: false, mensaje: null, errores: [] };
  const concepto = String(formData.get("concepto") ?? "");
  if (!Object.prototype.hasOwnProperty.call(CONCEPTOS_NOTA_CREDITO, concepto)) {
    return { error: "Elige el concepto de la nota crédito.", success: false, mensaje: null, errores: [] };
  }
  const motivo = String(formData.get("motivo") ?? "");
  const r = await emitirNotaCredito(
    { db, tenantSchema: session.user.tenantSchema, usuarioId: session.user.id },
    facturaId,
    { concepto: concepto as ConceptoNotaCredito, motivo },
  );
  revalidatePath(`/facturas/${facturaId}`);
  if (!r.ok) return { error: r.mensaje, success: false, mensaje: null, errores: r.errores };
  if (r.estado === "ACEPTADO") return { error: null, success: true, mensaje: MENSAJE_NOTA_CREDITO.ACEPTADO!, errores: [] };
  return { error: MENSAJE_NOTA_CREDITO[r.estado] ?? "No se pudo enviar la nota crédito. Vuelve a intentarlo.", success: false, mensaje: null, errores: [] };
}

/** Para la lista de facturas: si hay que mostrar la columna DIAN y desde cuándo cuentan. */
export async function getResumenFeTaller(): Promise<{ activa: boolean; activadaDesde: Date | null }> {
  const session = await requirePermiso("facturas.ver");
  const config = await leerConfiguracionFe(getTenantDb(session.user.tenantSchema));
  return { activa: config?.activa ?? false, activadaDesde: config?.activadaDesde ?? null };
}

/** Aviso de Inicio: facturas de la sede activa, desde la activación, sin documento o con documento pendiente. */
export async function contarFacturasSinEnviarDian(): Promise<number> {
  const session = await requireSession();
  if (!puede(session, "facturas.ver")) return 0;
  const db = getTenantDb(session.user.tenantSchema);
  const config = await leerConfiguracionFe(db);
  if (!config?.activa || !config.activadaDesde) return 0;
  return db.factura.count({
    where: {
      ...scopeFactura(session.user.sedeActivaId),
      createdAt: { gte: config.activadaDesde },
      OR: [
        { documentosElectronicos: { none: { tipo: "FACTURA" } } },
        { documentosElectronicos: { some: { tipo: "FACTURA", estado: { in: ESTADOS_DOCUMENTO_PENDIENTES } } } },
        // Envío interrumpido: el servicio lo trata como por confirmar.
        {
          documentosElectronicos: {
            some: {
              tipo: "FACTURA",
              estado: "ENVIANDO",
              OR: [{ ultimoIntentoAt: null }, { ultimoIntentoAt: { lt: new Date(Date.now() - ENVIO_INTERRUMPIDO_MS) } }],
            },
          },
        },
      ],
    },
  });
}
