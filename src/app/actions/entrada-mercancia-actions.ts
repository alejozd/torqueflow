"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { entradaMercanciaInputSchema, entradaMercanciaItemInputSchema } from "@/lib/validation/inventario";
import type { Prisma } from "@/generated/prisma-tenant";

export interface EntradaFormState {
  error: string | null;
  success: boolean;
}

const ENTRADA_DETAIL_INCLUDE = {
  proveedor: true,
  bodega: true,
  items: { include: { repuesto: true } },
} satisfies Prisma.EntradaMercanciaInclude;

export type EntradaWithDetalle = Prisma.EntradaMercanciaGetPayload<{ include: typeof ENTRADA_DETAIL_INCLUDE }>;

export async function listEntradas(): Promise<EntradaWithDetalle[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.entradaMercancia.findMany({ include: ENTRADA_DETAIL_INCLUDE, orderBy: { createdAt: "desc" } });
}

export async function getEntrada(id: string): Promise<EntradaWithDetalle | null> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.entradaMercancia.findUnique({ where: { id }, include: ENTRADA_DETAIL_INCLUDE });
}

export async function createEntradaMercanciaAction(
  prevState: EntradaFormState,
  formData: FormData,
): Promise<EntradaFormState> {
  const parsed = entradaMercanciaInputSchema.safeParse({
    proveedorId: formData.get("proveedorId") ?? "",
    bodegaId: formData.get("bodegaId") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  try {
    await tenantDb.entradaMercancia.create({
      data: {
        proveedorId: parsed.data.proveedorId,
        bodegaId: parsed.data.bodegaId,
        creadoPorId: session.user.id,
      },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al crear la entrada de mercancía"), success: false };
  }

  revalidatePath("/entradas-mercancia");
  return { error: null, success: true };
}

export async function addEntradaItemAction(
  entradaId: string,
  prevState: EntradaFormState,
  formData: FormData,
): Promise<EntradaFormState> {
  const parsed = entradaMercanciaItemInputSchema.safeParse({
    repuestoId: formData.get("repuestoId") ?? "",
    cantidad: formData.get("cantidad"),
    precioCompraUnitario: formData.get("precioCompraUnitario"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  try {
    await tenantDb.$transaction([
      tenantDb.entradaMercanciaItem.create({
        data: {
          entradaId,
          repuestoId: parsed.data.repuestoId,
          cantidad: parsed.data.cantidad,
          precioCompraUnitario: parsed.data.precioCompraUnitario,
        },
      }),
      tenantDb.repuesto.update({
        where: { id: parsed.data.repuestoId },
        data: { stockActual: { increment: parsed.data.cantidad } },
      }),
    ]);
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al registrar el ítem recibido"), success: false };
  }

  revalidatePath(`/entradas-mercancia/${entradaId}`);
  revalidatePath("/repuestos");
  return { error: null, success: true };
}
