// src/lib/factura-electronica/servicio.ts
import {
  calcularTotales,
  esDocumentoYaProcesado,
  traducirMensajeDian,
  validarDocumento,
  type ConceptoNotaCredito,
  type DocumentoElectronico,
  type ErrorValidacion,
  type FacturaVenta,
  type MensajeDian,
  type NotaCredito,
  type ProveedorFacturaElectronica,
  type ReferenciaDocumento,
  type ResultadoEnvio,
} from "@/modulos/factura-electronica";
import type { EstadoDocumentoElectronico, EstadoFactura, Prisma } from "@/generated/prisma-tenant";
import type { TenantPrismaClient } from "@/lib/db/tenant-client";
import { montoExacto } from "@/lib/money/monto-exacto";
import { roundMoney } from "@/lib/money/round";
import { guardarArchivosDocumento } from "./almacenamiento";
import {
  crearProveedorDesdeConfig,
  ErrorConfiguracionFe,
  leerConfiguracionFe,
  resolucionDeConfig,
  type ConfiguracionFe,
} from "./configuracion";
import { conFechaDeReenvio } from "./fecha-reenvio";
import { fechaHoraBogota } from "./hora-bogota";
import { mapearFactura, type DatosNumeracion, type FacturaParaMapear, type Numerico, type ResultadoMapeo } from "./mapear";

export interface ContextoFe {
  db: TenantPrismaClient;
  tenantSchema: string;
  usuarioId: string;
  /** Para pruebas: reloj fijo. */
  ahora?: () => Date;
  /** Para pruebas: proveedor fijo (si no, se crea desde la configuración). */
  proveedor?: ProveedorFacturaElectronica;
}

export type MotivoFallaFe =
  | "INACTIVA"
  | "VALIDACION"
  | "RANGO_AGOTADO"
  | "EN_CURSO"
  | "NO_ENCONTRADO"
  | "ESTADO"
  | "AMBIENTE"
  | "ERROR";

/** ok: true = el documento existe y quedó en `estado` (aceptado o no); ok: false = no se hizo nada. */
export type ResultadoFe =
  | { ok: true; documentoId: string; estado: EstadoDocumentoElectronico; mensajes: MensajeDian[] }
  | { ok: false; motivo: MotivoFallaFe; mensaje: string; errores: ErrorValidacion[] };

/** Un envío en ENVIANDO más viejo que esto se da por interrumpido (se trata como POR_CONFIRMAR). */
export const ENVIO_INTERRUMPIDO_MS = 2 * 60_000;

const RANGO_AGOTADO = "RANGO_AGOTADO";
const TX = { maxWait: 10_000, timeout: 20_000 };
const INCLUDE_MAPEO = {
  cliente: true,
  orden: { include: { items: true, manoDeObra: true } },
} satisfies Prisma.FacturaInclude;

const reloj = (ctx: ContextoFe) => (ctx.ahora ?? (() => new Date()))();
const comoJson = (v: unknown) => v as Prisma.InputJsonValue;
const mensaje = (texto: string): MensajeDian[] => [traducirMensajeDian(texto)];
const falla = (motivo: MotivoFallaFe, texto: string, errores: ErrorValidacion[] = []): ResultadoFe => ({
  ok: false,
  motivo,
  mensaje: texto,
  errores,
});
const pesos = (c: number) => (c / 100).toLocaleString("es-CO", { style: "currency", currency: "COP" });
const nombreAmbiente = (a: string | null) => (a === "PRUEBAS" ? "pruebas" : a === "PRODUCCION" ? "producción" : "sin informar");

/**
 * El documento legal manda (spec §11.3): el IVA y el desglose de la factura interna quedan
 * iguales a los del documento electrónico, y si el total difiere en centavos se ajustan
 * subtotal, total y saldo. Solo se llama con una diferencia dentro de la tolerancia de redondeo
 * (prepararMapeo); quien llama ya bloqueó la factura con FOR UPDATE.
 */
