"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { registrarEventoAuditoria } from "@/lib/auditoria/registrarEvento";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { leerFrecuenciaLiquidacion } from "@/lib/liquidaciones/configuracion";
import { CATEGORIA_LIQUIDACION_ID } from "@/lib/liquidaciones/categorias";
import { calcularMontoLiquidacion, hayCambiosSinReflejar, montoPorTrabajo, totalLiquidacion } from "@/lib/liquidaciones/calculo";
import { etiquetaPeriodo, periodoActual, rangoDelPeriodo, ventanasSolapan } from "@/lib/liquidaciones/periodo";
import { computeProduccionPorMecanico } from "@/lib/liquidaciones/produccion";
import {
  ajusteLiquidacionInputSchema,
  esquemaLiquidacionInputSchema,
  frecuenciaLiquidacionSchema,
  motivoAnulacionSchema,
  pagarLiquidacionInputSchema,
  periodoLiquidacionInputSchema,
} from "@/lib/validation/liquidacion";
import { CONFIGURACION_TALLER_ID } from "@/lib/vencimientos/configuracion";
import type {
  EstadoLiquidacion,
  FrecuenciaLiquidacion,
  TipoEsquemaLiquidacion,
} from "@/generated/prisma-tenant";

export interface TecnicoConEsquema {
  usuarioId: string;
  nombre: string;
  /** null = el técnico no tiene esquema y por tanto no se liquida (D4). */
  tipo: TipoEsquemaLiquidacion | null;
  porcentaje: number | null;
  montoFijo: number | null;
}

export interface EsquemaLiquidacionFormState {
  error: string | null;
  success: boolean;
}

export interface FrecuenciaLiquidacionFormState {
  error: string | null;
  success: boolean;
  /** Aviso no bloqueante al cambiar la frecuencia con liquidaciones del mes en curso. */
  advertencia: string | null;
}

const TECNICO_NO_ENCONTRADO = "Técnico no encontrado en tu sede activa";
const AVISO_MES_EN_CURSO =
  "Ya hay liquidaciones de este mes: las ya generadas no se recalculan, revisa que no vayas a pagar dos veces el mismo trabajo.";

function aNumero(valor: { toString(): string } | null | undefined): number | null {
  return valor === null || valor === undefined ? null : Number(valor.toString());
}

/** Técnicos de la sede activa con su esquema de pago (o sin él). */
export async function listTecnicosConEsquema(): Promise<TecnicoConEsquema[]> {
  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const filas = await tenantDb.usuario.findMany({
    where: { role: "TECNICO", sedes: { some: { sedeId: session.user.sedeActivaId } } },
    // select-only: nunca la fila completa de Usuario (passwordHash).
    select: {
      id: true,
      nombre: true,
      esquemaLiquidacion: { select: { tipo: true, porcentaje: true, montoFijo: true } },
    },
    orderBy: { nombre: "asc" },
  });

  return filas.map((fila) => ({
    usuarioId: fila.id,
    nombre: fila.nombre,
    tipo: fila.esquemaLiquidacion?.tipo ?? null,
    porcentaje: aNumero(fila.esquemaLiquidacion?.porcentaje),
    montoFijo: aNumero(fila.esquemaLiquidacion?.montoFijo),
  }));
}

/**
 * Guarda la forma de pago de un técnico. El campo que no aplica al tipo elegido
 * se guarda en null (D4): cambiar de porcentaje a fijo no deja un monto base
 * viejo escondido en la fila.
 */
