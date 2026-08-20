"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { ordenTrabajoInputSchema } from "@/lib/validation/orden";
import type { EstadoOrden, OrdenTrabajo, Prisma, Usuario } from "@/generated/prisma-tenant";

export interface OrdenFormState {
  error: string | null;
  success: boolean;
}

const ORDEN_DETAIL_INCLUDE = {
  cliente: true,
  vehiculo: true,
  sede: true,
  mecanico: true,
  items: true,
  manoDeObra: true,
} satisfies Prisma.OrdenTrabajoInclude;

export type OrdenWithDetalle = Prisma.OrdenTrabajoGetPayload<{ include: typeof ORDEN_DETAIL_INCLUDE }>;

export async function listOrdenes(estado?: EstadoOrden): Promise<OrdenWithDetalle[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.ordenTrabajo.findMany({
    where: estado ? { estado } : undefined,
    include: ORDEN_DETAIL_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

export async function listOrdenesByVehiculo(vehiculoId: string): Promise<OrdenTrabajo[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.ordenTrabajo.findMany({ where: { vehiculoId }, orderBy: { createdAt: "desc" } });
}

export async function getOrden(id: string): Promise<OrdenWithDetalle | null> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.ordenTrabajo.findUnique({ where: { id }, include: ORDEN_DETAIL_INCLUDE });
}

export async function listTecnicos(): Promise<Usuario[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.usuario.findMany({ where: { role: "TECNICO" }, orderBy: { nombre: "asc" } });
}

export async function createOrdenAction(
  clienteId: string,
  vehiculoId: string,
  prevState: OrdenFormState,
  formData: FormData,
): Promise<OrdenFormState> {
  const parsed = ordenTrabajoInputSchema.safeParse({
    mecanicoId: formData.get("mecanicoId") ?? "",
    kilometrajeIngreso: formData.get("kilometrajeIngreso") || undefined,
    sintomas: formData.get("sintomas") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const sede = await tenantDb.sede.findFirst({ orderBy: { createdAt: "asc" } });
  if (!sede) {
    return { error: "No hay una sede configurada para este taller.", success: false };
  }

  try {
    await tenantDb.ordenTrabajo.create({
      data: {
        clienteId,
        vehiculoId,
        sedeId: sede.id,
        creadoPorId: session.user.id,
        mecanicoId: parsed.data.mecanicoId || null,
        kilometrajeIngreso: parsed.data.kilometrajeIngreso,
        sintomas: parsed.data.sintomas || null,
      },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al crear la orden"), success: false };
  }

  revalidatePath(`/vehiculos/${vehiculoId}`);
  return { error: null, success: true };
}