async function alinearFactura(tx: Prisma.TransactionClient, facturaId: string, mapeo: ResultadoMapeo): Promise<void> {
  const f: { subtotal: Numerico; total: Numerico; saldoPendiente: Numerico } = await tx.factura.findUniqueOrThrow({
    where: { id: facturaId },
    select: { subtotal: true, total: true, saldoPendiente: true },
  });
  const totales = calcularTotales(mapeo.documento.lineas);
  const desgloseIva = totales.impuestos.map((i) => ({ ivaPct: i.tarifa, base: i.base / 100, iva: i.valor / 100 }));
  const ajuste = mapeo.diferencia / 100;
  const saldo = roundMoney(Number(f.saldoPendiente) + ajuste);
  const estado: EstadoFactura = saldo <= 0 ? "PAGADA" : "PENDIENTE";
  await tx.factura.update({
    where: { id: facturaId },
    data: {
      iva: montoExacto(totales.totalImpuestos / 100),
      desgloseIva,
      ...(mapeo.diferencia !== 0
        ? {
            subtotal: montoExacto(Number(f.subtotal) + ajuste),
            total: montoExacto(Number(f.total) + ajuste),
            saldoPendiente: montoExacto(Math.max(saldo, 0)),
            estado,
          }
        : {}),
    },
  });
}

async function terminar(
  ctx: ContextoFe,
  id: string,
  estado: EstadoDocumentoElectronico,
  mensajes: MensajeDian[],
): Promise<ResultadoFe> {
  await ctx.db.documentoElectronico.update({ where: { id }, data: { estado, mensajes: comoJson(mensajes) } });
  return { ok: true, documentoId: id, estado, mensajes };
}

async function aceptar(
  ctx: ContextoFe,
  proveedor: ProveedorFacturaElectronica,
  id: string,
  ref: ReferenciaDocumento,
  cufe: string,
  fechaValidacion: string | null,
  advertencias: MensajeDian[],
): Promise<ResultadoFe> {
  const fecha = fechaValidacion ? new Date(fechaValidacion) : null;
  await ctx.db.documentoElectronico.update({
    where: { id },
    data: {
      estado: "ACEPTADO",
      cufe,
      fechaValidacion: fecha && !Number.isNaN(fecha.getTime()) ? fecha : null,
      mensajes: comoJson(advertencias),
    },
  });
  const archivos = await guardarArchivosDocumento(proveedor, { ...ref, cufe }, ctx.tenantSchema, id);
  if (archivos.xmlRuta || archivos.pdfRuta) {
    await ctx.db.documentoElectronico.update({ where: { id }, data: { xmlRuta: archivos.xmlRuta, pdfRuta: archivos.pdfRuta } });
  }
  if (archivos.errores.length > 0) console.error("[factura-electronica] archivos sin guardar", id, archivos.errores);
  if (ref.tipo === "NOTA_CREDITO") await anularFacturaReferenciada(ctx, id);
  return { ok: true, documentoId: id, estado: "ACEPTADO", mensajes: advertencias };
}

