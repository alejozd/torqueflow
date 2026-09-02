"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { repuestoInputSchema, repuestoStockInicialSchema as stockInicialSchema } from "@/lib/validation/inventario";
import { scopeBodega, scopeRepuesto } from "@/lib/sede/scope";
import type { Prisma } from "@/generated/prisma-tenant";

export interface RepuestoFormState {
  error: string | null;
  success: boolean;
  repuestoId: string | null;
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
  precioVenta: number;
}

const BODEGA_AJENA = "La bodega seleccionada no pertenece a tu sede activa.";
const REPUESTO_NO_ENCONTRADO = "Repuesto no encontrado en tu sede activa.";

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
  return tenantDb.repuesto.findMany({
    where: { ...scopeRepuesto(session.user.sedeActivaId) },
    include: REPUESTO_DETAIL_INCLUDE,
    orderBy: { nombre: "asc" },
  });
}

export async function listRepuestoOptions(bodegaId?: string): Promise<RepuestoOption[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const rows = await tenantDb.repuesto.findMany({
    where: {
      ...(bodegaId ? { bodegaId } : {}),
      ...scopeRepuesto(session.user.sedeActivaId),
    },
    select: { id: true, codigo: true, nombre: true, precioVenta: true },
    orderBy: { nombre: "asc" },
  });
  return rows.map((row) => ({ ...row, precioVenta: Number(row.precioVenta) }));
}

export async function getRepuesto(id: string): Promise<RepuestoWithDetalle | null> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.repuesto.findFirst({
    where: { id, ...scopeRepuesto(session.user.sedeActivaId) },
    include: REPUESTO_DETAIL_INCLUDE,
  });
}

export async function createRepuestoAction(
  prevState: RepuestoFormState,
  formData: FormData,
): Promise<RepuestoFormState> {
  const parsed = parseRepuestoFormData(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false, repuestoId: null };
  }

  const parsedStock = stockInicialSchema.safeParse(formData.get("stockActual"));
  if (!parsedStock.success) {
    return { error: parsedStock.error.issues[0]?.message ?? "Datos inválidos", success: false, repuestoId: null };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const bodega = await tenantDb.bodega.findFirst({
    where: { id: parsed.data.bodegaId, ...scopeBodega(session.user.sedeActivaId) },
    select: { id: true },
  });
  if (!bodega) {
    return { error: BODEGA_AJENA, success: false, repuestoId: null };
  }

  let creado: { id: string };
  try {
    creado = await tenantDb.repuesto.create({
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
    return { error: friendlyPrismaErrorMessage(err, "Error al crear el repuesto"), success: false, repuestoId: null };
  }

  revalidatePath("/repuestos");
  return { error: null, success: true, repuestoId: creado.id };
}

export async function updateRepuestoAction(
  id: string,
  prevState: RepuestoFormState,
  formData: FormData,
): Promise<RepuestoFormState> {
  const parsed = parseRepuestoFormData(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false, repuestoId: null };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const bodega = await tenantDb.bodega.findFirst({
    where: { id: parsed.data.bodegaId, ...scopeBodega(session.user.sedeActivaId) },
    select: { id: true },
  });
  if (!bodega) {
    return { error: BODEGA_AJENA, success: false, repuestoId: null };
  }

  try {
    const { count } = await tenantDb.repuesto.updateMany({
      where: { id, ...scopeRepuesto(session.user.sedeActivaId) },
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
    if (count === 0) {
      return { error: REPUESTO_NO_ENCONTRADO, success: false, repuestoId: null };
    }
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al actualizar el repuesto"), success: false, repuestoId: null };
  }

  revalidatePath("/repuestos");
  return { error: null, success: true, repuestoId: null };
}

export async function deleteRepuestoAction(id: string): Promise<void> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  let count: number;
  try {
    ({ count } = await tenantDb.repuesto.deleteMany({
      where: { id, ...scopeRepuesto(session.user.sedeActivaId) },
    }));
  } catch (err) {
    throw new Error(friendlyPrismaErrorMessage(err, "Error al eliminar el repuesto"));
  }
  if (count === 0) {
    throw new Error(REPUESTO_NO_ENCONTRADO);
  }
  revalidatePath("/repuestos");
}

/**
 * useActionState-compatible wrapper for deleteRepuestoAction, which throws
 * both on a wrong-sede id and on any underlying Prisma error -- same adapter
 * shape as deleteSedeFormAction/deleteBodegaFormAction.
 */
export async function deleteRepuestoFormAction(
  id: string,
  prevState: RepuestoFormState,
): Promise<RepuestoFormState> {
  try {
    await deleteRepuestoAction(id);
  } catch (err) {
    if (typeof (err as { digest?: unknown })?.digest === "string" && (err as { digest: string }).digest.startsWith("NEXT_")) {
      throw err;
    }
    return { error: err instanceof Error ? err.message : "Error al eliminar el repuesto", success: false, repuestoId: null };
  }
  return { error: null, success: true, repuestoId: null };
}
