"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { registrarEventoAuditoria } from "@/lib/auditoria/registrarEvento";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { leerFrecuenciaLiquidacion } from "@/lib/liquidaciones/configuracion";
import { CATEGORIA_LIQUIDACION_ID } from "@/lib/liquidaciones/categorias";
import { calcularMontoLiquidacion, hayCambiosSinReflejar, montoPorTrabajo, totalLiquidacion } from "@/lib/liquidaciones/calculo";
import { etiquetaPeriodo, frecuenciaDePeriodo, periodoActual, rangoDelPeriodo, ventanasSolapan } from "@/lib/liquidaciones/periodo";
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
  /** Mano de obra del periodo que no se le puede liquidar a nadie (sin mecánico). */
  sinAsignar: { ordenes: number; trabajos: number; montoManoObra: number } | null;
}

export interface GenerarLiquidacionesResultado {
  error: string | null;
  generadas: number;
  actualizadas: number;
  omitidas: number;
  sinEsquema: number;
  solapadas: number;
  /** Ajustes que se descartaron por dejar el total en negativo (no puede haber liquidaciones negativas). */
  ajustesDescartados: number;
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
const LIQUIDACION_YA_NO_PENDIENTE = "La liquidación ya no está pendiente";
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
): Promise<{ filas: LiquidacionFila[]; sinAsignar: { ordenes: number; trabajos: number; montoManoObra: number } | null }> {
  const rango = rangoDelPeriodo(frecuencia, periodo);

  // Se traen todas las de la sede: son pocas y hacen falta tanto para el
  // documento del periodo como para detectar solapamientos con otros.
  const documentos = await tenantDb.liquidacionMecanico.findMany({
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
  });

  // Un técnico que ya no está en la sede pero tiene documento de este periodo
  // también entra: si no, su liquidación quedaría imposible de pagar o anular.
  const idsConDocumento = documentos
    .filter((documento) => documento.periodo === periodo && documento.frecuencia === frecuencia)
    .map((documento) => documento.usuarioId);

  const [tecnicos, ordenes] = await Promise.all([
    tenantDb.usuario.findMany({
      where:
        idsConDocumento.length > 0
          ? {
              OR: [
                { role: "TECNICO", sedes: { some: { sedeId } } },
                { id: { in: idsConDocumento } },
              ],
            }
          : { role: "TECNICO", sedes: { some: { sedeId } } },
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
  // La bolsa "Sin asignar" no se liquida (no hay a quién), pero hay que poder
  // avisar de esa mano de obra: es trabajo que nadie cobra.
  const sinAsignarBruto = produccion.find((fila) => fila.mecanicoId === null) ?? null;
  const sinAsignar = sinAsignarBruto
    ? { ordenes: sinAsignarBruto.ordenes, trabajos: sinAsignarBruto.trabajos, montoManoObra: sinAsignarBruto.montoManoObra }
    : null;

  const filas = tecnicos.map((tecnico) => {
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
    // Una anulada no bloquea: su ventana vuelve a estar libre para liquidarla.
    const solapada = documentos.some(
      (documento) =>
        documento.usuarioId === tecnico.id &&
        documento.estado !== "ANULADA" &&
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

  return { filas, sinAsignar };
}

/**
 * La frecuencia sale de la forma del periodo, no del ajuste del taller: así un
 * periodo ya liquidado (mensual, por ejemplo) sigue siendo legible y pagable
 * después de que el taller pase a quincenal.
 */
function frecuenciaDelPeriodo(periodo: string): FrecuenciaLiquidacion | null {
  return frecuenciaDePeriodo(periodo);
}

export async function listLiquidacionesDelPeriodo(periodo: string): Promise<LiquidacionesDelPeriodoResultado> {
  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const frecuencia = frecuenciaDelPeriodo(periodo) ?? (await leerFrecuenciaLiquidacion(tenantDb));

  const parsed = periodoLiquidacionInputSchema.safeParse({ frecuencia, periodo });
  if (!parsed.success) {
    return {
      frecuencia,
      periodo,
      etiqueta: "",
      error: parsed.error.issues[0]?.message ?? "Periodo inválido",
      filas: [],
      sinAsignar: null,
    };
  }

  const { filas, sinAsignar } = await cargarFilasDelPeriodo(tenantDb, session.user.sedeActivaId, frecuencia, periodo);
  return { frecuencia, periodo, etiqueta: etiquetaPeriodo(frecuencia, periodo), error: null, filas, sinAsignar };
}

/**
 * Genera (o recalcula) las liquidaciones del periodo. Nunca toca una pagada, y
 * omite las que se solapan con otro periodo ya liquidado del mismo técnico (D6):
 * es lo que impide pagar dos veces el mismo trabajo tras cambiar la frecuencia.
 */
export async function generarLiquidacionesAction(periodo: string): Promise<GenerarLiquidacionesResultado> {
  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const frecuencia = frecuenciaDelPeriodo(periodo) ?? (await leerFrecuenciaLiquidacion(tenantDb));
  const vacio = { generadas: 0, actualizadas: 0, omitidas: 0, sinEsquema: 0, solapadas: 0, ajustesDescartados: 0 };

  const parsed = periodoLiquidacionInputSchema.safeParse({ frecuencia, periodo });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Periodo inválido", ...vacio };
  }

  const { filas } = await cargarFilasDelPeriodo(tenantDb, session.user.sedeActivaId, frecuencia, periodo);
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
        // Una anulada no se reactiva sola: volver a deberle dinero a alguien es
        // una decisión explícita (acción "Reactivar" de la fila).
        if (documento?.estado === "ANULADA") {
          contadores.omitidas += 1;
          continue;
        }
        // Pendiente y sin cambios: nada que hacer.
        if (documento?.estado === "PENDIENTE" && !documento.hayCambios) {
          contadores.omitidas += 1;
          continue;
        }
        // Ventana ya cubierta por otra liquidación vigente del mismo técnico (D6).
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
        let ajustesDescartados = 0;
        if (documento) {
          // Recalcular una pendiente conserva su ajuste, salvo que el ajuste ya
          // no quepa en el cálculo nuevo: una liquidación nunca puede quedar en
          // negativo (y menos pagarse así).
          const totalConAjuste = totalLiquidacion(montoCalculado, documento.ajuste);
          const conservaAjuste = totalConAjuste >= 0;
          if (!conservaAjuste) ajustesDescartados = 1;

          const { count } = await tx.liquidacionMecanico.updateMany({
            // El estado se revalida dentro de la transacción: si otro ADMIN la
            // pagó mientras tanto, esto no la devuelve a pendiente.
            where: { id: documento.id, estado: { in: ["PENDIENTE", "ANULADA"] } },
            data: {
              ...snapshot,
              estado: "PENDIENTE",
              ajuste: conservaAjuste ? documento.ajuste : 0,
              motivoAjuste: conservaAjuste ? documento.motivoAjuste : null,
              total: conservaAjuste ? totalConAjuste : montoCalculado,
              generadaAt: new Date(),
              anuladaAt: null,
              anuladaPorId: null,
              motivoAnulacion: null,
            },
          });
          if (count !== 1) {
            contadores.omitidas += 1;
            continue;
          }
          liquidacionId = documento.id;
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
        contadores.ajustesDescartados += ajustesDescartados;

        await registrarEventoAuditoria(tx, {
          tipo: "LIQUIDACION_GENERAR",
          actorId: session.user.id,
          entidadTipo: "LiquidacionMecanico",
          entidadId: liquidacionId,
          detalle: {
            periodo,
            frecuencia,
            usuarioId: fila.usuarioId,
            montoCalculado,
            ...(ajustesDescartados > 0 ? { ajusteDescartado: documento?.ajuste ?? 0 } : {}),
          },
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
      const { count } = await tx.liquidacionMecanico.updateMany({
        // El estado se revalida dentro de la transacción: si otro ADMIN la pagó
        // o la anuló mientras tanto, este ajuste no la resucita.
        where: { id: liquidacionId, estado: "PENDIENTE" },
        data: { ajuste: parsed.data.ajuste, motivoAjuste: parsed.data.motivo ?? null, total },
      });
      if (count !== 1) throw new Error(LIQUIDACION_YA_NO_PENDIENTE);
      await registrarEventoAuditoria(tx, {
        tipo: "LIQUIDACION_AJUSTAR",
        actorId: session.user.id,
        entidadTipo: "LiquidacionMecanico",
        entidadId: liquidacionId,
        detalle: { ajuste: parsed.data.ajuste, motivo: parsed.data.motivo ?? null, total },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === LIQUIDACION_YA_NO_PENDIENTE) {
      return { error: LIQUIDACION_YA_NO_PENDIENTE, success: false };
    }
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
  // Una pendiente con gasto ya emitido sería un segundo pago: pasa si el estado
  // se revirtió por una carrera (ver el guardia del update).
  if (documento.gastoId) {
    return { error: "Esa liquidación ya tiene un gasto asociado: anúlala y vuelve a generarla", success: false };
  }
  // Nunca se paga una liquidación de monto no positivo (crearGastoAction
  // tampoco lo aceptaría, y un gasto de 0 no es un pago).
  if (Number(documento.total) <= 0) {
    return { error: "El total de la liquidación debe ser mayor que cero antes de pagarla", success: false };
  }

  const categoria = await tenantDb.categoriaGasto.findUnique({
    where: { id: CATEGORIA_LIQUIDACION_ID },
    select: { id: true, activo: true },
  });
  if (!categoria) return { error: CATEGORIA_FALTANTE, success: false };
  if (!categoria.activo) {
    return { error: "La categoría 'Liquidación de mecánicos' está desactivada: actívala en Gastos → Configuración", success: false };
  }

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
      const { count } = await tx.liquidacionMecanico.updateMany({
        // Solo si sigue pendiente y sin gasto: dos pagos concurrentes no pueden
        // dejar dos gastos por el mismo trabajo.
        where: { id: liquidacionId, estado: "PENDIENTE", gastoId: null },
        data: { estado: "PAGADA", pagadaAt: new Date(), pagadaPorId: session.user.id, gastoId: gasto.id },
      });
      if (count !== 1) throw new Error(LIQUIDACION_YA_NO_PENDIENTE);
      await registrarEventoAuditoria(tx, {
        tipo: "LIQUIDACION_PAGAR",
        actorId: session.user.id,
        entidadTipo: "LiquidacionMecanico",
        entidadId: liquidacionId,
        detalle: { metodoPago, referencia: referencia ?? null, monto: Number(documento.total), gastoId: gasto.id },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === LIQUIDACION_YA_NO_PENDIENTE) {
      return { error: LIQUIDACION_YA_NO_PENDIENTE, success: false };
    }
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
        // deleteMany en vez de delete: si el gasto ya no está (alguien lo borró
        // desde /gastos), anular la liquidación no debe fallar por eso.
        await tx.gasto.deleteMany({ where: { id: documento.gastoId } });
      }
      const { count } = await tx.liquidacionMecanico.updateMany({
        // Guardia de estado dentro de la transacción: no se anula lo que otro
        // ADMIN acaba de pagar sin que el gasto se entere.
        where: { id: liquidacionId, estado: { not: "ANULADA" } },
        data: {
          estado: "ANULADA",
          anuladaAt: new Date(),
          anuladaPorId: session.user.id,
          motivoAnulacion: parsed.data,
          gastoId: null,
        },
      });
      if (count !== 1) throw new Error("La liquidación ya está anulada");
      await registrarEventoAuditoria(tx, {
        tipo: "LIQUIDACION_ANULAR",
        actorId: session.user.id,
        entidadTipo: "LiquidacionMecanico",
        entidadId: liquidacionId,
        detalle: { motivo: parsed.data, gastoEliminado: documento.gastoId },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "La liquidación ya está anulada") {
      return { error: err.message };
    }
    return { error: friendlyPrismaErrorMessage(err, "No se pudo anular la liquidación") };
  }

  revalidatePath("/liquidaciones");
  revalidatePath("/gastos");
  revalidatePath("/caja");
  revalidatePath("/reportes");
  return { error: null };
}

/**
 * Reactiva una liquidación anulada, recalculándola con el esquema vigente. Es
 * explícito por fila (no lo hace "generar"): volver a deberle dinero a alguien
 * después de haber anulado el documento tiene que ser una decisión consciente.
 * Limpia el ciclo anterior completo -- ajuste, pago y anulación --, y respeta la
 * guarda de solapamiento (D6).
 */
export async function reactivarLiquidacionAction(liquidacionId: string): Promise<{ error: string | null }> {
  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const documento = await tenantDb.liquidacionMecanico.findFirst({
    where: { id: liquidacionId, sedeId: session.user.sedeActivaId },
    select: { id: true, estado: true, periodo: true, frecuencia: true, usuarioId: true },
  });
  if (!documento) return { error: LIQUIDACION_NO_ENCONTRADA };
  if (documento.estado !== "ANULADA") return { error: "Solo se puede reactivar una liquidación anulada" };

  const { filas } = await cargarFilasDelPeriodo(
    tenantDb,
    session.user.sedeActivaId,
    documento.frecuencia,
    documento.periodo,
  );
  const fila = filas.find((candidata) => candidata.usuarioId === documento.usuarioId);
  if (!fila) return { error: "Ese técnico ya no pertenece a esta sede" };
  // Se copia a una constante: el estrechamiento de una propiedad no sobrevive
  // dentro del callback de la transacción.
  const tipo = fila.tipo;
  if (!tipo) return { error: "Ese técnico no tiene esquema de pago: defínelo antes de reactivar" };
  if (fila.solapada) return { error: "Ese periodo ya está liquidado en otro documento para ese técnico" };

  const montoCalculado = fila.montoSugerido ?? 0;

  try {
    await tenantDb.$transaction(async (tx) => {
      const { count } = await tx.liquidacionMecanico.updateMany({
        where: { id: liquidacionId, estado: "ANULADA" },
        data: {
          estado: "PENDIENTE",
          ordenes: fila.ordenes,
          trabajos: fila.trabajos,
          montoManoObra: fila.montoManoObra,
          tipo,
          porcentaje: fila.porcentaje,
          montoFijo: fila.montoFijo,
          montoCalculado,
          ajuste: 0,
          motivoAjuste: null,
          total: montoCalculado,
          pagadaAt: null,
          pagadaPorId: null,
          gastoId: null,
          anuladaAt: null,
          anuladaPorId: null,
          motivoAnulacion: null,
          generadaPorId: session.user.id,
          generadaAt: new Date(),
        },
      });
      if (count !== 1) throw new Error("La liquidación ya no está anulada");
      await registrarEventoAuditoria(tx, {
        tipo: "LIQUIDACION_GENERAR",
        actorId: session.user.id,
        entidadTipo: "LiquidacionMecanico",
        entidadId: liquidacionId,
        detalle: {
          periodo: documento.periodo,
          frecuencia: documento.frecuencia,
          usuarioId: documento.usuarioId,
          montoCalculado,
          reactivada: true,
        },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "La liquidación ya no está anulada") return { error: err.message };
    return { error: friendlyPrismaErrorMessage(err, "No se pudo reactivar la liquidación") };
  }

  revalidatePath("/liquidaciones");
  return { error: null };
}

/** Deja a un técnico sin esquema: deja de liquidarse hasta que se le defina otro (D4). */
export async function quitarEsquemaLiquidacionAction(usuarioId: string): Promise<{ error: string | null }> {
  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const tecnico = await tenantDb.usuario.findFirst({
    where: { id: usuarioId, role: "TECNICO", sedes: { some: { sedeId: session.user.sedeActivaId } } },
    select: { id: true },
  });
  if (!tecnico) return { error: TECNICO_NO_ENCONTRADO };

  try {
    await tenantDb.$transaction(async (tx) => {
      const { count } = await tx.esquemaLiquidacion.deleteMany({ where: { usuarioId } });
      if (count === 0) throw new Error("Ese técnico no tiene esquema que quitar");
      await registrarEventoAuditoria(tx, {
        tipo: "LIQUIDACION_ESQUEMA_ACTUALIZAR",
        actorId: session.user.id,
        entidadTipo: "EsquemaLiquidacion",
        entidadId: usuarioId,
        detalle: { eliminado: true },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Ese técnico no tiene esquema que quitar") return { error: err.message };
    return { error: friendlyPrismaErrorMessage(err, "No se pudo quitar el esquema") };
  }

  revalidatePath("/liquidaciones");
  return { error: null };
}