export async function guardarEsquemaLiquidacionAction(
  usuarioId: string,
  prevState: EsquemaLiquidacionFormState,
  formData: FormData,
): Promise<EsquemaLiquidacionFormState> {
  const session = await requireRole(["ADMIN"]);
  const parsed = esquemaLiquidacionInputSchema.safeParse({
    tipo: formData.get("tipo") ?? "",
    porcentaje: formData.get("porcentaje") ?? "",
    montoFijo: formData.get("montoFijo") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };

  const tenantDb = getTenantDb(session.user.tenantSchema);

  // El esquema es del técnico en su sede: uno de otra sede no se toca desde aquí.
  const tecnico = await tenantDb.usuario.findFirst({
    where: { id: usuarioId, role: "TECNICO", sedes: { some: { sedeId: session.user.sedeActivaId } } },
    select: { id: true },
  });
  if (!tecnico) return { error: TECNICO_NO_ENCONTRADO, success: false };

  const { tipo } = parsed.data;
  const porcentaje = tipo === "FIJO" ? null : (parsed.data.porcentaje ?? null);
  const montoFijo = tipo === "PORCENTAJE" ? null : (parsed.data.montoFijo ?? null);

  try {
    await tenantDb.$transaction(async (tx) => {
      await tx.esquemaLiquidacion.upsert({
        where: { usuarioId },
        create: { usuarioId, tipo, porcentaje, montoFijo },
        update: { tipo, porcentaje, montoFijo },
      });
      await registrarEventoAuditoria(tx, {
        tipo: "LIQUIDACION_ESQUEMA_ACTUALIZAR",
        actorId: session.user.id,
        entidadTipo: "EsquemaLiquidacion",
        entidadId: usuarioId,
        detalle: { tipo, porcentaje, montoFijo },
      });
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "No se pudo guardar el esquema"), success: false };
  }

  revalidatePath("/liquidaciones");
  return { error: null, success: true };
}

export async function getFrecuenciaLiquidacion(): Promise<FrecuenciaLiquidacion> {
  const session = await requireRole(["ADMIN"]);
  return leerFrecuenciaLiquidacion(getTenantDb(session.user.tenantSchema));
}

/**
 * Cambia cada cuánto liquida el taller (D5). Cambiar de mensual a quincenal a
 * mitad de mes puede hacer que una quincena cubra trabajo ya liquidado en el
 * mes, así que se avisa -- sin bloquear -- cuando hay liquidaciones vigentes
 * cuya ventana se solapa con el mes en curso.
 */
export async function guardarFrecuenciaLiquidacionAction(
  prevState: FrecuenciaLiquidacionFormState,
  formData: FormData,
): Promise<FrecuenciaLiquidacionFormState> {
  const session = await requireRole(["ADMIN"]);
  const parsed = frecuenciaLiquidacionSchema.safeParse(formData.get("frecuencia"));
  if (!parsed.success) return { error: "Frecuencia inválida", success: false, advertencia: null };

  const tenantDb = getTenantDb(session.user.tenantSchema);

  try {
    await tenantDb.$transaction(async (tx) => {
      await tx.configuracionTaller.upsert({
        where: { id: CONFIGURACION_TALLER_ID },
        create: { id: CONFIGURACION_TALLER_ID, frecuenciaLiquidacion: parsed.data },
        update: { frecuenciaLiquidacion: parsed.data },
      });
      await registrarEventoAuditoria(tx, {
        tipo: "LIQUIDACION_FRECUENCIA_ACTUALIZAR",
        actorId: session.user.id,
        entidadTipo: "ConfiguracionTaller",
        entidadId: CONFIGURACION_TALLER_ID,
        detalle: { frecuencia: parsed.data },
      });
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "No se pudo guardar la frecuencia"), success: false, advertencia: null };
  }

  const advertencia = await advertenciaPorLiquidacionesDelMes(tenantDb, session.user.sedeActivaId);
  revalidatePath("/liquidaciones");
  return { error: null, success: true, advertencia };
}

async function advertenciaPorLiquidacionesDelMes(
  tenantDb: ReturnType<typeof getTenantDb>,
  sedeId: string,
): Promise<string | null> {
  const vigentes = await tenantDb.liquidacionMecanico.findMany({
    where: { sedeId, estado: { in: ["PENDIENTE", "PAGADA"] } },
    select: { periodo: true, frecuencia: true },
  });
  const mesEnCurso = periodoActual("MENSUAL", new Date());
  const haySolape = vigentes.some((liquidacion) =>
    ventanasSolapan(liquidacion.frecuencia, liquidacion.periodo, "MENSUAL", mesEnCurso),
  );
  return haySolape ? AVISO_MES_EN_CURSO : null;
}

export interface LiquidacionDocumento {
  id: string;
  estado: EstadoLiquidacion;
  frecuencia: FrecuenciaLiquidacion;
  ordenes: number;
  trabajos: number;
  montoManoObra: number;
  montoCalculado: number;
  ajuste: number;
  motivoAjuste: string | null;
  total: number;
  pagadaAt: Date | null;
  gastoId: string | null;
  motivoAnulacion: string | null;
  /** El documento congelado ya no coincide con lo producido ni con el esquema vigente (D10). */
  hayCambios: boolean;
}

export interface LiquidacionFila {
  usuarioId: string;
  nombre: string;
  /** Lo producido en el periodo (vivo), atribuido por líneas de mano de obra. */
  ordenes: number;
  trabajos: number;
  montoManoObra: number;
  montoPorTrabajo: number | null;
  /** Esquema vigente; null = sin esquema, no se liquida. */
  tipo: TipoEsquemaLiquidacion | null;
  porcentaje: number | null;
  montoFijo: number | null;
  montoSugerido: number | null;
  /** Ya hay una liquidación de otro periodo cuya ventana se pisa con esta (D6). */
  solapada: boolean;
  documento: LiquidacionDocumento | null;
}

export interface LiquidacionesDelPeriodoResultado {
  frecuencia: FrecuenciaLiquidacion;
  periodo: string;
  etiqueta: string;
  error: string | null;
  filas: LiquidacionFila[];
}

export interface GenerarLiquidacionesResultado {
  error: string | null;
  generadas: number;
  actualizadas: number;
  omitidas: number;
  sinEsquema: number;
  solapadas: number;
}

export interface AjusteLiquidacionFormState {
  error: string | null;
  success: boolean;
}

export interface PagoLiquidacionFormState {
  error: string | null;
  success: boolean;
}

const LIQUIDACION_NO_ENCONTRADA = "Liquidación no encontrada";
const CATEGORIA_FALTANTE = "Falta la categoría de gasto del sistema: aplica la migración de la fase 19";

/**
 * Todo lo que la página necesita de un periodo: por técnico de la sede, lo que
 * produjo (vivo), su esquema vigente, el monto que le correspondería y el
 * documento existente, si lo hay. Reporte y liquidación comparten la misma
 * agregación (`computeProduccionPorMecanico`), así que no pueden divergir.
 */
async function cargarFilasDelPeriodo(
  tenantDb: ReturnType<typeof getTenantDb>,
  sedeId: string,
  frecuencia: FrecuenciaLiquidacion,
  periodo: string,
): Promise<LiquidacionFila[]> {
  const rango = rangoDelPeriodo(frecuencia, periodo);

  const [tecnicos, ordenes, documentos] = await Promise.all([
    tenantDb.usuario.findMany({
      where: { role: "TECNICO", sedes: { some: { sedeId } } },
      select: {
        id: true,
        nombre: true,
        esquemaLiquidacion: { select: { tipo: true, porcentaje: true, montoFijo: true } },
      },
      orderBy: { nombre: "asc" },
    }),
    tenantDb.ordenTrabajo.findMany({
      where: { sedeId, estado: "ENTREGADA", entregadaAt: { gte: rango.gte, lt: rango.lt } },
      select: {
        mecanicoId: true,
        mecanico: { select: { nombre: true } },
        manoDeObra: {
          select: { valor: true, mecanicoId: true, mecanico: { select: { nombre: true } } },
        },
      },
    }),
    // Se traen todas las de la sede: son pocas y hacen falta tanto para el
    // documento del periodo como para detectar solapamientos con otros.
    tenantDb.liquidacionMecanico.findMany({
      where: { sedeId },
      select: {
        id: true,
        usuarioId: true,
        estado: true,
        periodo: true,
        frecuencia: true,
        ordenes: true,
        trabajos: true,
        montoManoObra: true,
        montoCalculado: true,
        ajuste: true,
        motivoAjuste: true,
        total: true,
        pagadaAt: true,
        gastoId: true,
        motivoAnulacion: true,
      },
    }),
  ]);

  const produccion = computeProduccionPorMecanico(
    ordenes.map((orden) => ({
      mecanicoId: orden.mecanicoId,
      mecanicoNombre: orden.mecanico?.nombre ?? null,
      manoDeObra: orden.manoDeObra.map((linea) => ({
        valor: Number(linea.valor),
        mecanicoId: linea.mecanicoId,
        mecanicoNombre: linea.mecanico?.nombre ?? null,
      })),
    })),
  );
  const porMecanico = new Map(
    produccion.filter((fila) => fila.mecanicoId !== null).map((fila) => [fila.mecanicoId!, fila]),
  );

  return tecnicos.map((tecnico) => {
    const vivo = porMecanico.get(tecnico.id) ?? { ordenes: 0, trabajos: 0, montoManoObra: 0 };
    const esquema = tecnico.esquemaLiquidacion
      ? {
          tipo: tecnico.esquemaLiquidacion.tipo,
          porcentaje: aNumero(tecnico.esquemaLiquidacion.porcentaje),
          montoFijo: aNumero(tecnico.esquemaLiquidacion.montoFijo),
        }
      : null;
    const montoSugerido = esquema ? calcularMontoLiquidacion(esquema, vivo.montoManoObra) : null;

    const existente =
      documentos.find(
        (documento) =>
          documento.usuarioId === tecnico.id && documento.periodo === periodo && documento.frecuencia === frecuencia,
      ) ?? null;
    const solapada = documentos.some(
      (documento) =>
        documento.usuarioId === tecnico.id &&
        !(documento.periodo === periodo && documento.frecuencia === frecuencia) &&
        ventanasSolapan(documento.frecuencia, documento.periodo, frecuencia, periodo),
    );

    return {
      usuarioId: tecnico.id,
      nombre: tecnico.nombre,
      ordenes: vivo.ordenes,
      trabajos: vivo.trabajos,
      montoManoObra: vivo.montoManoObra,
      montoPorTrabajo: montoPorTrabajo(vivo.montoManoObra, vivo.trabajos),
      tipo: esquema?.tipo ?? null,
      porcentaje: esquema?.porcentaje ?? null,
      montoFijo: esquema?.montoFijo ?? null,
      montoSugerido,
      solapada,
      documento: existente
        ? {
            id: existente.id,
            estado: existente.estado,
            frecuencia: existente.frecuencia,
            ordenes: existente.ordenes,
            trabajos: existente.trabajos,
            montoManoObra: Number(existente.montoManoObra),
            montoCalculado: Number(existente.montoCalculado),
            ajuste: Number(existente.ajuste),
            motivoAjuste: existente.motivoAjuste,
            total: Number(existente.total),
            pagadaAt: existente.pagadaAt,
            gastoId: existente.gastoId,
            motivoAnulacion: existente.motivoAnulacion,
            hayCambios:
              existente.estado === "PENDIENTE" &&
              hayCambiosSinReflejar(
                {
                  ordenes: existente.ordenes,
                  trabajos: existente.trabajos,
                  montoManoObra: Number(existente.montoManoObra),
                  montoCalculado: Number(existente.montoCalculado),
                },
                { ...vivo, montoCalculado: montoSugerido ?? 0 },
              ),
          }
        : null,
    };
  });
}

export async function listLiquidacionesDelPeriodo(periodo: string): Promise<LiquidacionesDelPeriodoResultado> {
  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const frecuencia = await leerFrecuenciaLiquidacion(tenantDb);

  const parsed = periodoLiquidacionInputSchema.safeParse({ frecuencia, periodo });
  if (!parsed.success) {
    return { frecuencia, periodo, etiqueta: "", error: parsed.error.issues[0]?.message ?? "Periodo inválido", filas: [] };
  }

  const filas = await cargarFilasDelPeriodo(tenantDb, session.user.sedeActivaId, frecuencia, periodo);
  return { frecuencia, periodo, etiqueta: etiquetaPeriodo(frecuencia, periodo), error: null, filas };
}

/**
 * Genera (o recalcula) las liquidaciones del periodo. Nunca toca una pagada, y
 * omite las que se solapan con otro periodo ya liquidado del mismo técnico (D6):
 * es lo que impide pagar dos veces el mismo trabajo tras cambiar la frecuencia.
 */
export async function generarLiquidacionesAction(periodo: string): Promise<GenerarLiquidacionesResultado> {
  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const frecuencia = await leerFrecuenciaLiquidacion(tenantDb);
  const vacio = { generadas: 0, actualizadas: 0, omitidas: 0, sinEsquema: 0, solapadas: 0 };

  const parsed = periodoLiquidacionInputSchema.safeParse({ frecuencia, periodo });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Periodo inválido", ...vacio };
  }

  const filas = await cargarFilasDelPeriodo(tenantDb, session.user.sedeActivaId, frecuencia, periodo);
  const contadores = { ...vacio };

  try {
    await tenantDb.$transaction(async (tx) => {
      for (const fila of filas) {
        const documento = fila.documento;

        if (!fila.tipo) {
          contadores.sinEsquema += 1;
          continue;
        }
        // Una pagada nunca se toca: el documento es el respaldo del pago.
        if (documento?.estado === "PAGADA") {
          contadores.omitidas += 1;
          continue;
        }
        // Pendiente y sin cambios: nada que hacer.
        if (documento?.estado === "PENDIENTE" && !documento.hayCambios) {
          contadores.omitidas += 1;
          continue;
        }
        // Ventana ya cubierta por otra liquidación del mismo técnico (D6):
        // aplica también a reactivar una anulada, que volvería a pagar ese trabajo.
        if (fila.solapada) {
          contadores.solapadas += 1;
          continue;
        }

        const montoCalculado = fila.montoSugerido ?? 0;
        const snapshot = {
          ordenes: fila.ordenes,
          trabajos: fila.trabajos,
          montoManoObra: fila.montoManoObra,
          tipo: fila.tipo,
          porcentaje: fila.porcentaje,
          montoFijo: fila.montoFijo,
          montoCalculado,
          generadaPorId: session.user.id,
        };

        let liquidacionId: string;
        if (fila.documento) {
          // Recalcular una pendiente conserva su ajuste; reactivar una anulada
          // limpia el rastro de la anulación.
          await tx.liquidacionMecanico.update({
            where: { id: fila.documento.id },
            data: {
              ...snapshot,
              estado: "PENDIENTE",
              total: totalLiquidacion(montoCalculado, fila.documento.ajuste),
              generadaAt: new Date(),
              anuladaAt: null,
              anuladaPorId: null,
              motivoAnulacion: null,
            },
          });
          liquidacionId = fila.documento.id;
          contadores.actualizadas += 1;
        } else {
          const creada = await tx.liquidacionMecanico.create({
            data: {
              ...snapshot,
              periodo,
              frecuencia,
              sedeId: session.user.sedeActivaId,
              usuarioId: fila.usuarioId,
              estado: "PENDIENTE",
              ajuste: 0,
              motivoAjuste: null,
              total: montoCalculado,
            },
          });
          liquidacionId = creada.id;
          contadores.generadas += 1;
        }

        await registrarEventoAuditoria(tx, {
          tipo: "LIQUIDACION_GENERAR",
          actorId: session.user.id,
          entidadTipo: "LiquidacionMecanico",
          entidadId: liquidacionId,
          detalle: { periodo, frecuencia, usuarioId: fila.usuarioId, montoCalculado },
        });
      }
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "No se pudieron generar las liquidaciones"), ...vacio };
  }

  revalidatePath("/liquidaciones");
  return { error: null, ...contadores };
}

