"use server";

import { revalidatePath } from "next/cache";
import { puede, requirePermiso } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { resultadoDeAccion, type ResultadoAccion } from "@/lib/resultado-accion";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { itemOrdenInputSchema } from "@/lib/validation/orden";
import { assertOrdenMutable } from "@/lib/orden/mutable-guard";
import { scopeOrdenVisible, scopeRepuesto } from "@/lib/sede/scope";
import { resolverIvaPct } from "@/lib/iva/resolver";

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

  const session = await requirePermiso("ordenes.trabajar");
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const orden = await tenantDb.ordenTrabajo.findFirst({
    where: { id: ordenId, ...scopeOrdenVisible(session.user.sedeActivaId, session.user.id, puede(session, "ordenes.verTodas")) },
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
  let ivaPct: number | undefined;

  if (parsed.data.repuestoId) {
    const repuesto = await tenantDb.repuesto.findFirst({
      where: { id: parsed.data.repuestoId, ...scopeRepuesto(session.user.sedeActivaId) },
    });
    if (!repuesto) {
      return { error: "Repuesto no encontrado", success: false };
    }
    descripcion = repuesto.nombre;
    ivaPct = Number(repuesto.ivaPct);
  } else {
    descripcion = parsed.data.descripcion as string;
    // Fuera del catálogo no hay de dónde copiar el IVA: va la tarifa predeterminada.
    const iva = await resolverIvaPct(tenantDb, undefined);
    if (iva.ok) ivaPct = iva.ivaPct;
  }
  const precioUnitario = parsed.data.precioUnitario;

  try {
    await tenantDb.itemOrden.create({
      data: {
        ordenId,
        repuestoId: parsed.data.repuestoId || null,
        descripcion,
        cantidad: parsed.data.cantidad,
        precioUnitario,
        ivaPct,
      },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al agregar el ítem"), success: false };
  }

  revalidatePath(`/ordenes/${ordenId}`);
  return { error: null, success: true };
}

export async function deleteItemOrdenAction(id: string, ordenId: string): Promise<void> {
  const session = await requirePermiso("ordenes.quitar");
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const orden = await tenantDb.ordenTrabajo.findFirst({
    where: { id: ordenId, ...scopeOrdenVisible(session.user.sedeActivaId, session.user.id, puede(session, "ordenes.verTodas")) },
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

export async function deleteItemOrdenFormAction(id: string, ordenId: string): Promise<ResultadoAccion> {
  return resultadoDeAccion(() => deleteItemOrdenAction(id, ordenId), "Error al quitar el ítem");
}

/**
 * Cambia el IVA de una línea de la orden (repuesto o mano de obra) mientras la
 * orden se pueda modificar. Solo acepta tarifas activas, salvo que se deje el
 * mismo porcentaje que ya tenía.
 */
export async function cambiarIvaLineaOrdenAction(
  ordenId: string,
  tipo: "REPUESTO" | "MANO_OBRA",
  lineaId: string,
  ivaPct: number,
): Promise<ResultadoAccion> {
  if (!Number.isFinite(ivaPct) || ivaPct < 0 || ivaPct > 100) {
    return { error: "Porcentaje de IVA inválido", success: false };
  }
  const session = await requirePermiso("ordenes.trabajar");
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const orden = await tenantDb.ordenTrabajo.findFirst({
    where: { id: ordenId, ...scopeOrdenVisible(session.user.sedeActivaId, session.user.id, puede(session, "ordenes.verTodas")) },
    select: { estado: true, factura: { select: { id: true } } },
  });
  if (!orden) return { error: "Orden no encontrada", success: false };
  try {
    assertOrdenMutable(orden);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Orden no modificable", success: false };
  }

  const linea =
    tipo === "REPUESTO"
      ? await tenantDb.itemOrden.findFirst({ where: { id: lineaId, ordenId }, select: { ivaPct: true } })
      : await tenantDb.manoDeObra.findFirst({ where: { id: lineaId, ordenId }, select: { ivaPct: true } });
  if (!linea) return { error: "La línea ya no está en esta orden", success: false };

  const iva = await resolverIvaPct(tenantDb, ivaPct, Number(linea.ivaPct));
  if (!iva.ok) return { error: iva.error, success: false };

  try {
    if (tipo === "REPUESTO") {
      await tenantDb.itemOrden.update({ where: { id: lineaId }, data: { ivaPct: iva.ivaPct } });
    } else {
      await tenantDb.manoDeObra.update({ where: { id: lineaId }, data: { ivaPct: iva.ivaPct } });
    }
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al cambiar el IVA"), success: false };
  }

  revalidatePath(`/ordenes/${ordenId}`);
  return { error: null, success: true };
}
