"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { itemOrdenInputSchema } from "@/lib/validation/orden";
import { assertOrdenMutable } from "@/lib/orden/mutable-guard";
import { scopeOrden, scopeRepuesto } from "@/lib/sede/scope";

export interface ItemOrdenFormState {
  error: string | null;
  success: boolean;
}

export async function addItemOrdenAction(
  ordenId: string,
  prevState: ItemOrdenFormState,
  formData: FormData,
): Promise<ItemOrdenFormState> {
  const parsed = itemOrdenInputSchema.safeParse({
    repuestoId: formData.get("repuestoId") ?? "",
    descripcion: formData.get("descripcion") ?? "",
    cantidad: formData.get("cantidad"),
    precioUnitario: formData.get("precioUnitario") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION", "TECNICO"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const orden = await tenantDb.ordenTrabajo.findFirst({
    where: { id: ordenId, ...scopeOrden(session.user.sedeActivaId) },
    select: { estado: true, factura: { select: { id: true } } },
  });
  if (!orden) {
    return { error: "Orden no encontrada", success: false };
  }
  try {
    assertOrdenMutable(orden);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Orden no modificable", success: false };
  }

  let descripcion: string;
  let precioUnitario: number;

  if (parsed.data.repuestoId) {
    const repuesto = await tenantDb.repuesto.findFirst({
      where: { id: parsed.data.repuestoId, ...scopeRepuesto(session.user.sedeActivaId) },
    });
    if (!repuesto) {
      return { error: "Repuesto no encontrado", success: false };
    }
    descripcion = repuesto.nombre;
    precioUnitario = Number(repuesto.precioVenta);
  } else {
    descripcion = parsed.data.descripcion as string;
    precioUnitario = parsed.data.precioUnitario as number;
  }

  try {
    await tenantDb.itemOrden.create({
      data: {
        ordenId,
        repuestoId: parsed.data.repuestoId || null,
        descripcion,
        cantidad: parsed.data.cantidad,
        precioUnitario,
      },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al agregar el ítem"), success: false };
  }

  revalidatePath(`/ordenes/${ordenId}`);
  return { error: null, success: true };
}

export async function deleteItemOrdenAction(id: string, ordenId: string): Promise<void> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const orden = await tenantDb.ordenTrabajo.findFirst({
    where: { id: ordenId, ...scopeOrden(session.user.sedeActivaId) },
    select: { estado: true, factura: { select: { id: true } } },
  });
  if (!orden) {
    throw new Error("Orden no encontrada");
  }
  assertOrdenMutable(orden);

  try {
    const { count } = await tenantDb.itemOrden.deleteMany({ where: { id, ordenId } });
    if (count === 0) {
      throw new Error("Ítem no encontrado en esta orden");
    }
  } catch (err) {
    if (err instanceof Error && err.message === "Ítem no encontrado en esta orden") {
      throw err;
    }
    throw new Error(friendlyPrismaErrorMessage(err, "Error al eliminar el ítem"));
  }
  revalidatePath(`/ordenes/${ordenId}`);
}
