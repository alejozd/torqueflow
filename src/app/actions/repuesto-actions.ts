"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { repuestoInputSchema } from "@/lib/validation/inventario";
import type { Prisma } from "@/generated/prisma-tenant";

export interface RepuestoFormState {
  error: string | null;
  success: boolean;
}

const REPUESTO_DETAIL_INCLUDE = {
  bodega: true,
  proveedor: true,
} satisfies Prisma.RepuestoInclude;

export type RepuestoWithDetalle = Prisma.RepuestoGetPayload<{ include: typeof REPUESTO_DETAIL_INCLUDE }>;

export interface RepuestoOption {
  id: string;
  codigo: string;
  nombre: string;
}

const stockInicialSchema = z.coerce.number().int().min(0, "El stock inicial no puede ser negativo");

function parseRepuestoFormData(formData: FormData) {
  return repuestoInputSchema.safeParse({
    codigo: formData.get("codigo") ?? "",
    nombre: formData.get("nombre") ?? "",
    descripcion: formData.get("descripcion") ?? "",
    precioCompra: formData.get("precioCompra"),
    precioVenta: formData.get("precioVenta"),
    stockMinimo: formData.get("stockMinimo"),
    bodegaId: formData.get("bodegaId") ?? "",
    proveedorId: formData.get("proveedorId") ?? "",
  });
}

export async function listRepuestos(): Promise<RepuestoWithDetalle[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.repuesto.findMany({ include: REPUESTO_DETAIL_INCLUDE, orderBy: { nombre: "asc" } });
}

export async function listRepuestoOptions(): Promise<RepuestoOption[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.repuesto.findMany({
    select: { id: true, codigo: true, nombre: true },
    orderBy: { nombre: "asc" },
  });
}

export async function getRepuesto(id: string): Promise<RepuestoWithDetalle | null> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.repuesto.findUnique({ where: { id }, include: REPUESTO_DETAIL_INCLUDE });
}

export async function createRepuestoAction(
  prevState: RepuestoFormState,
  formData: FormData,
): Promise<RepuestoFormState> {
  const parsed = parseRepuestoFormData(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const parsedStock = stockInicialSchema.safeParse(formData.get("stockActual"));
  if (!parsedStock.success) {
    return { error: parsedStock.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  try {
    await tenantDb.repuesto.create({
      data: {
        codigo: parsed.data.codigo,
        nombre: parsed.data.nombre,
        descripcion: parsed.data.descripcion || null,
        precioCompra: parsed.data.precioCompra,
        precioVenta: parsed.data.precioVenta,
        stockActual: parsedStock.data,
        stockMinimo: parsed.data.stockMinimo,
        bodegaId: parsed.data.bodegaId,
        proveedorId: parsed.data.proveedorId || null,
      },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al crear el repuesto"), success: false };
  }

  revalidatePath("/repuestos");
  return { error: null, success: true };
}

export async function updateRepuestoAction(
  id: string,
  prevState: RepuestoFormState,
  formData: FormData,
): Promise<RepuestoFormState> {
  const parsed = parseRepuestoFormData(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  try {
    await tenantDb.repuesto.update({
      where: { id },
      data: {
        codigo: parsed.data.codigo,
        nombre: parsed.data.nombre,
        descripcion: parsed.data.descripcion || null,
        precioCompra: parsed.data.precioCompra,
        precioVenta: parsed.data.precioVenta,
        stockMinimo: parsed.data.stockMinimo,
        bodegaId: parsed.data.bodegaId,
        proveedorId: parsed.data.proveedorId || null,
      },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al actualizar el repuesto"), success: false };
  }

  revalidatePath("/repuestos");
  return { error: null, success: true };
}

export async function deleteRepuestoAction(id: string): Promise<void> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  try {
    await tenantDb.repuesto.delete({ where: { id } });
  } catch (err) {
    throw new Error(friendlyPrismaErrorMessage(err, "Error al eliminar el repuesto"));
  }
  revalidatePath("/repuestos");
}