/** Nota crédito aceptada (spec §5.3): la factura electrónica queda ANULADO y la factura, sin saldo. */
async function anularFacturaReferenciada(ctx: ContextoFe, notaCreditoId: string): Promise<void> {
  const nota = await ctx.db.documentoElectronico.findUnique({
    where: { id: notaCreditoId },
    select: { facturaId: true, documentoReferenciaId: true },
  });
  if (!nota?.documentoReferenciaId) return;
  const referenciaId = nota.documentoReferenciaId;
  await ctx.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM facturas WHERE id = ${nota.facturaId} FOR UPDATE`;
    await tx.documentoElectronico.update({ where: { id: referenciaId }, data: { estado: "ANULADO" } });
    await tx.factura.update({ where: { id: nota.facturaId }, data: { saldoPendiente: 0, estado: "PAGADA" } });
  }, TX);
}

type Previo =
  | { tipo: "ACEPTADO"; cufe: string; fechaValidacion: string | null; advertencias: MensajeDian[] }
  | { tipo: "RECHAZADO"; motivos: MensajeDian[] }
  | { tipo: "NO_ENCONTRADO" }
  | { tipo: "SIN_CONFIRMAR"; mensaje: string };

/** Histórico DIAN (spec §11.1): solo se adopta el CUFE si el total coincide. */
async function buscarEnHistorico(
  proveedor: ProveedorFacturaElectronica,
  ref: ReferenciaDocumento,
  fecha: string,
  total: number,
): Promise<Previo> {
  const b = await proveedor.buscarEmitido(ref, fecha);
  if (b.estado === "NO_ENCONTRADO") return { tipo: "NO_ENCONTRADO" };
  if (b.estado !== "ENCONTRADO") return { tipo: "SIN_CONFIRMAR", mensaje: b.mensaje };
  if (b.total !== total) {
    return {
      tipo: "SIN_CONFIRMAR",
      mensaje: `Posible choque de numeración: la DIAN ya tiene el documento ${ref.prefijo}${ref.numero} por ${pesos(b.total)} y esta factura es por ${pesos(total)}. Revisa la resolución y el consecutivo antes de seguir.`,
    };
  }
  return { tipo: "ACEPTADO", cufe: b.cufe, fechaValidacion: null, advertencias: [] };
}

/** Antes de reenviar algo que pudo llegar: consulta por CUFE si lo hay y, si no, el histórico. */
async function confirmarPrevio(
  proveedor: ProveedorFacturaElectronica,
  ref: ReferenciaDocumento,
  fecha: string,
  total: number,
): Promise<Previo> {
  if (ref.cufe) {
    const c = await proveedor.consultarEstado(ref);
    if (c.estado === "ACEPTADO") return { tipo: "ACEPTADO", cufe: c.cufe, fechaValidacion: c.fechaValidacion, advertencias: c.advertencias };
    if (c.estado === "RECHAZADO") return { tipo: "RECHAZADO", motivos: c.motivos };
    if (c.estado !== "NO_ENCONTRADO") return { tipo: "SIN_CONFIRMAR", mensaje: c.mensaje };
  }
  return buscarEnHistorico(proveedor, ref, fecha, total);
}

/**
 * Regla 90 (spec §11.1): lo que se acaba de enviar NO se aceptó; la DIAN tiene un envío anterior de este número.
 * Si el reenvío cambió la fecha (spec §12.2), el documento vuelve al payload anterior (el que la DIAN pudo recibir)
 * y el histórico se busca primero con esa fecha y luego con la de hoy (el proveedor busca ±1 día).
 */
async function resolverYaProcesado(
  ctx: ContextoFe,
  proveedor: ProveedorFacturaElectronica,
  id: string,
  ref: ReferenciaDocumento,
  anterior: DocumentoElectronico,
  enviado: DocumentoElectronico,
  total: number,
): Promise<ResultadoFe> {
  if (enviado !== anterior) {
    await ctx.db.documentoElectronico.update({ where: { id }, data: { payload: comoJson(anterior) } });
  }
  const fechas = enviado.fecha === anterior.fecha ? [anterior.fecha] : [anterior.fecha, enviado.fecha];
  let h: Previo = { tipo: "NO_ENCONTRADO" };
  for (const fecha of fechas) {
    h = await buscarEnHistorico(proveedor, ref, fecha, total);
    if (h.tipo !== "NO_ENCONTRADO") break;
  }
  if (h.tipo === "ACEPTADO") return aceptar(ctx, proveedor, id, ref, h.cufe, null, []);
  return terminar(
    ctx,
    id,
    "POR_CONFIRMAR",
    mensaje(
      h.tipo === "SIN_CONFIRMAR"
        ? h.mensaje
        : "La DIAN dice que ya recibió este número, pero todavía no aparece en su histórico. Reintenta más tarde para recuperar el CUFE.",
    ),
  );
}

async function resolverEnvio(
  ctx: ContextoFe,
  proveedor: ProveedorFacturaElectronica,
  id: string,
  ref: ReferenciaDocumento,
  anterior: DocumentoElectronico,
  enviado: DocumentoElectronico,
  total: number,
  r: ResultadoEnvio,
): Promise<ResultadoFe> {
  switch (r.estado) {
    case "ACEPTADO":
      return aceptar(ctx, proveedor, id, ref, r.cufe, r.fechaValidacion, r.advertencias);
    case "ERROR_TEMPORAL":
      return terminar(ctx, id, "POR_CONFIRMAR", mensaje(r.mensaje));
    case "ERROR_CONFIGURACION":
      return terminar(ctx, id, "PENDIENTE", mensaje(r.mensaje));
    case "RECHAZADO": {
      if (!esDocumentoYaProcesado(r.motivos)) return terminar(ctx, id, "RECHAZADO", r.motivos);
      return resolverYaProcesado(ctx, proveedor, id, ref, anterior, enviado, total);
    }
  }
}

interface DocumentoEnCurso {
  id: string;
  documento: DocumentoElectronico;
  cufe: string | null;
}

/** El documento ya está en ENVIANDO (lo marcó quien llama). */
async function enviarConProveedor(
  ctx: ContextoFe,
  config: ConfiguracionFe,
  doc: DocumentoEnCurso,
  consultarPrimero: boolean,
): Promise<ResultadoFe> {
  const ref: ReferenciaDocumento = {
    tipo: doc.documento.tipo,
    prefijo: doc.documento.prefijo,
    numero: doc.documento.numero,
    ...(doc.cufe ? { cufe: doc.cufe } : {}),
  };
  const total = calcularTotales(doc.documento.lineas).totalAPagar;
  /** Si no se llega a enviar: lo que pudo haber llegado sigue por confirmar; lo demás, pendiente. */
  const sinEnviar: EstadoDocumentoElectronico = consultarPrimero ? "POR_CONFIRMAR" : "PENDIENTE";

  let proveedor: ProveedorFacturaElectronica;
  try {
    proveedor = ctx.proveedor ?? crearProveedorDesdeConfig(config, ctx.tenantSchema);
  } catch (e) {
    if (e instanceof ErrorConfiguracionFe) return terminar(ctx, doc.id, sinEnviar, mensaje(e.message));
    throw e;
  }

  // Spec §11.2: nunca enviar si el ambiente de Nextpyme no es el configurado en el taller.
  if (config.ambiente !== "SIMULADO") {
    const conexion = await proveedor.probarConexion();
    if (!conexion.ok) return terminar(ctx, doc.id, sinEnviar, mensaje(conexion.mensaje));
    if (conexion.ambiente !== config.ambiente) {
      return terminar(
        ctx,
        doc.id,
        sinEnviar,
        mensaje(
          `El proveedor tiene esta empresa en ambiente de ${nombreAmbiente(conexion.ambiente)} y el taller está configurado en ${nombreAmbiente(config.ambiente)}. No se envió nada; revisa la configuración.`,
        ),
      );
    }
  }

  if (consultarPrimero) {
    const previo = await confirmarPrevio(proveedor, ref, doc.documento.fecha, total);
    if (previo.tipo === "ACEPTADO") {
      return aceptar(ctx, proveedor, doc.id, ref, previo.cufe, previo.fechaValidacion, previo.advertencias);
    }
    if (previo.tipo === "RECHAZADO") return terminar(ctx, doc.id, "RECHAZADO", previo.motivos);
    if (previo.tipo === "SIN_CONFIRMAR") return terminar(ctx, doc.id, "POR_CONFIRMAR", mensaje(previo.mensaje));
  }

  // Spec §12.2: si el reenvío es otro día, va con la fecha de hoy (mismo número y totales). Ante una Regla 90
  // se vuelve al payload anterior (resolverYaProcesado).
  const aEnviar = conFechaDeReenvio(doc.documento, fechaHoraBogota(reloj(ctx)));
  if (aEnviar !== doc.documento) {
    await ctx.db.documentoElectronico.update({ where: { id: doc.id }, data: { payload: comoJson(aEnviar) } });
  }
  const r = await proveedor.enviar(aEnviar);
  return resolverEnvio(ctx, proveedor, doc.id, ref, doc.documento, aEnviar, total, r);
}

async function ejecutarEnvio(
  ctx: ContextoFe,
  config: ConfiguracionFe,
  doc: DocumentoEnCurso,
  consultarPrimero: boolean,
): Promise<ResultadoFe> {
  try {
    return await enviarConProveedor(ctx, config, doc, consultarPrimero);
  } catch (e) {
    console.error("[factura-electronica] error inesperado al enviar", doc.id, e);
    return terminar(
      ctx,
      doc.id,
      "POR_CONFIRMAR",
      mensaje("Ocurrió un error inesperado al enviar. Reintenta: primero se confirmará con la DIAN si lo recibió."),
    );
  }
}

type Preparado =
  | { ok: true; mapeo: ResultadoMapeo }
  | { ok: false; motivo: MotivoFallaFe; mensaje: string; errores: ErrorValidacion[] };

const noValido = (campo: string, texto: string): Preparado => ({
  ok: false,
  motivo: "VALIDACION",
  mensaje: texto,
  errores: [{ campo, mensaje: texto }],
});

/**
 * Mapea y valida sin gastar número. Un mapeo imposible (descuento mayor que los conceptos), una
 * diferencia de total que no es redondeo (spec §11.3) o datos faltantes → VALIDACION.
 */
function prepararMapeo(factura: FacturaParaMapear, n: DatosNumeracion, config: ConfiguracionFe, hoy: string): Preparado {
  let mapeo: ResultadoMapeo;
  try {
    mapeo = mapearFactura(factura, n);
  } catch (e) {
    return noValido("factura.descuento", e instanceof Error ? e.message : "No se pudo armar la factura electrónica.");
  }
  if (Math.abs(mapeo.diferencia) > mapeo.tolerancia) {
    const electronico = mapeo.conversion.totalElectronico;
    return noValido(
      "factura.total",
      `El total de la factura no coincide con sus conceptos: la factura dice ${pesos(electronico - mapeo.diferencia)} y los conceptos suman ${pesos(electronico)}. No se envió nada; revisa la factura.`,
    );
  }
  const errores = [...mapeo.errores, ...validarDocumento(mapeo.documento, { resolucion: resolucionDeConfig(config) ?? undefined, hoy })];
  if (errores.length > 0) return { ok: false, motivo: "VALIDACION", mensaje: "Faltan datos para la factura electrónica.", errores };
  return { ok: true, mapeo };
}

/**
 * Crea la factura electrónica de una factura y la envía (spec §5.1). Si ya tiene documento,
 * es un reintento. Lo usa el envío automático y el botón "Enviar a la DIAN".
 */
export async function emitirDocumentoFactura(ctx: ContextoFe, facturaId: string): Promise<ResultadoFe> {
  const ahora = reloj(ctx);
  const config = await leerConfiguracionFe(ctx.db);
  if (!config?.activa) return falla("INACTIVA", "La facturación electrónica no está activa en este taller.");

  const existente = await ctx.db.documentoElectronico.findFirst({ where: { facturaId, tipo: "FACTURA" }, select: { id: true } });
  if (existente) return reintentarDocumento(ctx, existente.id);

  const factura = await ctx.db.factura.findUnique({ where: { id: facturaId }, include: INCLUDE_MAPEO });
  if (!factura) return falla("NO_ENCONTRADO", "La factura no existe.");

  const { fecha, hora } = fechaHoraBogota(ahora);
  const provisional = Math.max(config.siguienteConsecutivo, config.rangoDesde ?? 1);
  const preparado = prepararMapeo(
    factura,
    { prefijo: config.prefijo ?? "", numero: provisional, resolucionNumero: config.resolucionNumero ?? "", fecha, hora },
    config,
    fecha,
  );
  if (!preparado.ok) return falla(preparado.motivo, preparado.mensaje, preparado.errores);
  const { mapeo } = preparado;

  let creado: DocumentoEnCurso | null;
  try {
    creado = await ctx.db.$transaction(async (tx) => {
      // Serializa por factura: dos envíos a la vez de la misma factura no crean dos documentos.
      await tx.$queryRaw`SELECT id FROM facturas WHERE id = ${facturaId} FOR UPDATE`;
      const otro = await tx.documentoElectronico.findFirst({ where: { facturaId, tipo: "FACTURA" }, select: { id: true } });
      if (otro) return null;
      // Consecutivo atómico: la fila de configuración queda bloqueada hasta el commit.
      const [fila] = await tx.$queryRaw<{ asignado: number }[]>`
        UPDATE configuracion_factura_electronica
        SET siguiente_consecutivo = GREATEST(siguiente_consecutivo, COALESCE(rango_desde, 1)) + 1, updated_at = NOW()
        WHERE id = 'singleton'
        RETURNING siguiente_consecutivo - 1 AS asignado`;
      if (!fila || (config.rangoHasta !== null && fila.asignado > config.rangoHasta)) throw new Error(RANGO_AGOTADO);
      const documento: FacturaVenta = { ...mapeo.documento, numero: fila.asignado };
      const doc = await tx.documentoElectronico.create({
        data: {
          tipo: "FACTURA",
          facturaId,
          prefijo: documento.prefijo,
          numero: documento.numero,
          estado: "ENVIANDO",
          payload: comoJson(documento),
          ambiente: config.ambiente,
          creadoPorId: ctx.usuarioId,
          intentos: 1,
          ultimoIntentoAt: ahora,
        },
        select: { id: true },
      });
      await alinearFactura(tx, facturaId, mapeo);
      return { id: doc.id, documento, cufe: null };
    }, TX);
  } catch (e) {
    if (e instanceof Error && e.message === RANGO_AGOTADO) {
      return falla("RANGO_AGOTADO", "Se acabaron los números de la resolución de facturación. Registra una resolución nueva.");
    }
    throw e;
  }

  if (!creado) {
    const ganador = await ctx.db.documentoElectronico.findFirst({ where: { facturaId, tipo: "FACTURA" }, select: { id: true } });
    return ganador ? reintentarDocumento(ctx, ganador.id) : falla("NO_ENCONTRADO", "La factura no existe.");
  }
  return ejecutarEnvio(ctx, config, creado, false);
}

/**
 * Reenvía un documento con el mismo prefijo y número (spec §5.2). Desde RECHAZADO o PENDIENTE una factura
 * se vuelve a mapear (por si corrigieron datos) conservando número (la fecha se actualiza al enviar si cambió el día); desde
 * POR_CONFIRMAR primero se confirma con la DIAN.
 */
export async function reintentarDocumento(ctx: ContextoFe, documentoId: string): Promise<ResultadoFe> {
  const ahora = reloj(ctx);
  const config = await leerConfiguracionFe(ctx.db);
  if (!config?.activa) return falla("INACTIVA", "La facturación electrónica no está activa en este taller.");

  const doc = await ctx.db.documentoElectronico.findUnique({ where: { id: documentoId } });
  if (!doc) return falla("NO_ENCONTRADO", "El documento electrónico no existe.");
  if (doc.estado === "ACEPTADO" || doc.estado === "ANULADO") return falla("ESTADO", "Este documento ya fue aceptado por la DIAN.");
  if (doc.ambiente !== config.ambiente) {
    return falla(
      "AMBIENTE",
      `Este documento se creó en ambiente ${nombreAmbiente(doc.ambiente)} y el taller está en ${nombreAmbiente(config.ambiente)}; no se puede reenviar con el mismo número.`,
    );
  }

  const interrumpido =
    doc.estado === "ENVIANDO" && (!doc.ultimoIntentoAt || ahora.getTime() - doc.ultimoIntentoAt.getTime() > ENVIO_INTERRUMPIDO_MS);
  if (doc.estado === "ENVIANDO" && !interrumpido) return falla("EN_CURSO", "Este documento se está enviando. Espera un momento.");

  // Solo uno gana el reintento: si otro lo tomó primero, updatedAt ya cambió.
  const { count } = await ctx.db.documentoElectronico.updateMany({
    where: { id: doc.id, estado: doc.estado, updatedAt: doc.updatedAt },
    data: { estado: "ENVIANDO", intentos: { increment: 1 }, ultimoIntentoAt: ahora },
  });
  if (count === 0) return falla("EN_CURSO", "Este documento se está enviando. Espera un momento.");

  let documento = doc.payload as unknown as DocumentoElectronico;
  // Una nota crédito se reenvía con su propio payload; solo la factura se vuelve a mapear.
  if (documento.tipo === "FACTURA" && doc.tipo === "FACTURA" && (doc.estado === "RECHAZADO" || doc.estado === "PENDIENTE")) {
    const previo = documento;
    let preparado: Preparado;
    try {
      const factura = await ctx.db.factura.findUnique({ where: { id: doc.facturaId }, include: INCLUDE_MAPEO });
      preparado = factura
        ? prepararMapeo(
            factura,
            {
              prefijo: previo.prefijo,
              numero: previo.numero,
              resolucionNumero: previo.resolucionNumero,
              fecha: previo.fecha,
              hora: previo.hora,
            },
            config,
            fechaHoraBogota(ahora).fecha,
          )
        : noValido("factura", "La factura no existe.");
      if (preparado.ok) {
        const { mapeo } = preparado;
        await ctx.db.$transaction(async (tx) => {
          // Como al emitir: bloquea la factura para no pisar un abono que llegue a la vez.
          await tx.$queryRaw`SELECT id FROM facturas WHERE id = ${doc.facturaId} FOR UPDATE`;
          await alinearFactura(tx, doc.facturaId, mapeo);
          await tx.documentoElectronico.update({ where: { id: doc.id }, data: { payload: comoJson(mapeo.documento) } });
        }, TX);
      }
    } catch (e) {
      console.error("[factura-electronica] error inesperado al preparar el reenvío", doc.id, e);
      preparado = {
        ok: false,
        motivo: "ERROR",
        mensaje: "Ocurrió un error inesperado al preparar el reenvío. No se envió nada; reintenta.",
        errores: [],
      };
    }
    if (!preparado.ok) {
      // No se envió: el documento vuelve a su estado (no queda en ENVIANDO).
      const textos = preparado.errores.length > 0 ? preparado.errores.map((e) => e.mensaje) : [preparado.mensaje];
      await ctx.db.documentoElectronico.update({
        where: { id: doc.id },
        data: { estado: doc.estado, mensajes: comoJson(textos.map((t) => traducirMensajeDian(t))) },
      });
      return falla(preparado.motivo, preparado.mensaje, preparado.errores);
    }
    documento = preparado.mapeo.documento;
  }

  const consultarPrimero = doc.estado === "POR_CONFIRMAR" || interrumpido;
  return ejecutarEnvio(ctx, config, { id: doc.id, documento, cufe: doc.cufe }, consultarPrimero);
}

export interface DatosNotaCredito {
  concepto: ConceptoNotaCredito;
  motivo: string;
}

/**
 * Nota crédito total sobre una factura electrónica aceptada (spec §5.3). Toma adquirente, líneas
 * y pago de la factura aceptada; usa la numeración de notas crédito. Si ya hay una, es un reintento.
 */
export async function emitirNotaCredito(ctx: ContextoFe, facturaId: string, datos: DatosNotaCredito): Promise<ResultadoFe> {
  const ahora = reloj(ctx);
  const config = await leerConfiguracionFe(ctx.db);
  if (!config?.activa) return falla("INACTIVA", "La facturación electrónica no está activa en este taller.");
  const motivo = datos.motivo.trim();
  if (!motivo) return falla("VALIDACION", "Escribe el motivo de la nota crédito.", [{ campo: "motivo", mensaje: "Escribe el motivo de la nota crédito." }]);
  if (!config.prefijoNotaCredito) {
    const texto = "Falta el prefijo de notas crédito en la configuración de facturación electrónica.";
    return falla("VALIDACION", texto, [{ campo: "config.prefijoNotaCredito", mensaje: texto }]);
  }

  const factura = await ctx.db.documentoElectronico.findFirst({ where: { facturaId, tipo: "FACTURA" } });
  if (!factura) return falla("NO_ENCONTRADO", "Esta factura no tiene factura electrónica.");
  if (factura.estado !== "ACEPTADO" || !factura.cufe) {
    return falla("ESTADO", "Solo se puede anular una factura electrónica aceptada por la DIAN.");
  }
  if (factura.ambiente !== config.ambiente) {
    return falla("AMBIENTE", "Esta factura se emitió en otro ambiente; no se puede anular desde el actual.");
  }

  const existente = await ctx.db.documentoElectronico.findFirst({
    where: { facturaId, tipo: "NOTA_CREDITO" },
    select: { id: true, estado: true },
  });
  if (existente?.estado === "ACEPTADO") {
    // La nota ya fue aceptada pero no alcanzó a anular la factura (proceso interrumpido): se completa.
    await anularFacturaReferenciada(ctx, existente.id);
    return { ok: true, documentoId: existente.id, estado: "ACEPTADO", mensajes: [] };
  }
  if (existente) return reintentarDocumento(ctx, existente.id);

  const original = factura.payload as unknown as FacturaVenta;
  const { fecha, hora } = fechaHoraBogota(ahora);
  const base: NotaCredito = {
    tipo: "NOTA_CREDITO",
    prefijo: config.prefijoNotaCredito,
    numero: Math.max(config.siguienteConsecutivoNotaCredito, 1),
    fecha,
    hora,
    adquirente: original.adquirente,
    lineas: original.lineas,
    pago: original.pago.forma === "CONTADO" ? { ...original.pago, vencimiento: fecha } : original.pago,
    enviarCorreo: original.enviarCorreo,
    concepto: datos.concepto,
    motivo,
    facturaReferencia: { numeroCompleto: `${factura.prefijo}${factura.numero}`, cufe: factura.cufe, fecha: original.fecha },
  };
  const errores = validarDocumento(base, { hoy: fecha });
  if (errores.length > 0) return falla("VALIDACION", "Faltan datos para la nota crédito.", errores);

  const facturaDocId = factura.id;
  const creado = await ctx.db.$transaction(async (tx) => {
    // Serializa por factura: dos anulaciones a la vez de la misma factura no crean dos notas.
    await tx.$queryRaw`SELECT id FROM facturas WHERE id = ${facturaId} FOR UPDATE`;
    const otra = await tx.documentoElectronico.findFirst({ where: { facturaId, tipo: "NOTA_CREDITO" }, select: { id: true } });
    if (otra) return null;
    // Consecutivo atómico de notas crédito: la fila de configuración queda bloqueada hasta el commit.
    const [fila] = await tx.$queryRaw<{ asignado: number }[]>`
      UPDATE configuracion_factura_electronica
      SET siguiente_consecutivo_nota_credito = GREATEST(siguiente_consecutivo_nota_credito, 1) + 1, updated_at = NOW()
      WHERE id = 'singleton'
      RETURNING siguiente_consecutivo_nota_credito - 1 AS asignado`;
    const documento: NotaCredito = { ...base, numero: fila.asignado };
    const doc = await tx.documentoElectronico.create({
      data: {
        tipo: "NOTA_CREDITO",
        facturaId,
        documentoReferenciaId: facturaDocId,
        prefijo: documento.prefijo,
        numero: documento.numero,
        estado: "ENVIANDO",
        payload: comoJson(documento),
        ambiente: config.ambiente,
        creadoPorId: ctx.usuarioId,
        intentos: 1,
        ultimoIntentoAt: ahora,
      },
      select: { id: true },
    });
    return { id: doc.id, documento, cufe: null } satisfies DocumentoEnCurso;
  }, TX);

  if (!creado) {
    const ganadora = await ctx.db.documentoElectronico.findFirst({ where: { facturaId, tipo: "NOTA_CREDITO" }, select: { id: true } });
    return ganadora ? reintentarDocumento(ctx, ganadora.id) : falla("NO_ENCONTRADO", "La factura no existe.");
  }
  return ejecutarEnvio(ctx, config, creado, false);
}

/**
 * Para crearFacturaAction: si la configuración está activa y en envío automático, crea y envía
 * el documento. Nunca lanza (un fallo no debe tumbar la factura ya creada).
 */
export async function emitirTrasFacturar(ctx: ContextoFe, facturaId: string): Promise<ResultadoFe | null> {
  try {
    const config = await leerConfiguracionFe(ctx.db);
    if (!config?.activa || config.envio !== "AUTOMATICO") return null;
    return await emitirDocumentoFactura(ctx, facturaId);
  } catch (e) {
    console.error("[factura-electronica] no se pudo emitir tras facturar", facturaId, e);
    return null;
  }
}
