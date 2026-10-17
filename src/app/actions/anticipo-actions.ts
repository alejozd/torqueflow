"use server";

import { revalidatePath } from "next/cache";
import { requirePermiso, requireSession } from "@/lib/auth/guards";
import { exigirCajaParaEfectivo } from "@/lib/caja/sesion";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { anticipoInputSchema, devolverAnticipoInputSchema } from "@/lib/validation/caja";
import { scopeOrden } from "@/lib/sede/scope";
import type { EstadoAnticipo, MetodoPago } from "@/generated/prisma-tenant";

export interface AnticipoFormState {
  error: string | null;
  success: boolean;
}

export interface AnticipoFila {
  id: string;
  monto: number;
  metodoPago: MetodoPago;
  referencia: string | null;
  estado: EstadoAnticipo;
  createdAt: Date;
  registradoPorNombre: string;
}

export async function listAnticiposDeOrden(ordenId: string): Promise<AnticipoFila[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const anticipos = await tenantDb.anticipo.findMany({
    where: { ordenId, orden: scopeOrden(session.user.sedeActivaId) },
    include: { registradoPor: { select: { nombre: true } } },
    orderBy: { createdAt: "asc" },
  });
  return anticipos.map((a) => ({
    id: a.id,
    monto: Number(a.monto),
    metodoPago: a.metodoPago,
    referencia: a.referencia,
    estado: a.estado,
    createdAt: a.createdAt,
    registradoPorNombre: a.registradoPor.nombre,
  }));
}

export async function registrarAnticipoAction(
  ordenId: string,
  prevState: AnticipoFormState,
  formData: FormData,
): Promise<AnticipoFormState> {
  const session = await requirePermiso("anticipos.registrar");
  const parsed = anticipoInputSchema.safeParse({
    monto: formData.get("monto") ?? "",
    metodoPago: formData.get("metodoPago") ?? "",
    referencia: formData.get("referencia") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };

  const tenantDb = getTenantDb(session.user.tenantSchema);
  const orden = await tenantDb.ordenTrabajo.findFirst({
    where: { id: ordenId, ...scopeOrden(session.user.sedeActivaId) },
    select: { id: true, sedeId: true, estado: true, factura: { select: { id: true } } },
  });
  if (!orden) return { error: "Orden no encontrada", success: false };
  if (orden.factura) return { error: "La orden ya está facturada", success: false };
  if (orden.estado === "ANULADA") {
    return { error: "No se pueden registrar anticipos en una orden anulada", success: false };
  }

  // Un anticipo en efectivo entra al cajón (fase de consolidación, D3).
  const errorCaja = await exigirCajaParaEfectivo(
    tenantDb,
    orden.sedeId,
    parsed.data.metodoPago,
    "Abre la caja antes de registrar el anticipo",
  );
  if (errorCaja) return { error: errorCaja, success: false };

  try {
    await tenantDb.anticipo.create({
      data: {
        ordenId,
        sedeId: orden.sedeId,
        monto: parsed.data.monto,
        metodoPago: parsed.data.metodoPago,
        referencia: parsed.data.referencia ?? null,
        registradoPorId: session.user.id,
      },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al registrar el anticipo"), success: false };
  }

  revalidatePath(`/ordenes/${ordenId}`);
  return { error: null, success: true };
}

export async function devolverAnticipoAction(
  anticipoId: string,
  prevState: AnticipoFormState,
  formData: FormData,
): Promise<AnticipoFormState> {
  const session = await requirePermiso("anticipos.devolver");
  const parsed = devolverAnticipoInputSchema.safeParse({ metodoDevolucion: formData.get("metodoDevolucion") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };

  const tenantDb = getTenantDb(session.user.tenantSchema);
  const anticipo = await tenantDb.anticipo.findFirst({
    where: { id: anticipoId, orden: scopeOrden(session.user.sedeActivaId) },
    select: { id: true, ordenId: true },
  });
  if (!anticipo) return { error: "Anticipo no encontrado", success: false };

  // Devolverlo en efectivo saca dinero del cajón: misma regla que el cobro.
  const errorCaja = await exigirCajaParaEfectivo(
    tenantDb,
    session.user.sedeActivaId,
    parsed.data.metodoDevolucion,
    "Abre la caja antes de devolver el anticipo",
  );
  if (errorCaja) return { error: errorCaja, success: false };

  try {
    // Conditional update: a concurrent invoice that applied it wins.
    const { count } = await tenantDb.anticipo.updateMany({
      where: { id: anticipoId, estado: "PENDIENTE" },
      data: {
        estado: "DEVUELTO",
        devueltoAt: new Date(),
        devueltoPorId: session.user.id,
        metodoDevolucion: parsed.data.metodoDevolucion,
      },
    });
    if (count === 0) return { error: "Este anticipo ya fue aplicado o devuelto", success: false };
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al devolver el anticipo"), success: false };
  }

  revalidatePath(`/ordenes/${anticipo.ordenId}`);
  return { error: null, success: true };
}
