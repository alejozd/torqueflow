"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { categoriaGastoInputSchema } from "@/lib/validation/gasto";

export interface CategoriaGastoVista {
  id: string;
  nombre: string;
  activo: boolean;
  orden: number;
}

export interface CategoriaGastoFormState {
  error: string | null;
  success: boolean;
}

const MENSAJE_DUPLICADO = "Ya existe una categoría con ese nombre";

function mensajeError(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "code" in err && (err as { code?: unknown }).code === "P2002") {
    return MENSAJE_DUPLICADO;
  }
  return friendlyPrismaErrorMessage(err, fallback);
}

function revalidar() {
  revalidatePath("/gastos");
  revalidatePath("/gastos/configuracion");
}

export async function listCategoriasGasto(opciones: { soloActivas?: boolean } = {}): Promise<CategoriaGastoVista[]> {
  const session = await requireRole(opciones.soloActivas ? ["ADMIN", "RECEPCION"] : ["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const filas = await tenantDb.categoriaGasto.findMany({
    where: opciones.soloActivas ? { activo: true } : {},
    orderBy: { orden: "asc" },
  });
  return filas.map(({ id, nombre, activo, orden }) => ({ id, nombre, activo, orden }));
}

export async function crearCategoriaGastoAction(
  prevState: CategoriaGastoFormState,
  formData: FormData,
): Promise<CategoriaGastoFormState> {
  const session = await requireRole(["ADMIN"]);
  const parsed = categoriaGastoInputSchema.safeParse({ nombre: formData.get("nombre") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };

  const tenantDb = getTenantDb(session.user.tenantSchema);
  try {
    const { _max } = await tenantDb.categoriaGasto.aggregate({ _max: { orden: true } });
    await tenantDb.categoriaGasto.create({ data: { nombre: parsed.data.nombre, orden: (_max.orden ?? -1) + 1 } });
  } catch (err) {
    return { error: mensajeError(err, "No se pudo crear la categoría"), success: false };
  }
  revalidar();
  return { error: null, success: true };
}

export async function renombrarCategoriaGastoAction(
  categoriaId: string,
  prevState: CategoriaGastoFormState,
  formData: FormData,
): Promise<CategoriaGastoFormState> {
  const session = await requireRole(["ADMIN"]);
  const parsed = categoriaGastoInputSchema.safeParse({ nombre: formData.get("nombre") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };

  const tenantDb = getTenantDb(session.user.tenantSchema);
  try {
    await tenantDb.categoriaGasto.update({ where: { id: categoriaId }, data: { nombre: parsed.data.nombre } });
  } catch (err) {
    return { error: mensajeError(err, "No se pudo renombrar la categoría"), success: false };
  }
  revalidar();
  return { error: null, success: true };
}

export async function toggleCategoriaGastoActivaAction(categoriaId: string): Promise<{ error: string | null }> {
  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const categoria = await tenantDb.categoriaGasto.findUnique({ where: { id: categoriaId } });
  if (!categoria) return { error: "Categoría no encontrada" };
  try {
    await tenantDb.categoriaGasto.update({ where: { id: categoriaId }, data: { activo: !categoria.activo } });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "No se pudo actualizar la categoría") };
  }
  revalidar();
  return { error: null };
}
