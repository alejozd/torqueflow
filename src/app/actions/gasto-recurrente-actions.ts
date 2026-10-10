"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { ETIQUETA_MES, periodoActualBogota } from "@/lib/gastos/periodo";
import { cargarPlantillasParaPendientes } from "@/lib/gastos/pendientes-db";
import { calcularRecurrentesPendientes, type RecurrentePendiente } from "@/lib/gastos/recurrentes-pendientes";
import { resolverSede, validarCategoria, validarSede } from "@/lib/gastos/validaciones-db";
import {
  confirmarRecurrenteInputSchema,
  gastoRecurrenteInputSchema,
  periodoSchema,
} from "@/lib/validation/gasto";

export interface PlantillaVista {
  id: string;
  sedeId: string;
  sedeNombre: string;
  categoriaId: string;
  categoriaNombre: string;
  descripcion: string;
  montoEstimado: number;
  diaDelMes: number;
  desde: string;
  activo: boolean;
}

export interface RecurrenteFormState {
  error: string | null;
  success: boolean;
}

function revalidar() {
  revalidatePath("/gastos");
  revalidatePath("/gastos/configuracion");
  revalidatePath("/reportes");
}

function esP2002(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}

function leerCamposPlantilla(formData: FormData) {
  return gastoRecurrenteInputSchema.safeParse({
    categoriaId: formData.get("categoriaId") ?? "",
    descripcion: formData.get("descripcion") ?? "",
    montoEstimado: formData.get("montoEstimado") ?? "",
    diaDelMes: formData.get("diaDelMes") ?? "",
    desde: formData.get("desde") ?? "",
    sedeId: formData.get("sedeId") || undefined,
  });
}

export async function listPlantillasRecurrentes(): Promise<PlantillaVista[]> {
  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const filas = await tenantDb.gastoRecurrente.findMany({
    include: { sede: { select: { nombre: true } }, categoria: { select: { nombre: true } } },
    orderBy: [{ activo: "desc" }, { descripcion: "asc" }],
  });
  return filas.map((p) => ({
    id: p.id,
    sedeId: p.sedeId,
    sedeNombre: p.sede.nombre,
    categoriaId: p.categoriaId,
    categoriaNombre: p.categoria.nombre,
    descripcion: p.descripcion,
    montoEstimado: Number(p.montoEstimado),
    diaDelMes: p.diaDelMes,
    desde: p.desde,
    activo: p.activo,
  }));
}

export async function crearGastoRecurrenteAction(
  prevState: RecurrenteFormState,
  formData: FormData,
): Promise<RecurrenteFormState> {
  const session = await requireRole(["ADMIN"]);
  const parsed = leerCamposPlantilla(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  const { categoriaId, descripcion, montoEstimado, diaDelMes, desde } = parsed.data;

  const tenantDb = getTenantDb(session.user.tenantSchema);
  const errorCategoria = await validarCategoria(tenantDb, categoriaId);
  if (errorCategoria) return { error: errorCategoria, success: false };
  const sedeId = resolverSede(session, parsed.data.sedeId);
  const errorSede = await validarSede(tenantDb, session, sedeId);
  if (errorSede) return { error: errorSede, success: false };

  try {
    await tenantDb.gastoRecurrente.create({
      data: { sedeId, categoriaId, descripcion, montoEstimado, diaDelMes, desde },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "No se pudo guardar la plantilla"), success: false };
  }
  revalidar();
  return { error: null, success: true };
}

export async function actualizarGastoRecurrenteAction(
  id: string,
  prevState: RecurrenteFormState,
  formData: FormData,
): Promise<RecurrenteFormState> {
  const session = await requireRole(["ADMIN"]);
  const parsed = leerCamposPlantilla(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  const { categoriaId, descripcion, montoEstimado, diaDelMes, desde } = parsed.data;

  const tenantDb = getTenantDb(session.user.tenantSchema);
  const errorCategoria = await validarCategoria(tenantDb, categoriaId, async () => {
    const actual = await tenantDb.gastoRecurrente.findUnique({ where: { id }, select: { categoriaId: true } });
    return actual?.categoriaId ?? null;
  });
  if (errorCategoria) return { error: errorCategoria, success: false };
  const sedeId = resolverSede(session, parsed.data.sedeId);
  const errorSede = await validarSede(tenantDb, session, sedeId);
  if (errorSede) return { error: errorSede, success: false };

  try {
    await tenantDb.gastoRecurrente.update({
      where: { id },
      data: { sedeId, categoriaId, descripcion, montoEstimado, diaDelMes, desde },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "No se pudo guardar la plantilla"), success: false };
  }
  revalidar();
  return { error: null, success: true };
}

export async function toggleGastoRecurrenteActivoAction(id: string): Promise<{ error: string | null }> {
  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const plantilla = await tenantDb.gastoRecurrente.findUnique({ where: { id }, select: { activo: true } });
  if (!plantilla) return { error: "Plantilla no encontrada" };
  try {
    await tenantDb.gastoRecurrente.update({ where: { id }, data: { activo: !plantilla.activo } });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "No se pudo guardar la plantilla") };
  }
  revalidar();
  return { error: null };
}

