"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { pagoInputSchema } from "@/lib/validation/factura";

export interface PagoFormState {
  error: string | null;
  success: boolean;
}

const SALDO_INSUFICIENTE = "SALDO_INSUFICIENTE";

export async function registrarPagoAction(
  facturaId: string,
  prevState: PagoFormState,
  formData: FormData,
): Promise<PagoFormState> {
  const parsed = pagoInputSchema.safeParse({
    monto: formData.get("monto"),
    metodoPago: formData.get("metodoPago") ?? "",
    referencia: formData.get("referencia") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const factura = await tenantDb.factura.findUnique({ where: { id: facturaId }, select: { id: true } });
  if (!factura) {
    return { error: "Factura no encontrada", success: false };
  }

  try {
    await tenantDb.$transaction(async (tx) => {
      const { count } = await tx.factura.updateMany({
        where: { id: facturaId, saldoPendiente: { gte: parsed.data.monto } },
        data: { saldoPendiente: { decrement: parsed.data.monto } },
      });
      if (count === 0) {
        throw new Error(SALDO_INSUFICIENTE);
      }

      await tx.pago.create({
        data: {
          facturaId,
          monto: parsed.data.monto,
          metodoPago: parsed.data.metodoPago,
          referencia: parsed.data.referencia || null,
          registradoPorId: session.user.id,
        },
      });

      const actualizada = await tx.factura.findUniqueOrThrow({ where: { id: facturaId } });
      if (Number(actualizada.saldoPendiente) <= 0) {
        await tx.factura.update({ where: { id: facturaId }, data: { estado: "PAGADA" } });
      }
    });
  } catch (err) {
    if (err instanceof Error && err.message === SALDO_INSUFICIENTE) {
      return { error: "El monto no puede ser mayor al saldo pendiente", success: false };
    }
    return { error: friendlyPrismaErrorMessage(err, "Error al registrar el pago"), success: false };
  }

  revalidatePath(`/facturas/${facturaId}`);
  revalidatePath("/facturas");
  return { error: null, success: true };
}
