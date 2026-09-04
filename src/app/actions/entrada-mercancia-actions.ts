"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { entradaMercanciaInputSchema, entradaMercanciaItemInputSchema } from "@/lib/validation/inventario";
import { scopeBodega, scopeEntrada, scopeRepuesto } from "@/lib/sede/scope";
import type { Prisma } from "@/generated/prisma-tenant";

export interface EntradaFormState {
  error: string | null;
  success: boolean;
  entradaId: string | null;
}

const BODEGA_AJENA = "La bodega seleccionada no pertenece a tu sede activa.";

const ENTRADA_DETAIL_INCLUDE = {
  proveedor: true,
  bodega: true,
  creadoPor: { select: { id: true, nombre: true } },
  items: { include: { repuesto: true } },
} satisfies Prisma.EntradaMercanciaInclude;

export type EntradaWithDetalle = Prisma.EntradaMercanciaGetPayload<{ include: typeof ENTRADA_DETAIL_INCLUDE }>;

export async function listEntradas(): Promise<EntradaWithDetalle[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.entradaMercancia.findMany({
    where: { ...scopeEntrada(session.user.sedeActivaId) },
    include: ENTRADA_DETAIL_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

export async function getEntrada(id: string): Promise<EntradaWithDetalle | null> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.entradaMercancia.findFirst({
    where: { id, ...scopeEntrada(session.user.sedeActivaId) },
    include: ENTRADA_DETAIL_INCLUDE,
  });
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
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false, entradaId: null };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const bodega = await tenantDb.bodega.findFirst({
    where: { id: parsed.data.bodegaId, ...scopeBodega(session.user.sedeActivaId) },
    select: { id: true },
  });
  if (!bodega) {
    return { error: BODEGA_AJENA, success: false, entradaId: null };
  }

  let entrada: { id: string };
  try {
    entrada = await tenantDb.entradaMercancia.create({
      data: {
        proveedorId: parsed.data.proveedorId,
        bodegaId: parsed.data.bodegaId,
        creadoPorId: session.user.id,
      },
    });
  } catch (err) {
    return {
      error: friendlyPrismaErrorMessage(err, "Error al crear la entrada de mercancía"),
      success: false,
      entradaId: null,
    };
  }

  revalidatePath("/entradas-mercancia");
  return { error: null, success: true, entradaId: entrada.id };
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
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false, entradaId };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const [entrada, repuesto] = await Promise.all([
    tenantDb.entradaMercancia.findFirst({
      where: { id: entradaId, ...scopeEntrada(session.user.sedeActivaId) },
      select: { bodegaId: true },
    }),
    tenantDb.repuesto.findFirst({
      where: { id: parsed.data.repuestoId, ...scopeRepuesto(session.user.sedeActivaId) },
      select: { bodegaId: true },
    }),
  ]);

  if (!entrada) {
    return { error: "Entrada no encontrada", success: false, entradaId };
  }
  if (!repuesto) {
    return { error: "Repuesto no encontrado", success: false, entradaId };
  }
  if (repuesto.bodegaId !== entrada.bodegaId) {
    return { error: "El repuesto no pertenece a la bodega de esta entrada", success: false, entradaId };
  }

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
    return {
      error: friendlyPrismaErrorMessage(err, "Error al registrar el ítem recibido"),
      success: false,
      entradaId,
    };
  }

  revalidatePath(`/entradas-mercancia/${entradaId}`);
  revalidatePath("/repuestos");
  return { error: null, success: true, entradaId };
}