export async function listRecurrentesPendientes(filtros: { sedeId?: string }): Promise<RecurrentePendiente[]> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const sedeId = resolverSede(session, filtros.sedeId);
  const plantillas = await cargarPlantillasParaPendientes(tenantDb, sedeId);
  return calcularRecurrentesPendientes(plantillas, periodoActualBogota(new Date()));
}

export async function confirmarRecurrenteAction(
  recurrenteId: string,
  periodo: string,
  prevState: RecurrenteFormState,
  formData: FormData,
): Promise<RecurrenteFormState> {
  const session = await requireRole(["ADMIN"]);
  if (!periodoSchema.safeParse(periodo).success) return { error: "Periodo inválido", success: false };
  const parsed = confirmarRecurrenteInputSchema.safeParse({
    monto: formData.get("monto") ?? "",
    fecha: formData.get("fecha") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  const { monto, fecha } = parsed.data;

  const tenantDb = getTenantDb(session.user.tenantSchema);
  const plantilla = await tenantDb.gastoRecurrente.findUnique({ where: { id: recurrenteId } });
  if (!plantilla) return { error: "Plantilla no encontrada", success: false };
  if (periodo > periodoActualBogota(new Date())) return { error: "Ese mes todavía no ha empezado", success: false };
  if (periodo < plantilla.desde) return { error: "La plantilla empieza después de ese mes", success: false };
  if (fecha.slice(0, 7) !== periodo) {
    return { error: `La fecha debe estar dentro de ${ETIQUETA_MES(periodo)}`, success: false };
  }

  try {
    await tenantDb.gasto.create({
      data: {
        sedeId: plantilla.sedeId,
        categoriaId: plantilla.categoriaId,
        descripcion: plantilla.descripcion,
        monto,
        fecha: new Date(`${fecha}T00:00:00.000Z`),
        referencia: null,
        gastoRecurrenteId: recurrenteId,
        periodo,
        registradoPorId: session.user.id,
      },
    });
  } catch (err) {
    if (esP2002(err)) return { error: "Este gasto ya fue confirmado", success: false };
    return { error: friendlyPrismaErrorMessage(err, "No se pudo confirmar el gasto"), success: false };
  }
  revalidar();
  return { error: null, success: true };
}

export async function omitirRecurrenteAction(recurrenteId: string, periodo: string): Promise<{ error: string | null }> {
  const session = await requireRole(["ADMIN"]);
  if (!periodoSchema.safeParse(periodo).success) return { error: "Periodo inválido" };
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const plantilla = await tenantDb.gastoRecurrente.findUnique({ where: { id: recurrenteId } });
  if (!plantilla) return { error: "Plantilla no encontrada" };

  try {
    await tenantDb.gastoRecurrenteOmitido.create({
      data: { gastoRecurrenteId: recurrenteId, periodo, omitidoPorId: session.user.id },
    });
  } catch (err) {
    // Ya omitido: idempotente.
    if (!esP2002(err)) return { error: friendlyPrismaErrorMessage(err, "No se pudo omitir el gasto") };
  }
  revalidar();
  return { error: null };
}
