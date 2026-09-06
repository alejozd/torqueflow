"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { registrarSeguimientoInputSchema } from "@/lib/validation/cotizacion-seguimiento";
import { scopeCotizacion } from "@/lib/sede/scope";

export interface SeguimientoCotizacionFormState {
  error: string | null;
  success: boolean;
}

// Same role tier as agregarItemCotizacionAction (src/app/actions/cotizacion-actions.ts):
// logging a follow-up is a day-to-day operational action, not restricted to
// ADMIN/RECEPCION the way descuento/envío/decisión mutations are.
export async function registrarSeguimientoAction(
  cotizacionId: string,
  prevState: SeguimientoCotizacionFormState,
  formData: FormData,
): Promise<SeguimientoCotizacionFormState> {
  const parsed = registrarSeguimientoInputSchema.safeParse({
    tipo: formData.get("tipo"),
    fecha: formData.get("fecha"),
    resultado: formData.get("resultado") ?? "",
    proximoSeguimiento: formData.get("proximoSeguimiento") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION", "TECNICO"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  // findFirst, not findUnique: same IDOR boundary as every other cotización
  // mutation -- an id from another sede must not resolve.
  const cotizacion = await tenantDb.cotizacion.findFirst({
    where: { id: cotizacionId, ...scopeCotizacion(session.user.sedeActivaId) },
    select: { id: true },
  });
  if (!cotizacion) {
    return { error: "Cotización no encontrada", success: false };
  }

  try {
    await tenantDb.cotizacionSeguimiento.create({
      data: {
        cotizacionId,
        tipo: parsed.data.tipo,
        fecha: parsed.data.fecha,
        resultado: parsed.data.resultado,
        proximoSeguimiento: parsed.data.proximoSeguimiento ?? null,
        creadoPorId: session.user.id,
      },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al registrar el seguimiento"), success: false };
  }

  revalidatePath(`/cotizaciones/${cotizacionId}`);
  revalidatePath("/cotizaciones");
  return { error: null, success: true };
}
