"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { proveedorInputSchema } from "@/lib/validation/inventario";
import type { Proveedor, Prisma } from "@/generated/prisma-tenant";

export interface ProveedorFormState {
  error: string | null;
  success: boolean;
}

const PROVEEDOR_INVENTARIO_INCLUDE = {
  repuestos: { select: { id: true } },
  entradas: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
} satisfies Prisma.ProveedorInclude;

export type ProveedorConInventario = Prisma.ProveedorGetPayload<{ include: typeof PROVEEDOR_INVENTARIO_INCLUDE }>;

function parseProveedorFormData(formData: FormData) {
  return proveedorInputSchema.safeParse({
    nombre: formData.get("nombre") ?? "",
    contacto: formData.get("contacto") ?? "",
    telefono: formData.get("telefono") ?? "",
    email: formData.get("email") ?? "",
  });
}

export async function listProveedores(): Promise<Proveedor[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.proveedor.findMany({ orderBy: { nombre: "asc" } });
}

/**
 * Same rows as listProveedores, plus each proveedor's repuestos (for the
 * Referencias count) and its single most recent entrada (for "Última
 * entrada"). Proveedor has no sedeId -- it is shared across the whole tenant,
 * same as listProveedores.
 */
export async function listProveedoresConInventario(): Promise<ProveedorConInventario[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.proveedor.findMany({
    include: PROVEEDOR_INVENTARIO_INCLUDE,
    orderBy: { nombre: "asc" },
  });
}

export async function getProveedor(id: string): Promise<Proveedor | null> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.proveedor.findUnique({ where: { id } });
}

export async function createProveedorAction(
  prevState: ProveedorFormState,
  formData: FormData,
): Promise<ProveedorFormState> {
  const parsed = parseProveedorFormData(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  try {
    await tenantDb.proveedor.create({
      data: {
        nombre: parsed.data.nombre,
        contacto: parsed.data.contacto || null,
        telefono: parsed.data.telefono || null,
        email: parsed.data.email || null,
      },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al crear el proveedor"), success: false };
  }

  revalidatePath("/proveedores");
  return { error: null, success: true };
}

export async function updateProveedorAction(
  id: string,
  prevState: ProveedorFormState,
  formData: FormData,
): Promise<ProveedorFormState> {
  const parsed = parseProveedorFormData(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  try {
    await tenantDb.proveedor.update({
      where: { id },
      data: {
        nombre: parsed.data.nombre,
        contacto: parsed.data.contacto || null,
        telefono: parsed.data.telefono || null,
        email: parsed.data.email || null,
      },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al actualizar el proveedor"), success: false };
  }

  revalidatePath("/proveedores");
  return { error: null, success: true };
}

export async function deleteProveedorAction(id: string): Promise<void> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  try {
    await tenantDb.proveedor.delete({ where: { id } });
  } catch (err) {
    throw new Error(friendlyPrismaErrorMessage(err, "Error al eliminar el proveedor"));
  }
  revalidatePath("/proveedores");
}

/**
 * useActionState-compatible wrapper for deleteProveedorAction, which throws
 * on any underlying Prisma error -- same adapter shape as
 * deleteSedeFormAction/deleteBodegaFormAction.
 */
export async function deleteProveedorFormAction(
  id: string,
  prevState: ProveedorFormState,
): Promise<ProveedorFormState> {
  try {
    await deleteProveedorAction(id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al eliminar el proveedor", success: false };
  }
  return { error: null, success: true };
}