export async function actualizarAjusteLiquidacionAction(
  liquidacionId: string,
  prevState: AjusteLiquidacionFormState,
  formData: FormData,
): Promise<AjusteLiquidacionFormState> {
  const session = await requireRole(["ADMIN"]);
  const parsed = ajusteLiquidacionInputSchema.safeParse({
    ajuste: formData.get("ajuste") ?? "",
    motivo: formData.get("motivo") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };

  const tenantDb = getTenantDb(session.user.tenantSchema);
  const documento = await tenantDb.liquidacionMecanico.findFirst({
    where: { id: liquidacionId, sedeId: session.user.sedeActivaId },
    select: { id: true, estado: true, montoCalculado: true },
  });
  if (!documento) return { error: LIQUIDACION_NO_ENCONTRADA, success: false };
  if (documento.estado !== "PENDIENTE") {
    return { error: "Solo se puede ajustar una liquidación pendiente", success: false };
  }

  const montoCalculado = Number(documento.montoCalculado);
  const total = totalLiquidacion(montoCalculado, parsed.data.ajuste);
  if (total < 0) return { error: "El ajuste no puede dejar el total en negativo", success: false };

  try {
    await tenantDb.$transaction(async (tx) => {
      await tx.liquidacionMecanico.update({
        where: { id: liquidacionId },
        data: { ajuste: parsed.data.ajuste, motivoAjuste: parsed.data.motivo ?? null, total },
      });
      await registrarEventoAuditoria(tx, {
        tipo: "LIQUIDACION_AJUSTAR",
        actorId: session.user.id,
        entidadTipo: "LiquidacionMecanico",
        entidadId: liquidacionId,
        detalle: { ajuste: parsed.data.ajuste, motivo: parsed.data.motivo ?? null, total },
      });
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "No se pudo ajustar la liquidación"), success: false };
  }

  revalidatePath("/liquidaciones");
  return { error: null, success: true };
}

/**
 * Paga una liquidación creando el gasto de la sede con la categoría del sistema
 * (D8): así el pago aparece en el arqueo de caja y en la rentabilidad sin código
 * nuevo en esos módulos. El monto sale del documento, nunca del formulario.
 */
export async function pagarLiquidacionAction(
  liquidacionId: string,
  prevState: PagoLiquidacionFormState,
  formData: FormData,
): Promise<PagoLiquidacionFormState> {
  const session = await requireRole(["ADMIN"]);
  const parsed = pagarLiquidacionInputSchema.safeParse({
    metodoPago: formData.get("metodoPago") ?? "",
    referencia: formData.get("referencia") ?? "",
    fecha: formData.get("fecha") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };

  const tenantDb = getTenantDb(session.user.tenantSchema);
  const documento = await tenantDb.liquidacionMecanico.findFirst({
    where: { id: liquidacionId, sedeId: session.user.sedeActivaId },
    select: {
      id: true,
      estado: true,
      total: true,
      periodo: true,
      frecuencia: true,
      gastoId: true,
      // select-only: nunca la fila completa de Usuario.
      usuario: { select: { nombre: true } },
    },
  });
  if (!documento) return { error: LIQUIDACION_NO_ENCONTRADA, success: false };
  if (documento.estado !== "PENDIENTE") {
    return { error: "Solo se puede pagar una liquidación pendiente", success: false };
  }

  const categoria = await tenantDb.categoriaGasto.findUnique({
    where: { id: CATEGORIA_LIQUIDACION_ID },
    select: { id: true },
  });
  if (!categoria) return { error: CATEGORIA_FALTANTE, success: false };

  const { metodoPago, referencia, fecha } = parsed.data;

  try {
    await tenantDb.$transaction(async (tx) => {
      const gasto = await tx.gasto.create({
        data: {
          sedeId: session.user.sedeActivaId,
          categoriaId: CATEGORIA_LIQUIDACION_ID,
          descripcion: `Liquidación ${documento.usuario.nombre} · ${etiquetaPeriodo(documento.frecuencia, documento.periodo)}`,
          monto: Number(documento.total),
          fecha: new Date(`${fecha}T00:00:00.000Z`),
          referencia: referencia ?? null,
          registradoPorId: session.user.id,
          pagadoEnEfectivo: metodoPago === "EFECTIVO",
        },
      });
      await tx.liquidacionMecanico.update({
        where: { id: liquidacionId },
        data: { estado: "PAGADA", pagadaAt: new Date(), pagadaPorId: session.user.id, gastoId: gasto.id },
      });
      await registrarEventoAuditoria(tx, {
        tipo: "LIQUIDACION_PAGAR",
        actorId: session.user.id,
        entidadTipo: "LiquidacionMecanico",
        entidadId: liquidacionId,
        detalle: { metodoPago, referencia: referencia ?? null, monto: Number(documento.total), gastoId: gasto.id },
      });
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "No se pudo pagar la liquidación"), success: false };
  }

  revalidatePath("/liquidaciones");
  revalidatePath("/gastos");
  revalidatePath("/caja");
  revalidatePath("/reportes");
  return { error: null, success: true };
}

/**
 * Anula una liquidación. Si ya estaba pagada, borra el gasto que la materializó
 * en la misma transacción (D9): es un pago equivocado y la caja tiene que
 * reflejarlo. El AuditLog guarda el rastro de las dos cosas.
 */
export async function anularLiquidacionAction(liquidacionId: string, motivo: string): Promise<{ error: string | null }> {
  const session = await requireRole(["ADMIN"]);
  const parsed = motivoAnulacionSchema.safeParse(motivo);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Explica por qué se anula la liquidación" };

  const tenantDb = getTenantDb(session.user.tenantSchema);
  const documento = await tenantDb.liquidacionMecanico.findFirst({
    where: { id: liquidacionId, sedeId: session.user.sedeActivaId },
    select: { id: true, estado: true, gastoId: true },
  });
  if (!documento) return { error: LIQUIDACION_NO_ENCONTRADA };
  if (documento.estado === "ANULADA") return { error: "La liquidación ya está anulada" };

  try {
    await tenantDb.$transaction(async (tx) => {
      if (documento.gastoId) {
        await tx.gasto.delete({ where: { id: documento.gastoId } });
      }
      await tx.liquidacionMecanico.update({
        where: { id: liquidacionId },
        data: {
          estado: "ANULADA",
          anuladaAt: new Date(),
          anuladaPorId: session.user.id,
          motivoAnulacion: parsed.data,
          gastoId: null,
        },
      });
      await registrarEventoAuditoria(tx, {
        tipo: "LIQUIDACION_ANULAR",
        actorId: session.user.id,
        entidadTipo: "LiquidacionMecanico",
        entidadId: liquidacionId,
        detalle: { motivo: parsed.data, gastoEliminado: documento.gastoId },
      });
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "No se pudo anular la liquidación") };
  }

  revalidatePath("/liquidaciones");
  revalidatePath("/gastos");
  revalidatePath("/caja");
  revalidatePath("/reportes");
  return { error: null };
}
