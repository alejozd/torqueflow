"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { registrarEventoAuditoria } from "@/lib/auditoria/registrarEvento";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { leerFrecuenciaLiquidacion } from "@/lib/liquidaciones/configuracion";
import { periodoActual, ventanasSolapan } from "@/lib/liquidaciones/periodo";
import { esquemaLiquidacionInputSchema, frecuenciaLiquidacionSchema } from "@/lib/validation/liquidacion";
import { CONFIGURACION_TALLER_ID } from "@/lib/vencimientos/configuracion";
import type { FrecuenciaLiquidacion, TipoEsquemaLiquidacion } from "@/generated/prisma-tenant";

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
