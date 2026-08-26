"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { clienteInputSchema } from "@/lib/validation/cliente";
import type { Prisma } from "@/generated/prisma-tenant";

export interface ClienteFormState {
  error: string | null;
  success: boolean;
}

function parseClienteFormData(formData: FormData) {
  return clienteInputSchema.safeParse({
    nombre: formData.get("nombre"),
    telefono: formData.get("telefono"),
    email: formData.get("email"),
    documento: formData.get("documento"),
  });
}

const CLIENTE_CON_RESUMEN_INCLUDE = {
  vehiculos: true,
  // updatedAt-only: enough to derive "última visita" without pulling every
  // orden field for a list page.
  ordenes: { select: { updatedAt: true } },
  // Only PENDIENTE facturas -- "Saldo" is what the cliente still owes, so a
  // PAGADA factura's (zero) saldoPendiente would only pad the query for
  // nothing the column shows.
  facturas: { where: { estado: "PENDIENTE" }, select: { saldoPendiente: true } },
} satisfies Prisma.ClienteInclude;

export type ClienteConResumen = Prisma.ClienteGetPayload<{ include: typeof CLIENTE_CON_RESUMEN_INCLUDE }>;

export async function listClientes(): Promise<ClienteConResumen[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.cliente.findMany({ orderBy: { nombre: "asc" }, include: CLIENTE_CON_RESUMEN_INCLUDE });
}

export interface ClienteParaOrden {
  id: string;
  nombre: string;
  vehiculos: { id: string; placa: string; marca: string; modelo: string }[];
}

/**
 * Feeds /ordenes' "Nueva orden" cliente->vehículo cascading select: a client
 * picks a cliente, the vehículo options narrow to that cliente's own
 * vehiculos, all without a second round-trip. Deliberately not sede-scoped --
 * same reasoning as listVehiculosParaCita: clientes/vehiculos are tenant-wide.
 */
export async function listClientesParaOrden(): Promise<ClienteParaOrden[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.cliente.findMany({
    orderBy: { nombre: "asc" },
    select: {
      id: true,
      nombre: true,
      vehiculos: {
        select: { id: true, placa: true, marca: true, modelo: true },
        orderBy: { placa: "asc" },
      },
    },
  });
}

// Fase 11-14: the detail page's vehicle cards need per-vehicle estado/kilometraje,
// its historial de servicio table needs one row per orden, and its resumen
// financiero needs both the total invoiced and the still-pending balance --
// all derived client-side in the page from this single fetch.
const CLIENTE_DETALLE_INCLUDE = {
  vehiculos: true,
  ordenes: {
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      estado: true,
      vehiculoId: true,
      kilometrajeIngreso: true,
      sintomas: true,
      createdAt: true,
      // Only a ya-facturada orden has a committed total; an orden still in
      // progress has none to show yet.
      factura: { select: { total: true } },
    },
  },
  facturas: { select: { total: true, saldoPendiente: true, estado: true } },
} satisfies Prisma.ClienteInclude;

export type ClienteDetalle = Prisma.ClienteGetPayload<{ include: typeof CLIENTE_DETALLE_INCLUDE }>;

export async function getCliente(id: string): Promise<ClienteDetalle | null> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.cliente.findUnique({ where: { id }, include: CLIENTE_DETALLE_INCLUDE });
}

export async function createClienteAction(
  prevState: ClienteFormState,
  formData: FormData,
): Promise<ClienteFormState> {
  const parsed = parseClienteFormData(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  try {
    await tenantDb.cliente.create({
      data: {
        nombre: parsed.data.nombre,
        telefono: parsed.data.telefono || null,
        email: parsed.data.email || null,
        documento: parsed.data.documento || null,
      },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al crear cliente"), success: false };
  }

  revalidatePath("/clientes");
  return { error: null, success: true };
}

export async function updateClienteAction(
  id: string,
  prevState: ClienteFormState,
  formData: FormData,
): Promise<ClienteFormState> {
  const parsed = parseClienteFormData(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  try {
    await tenantDb.cliente.update({
      where: { id },
      data: {
        nombre: parsed.data.nombre,
        telefono: parsed.data.telefono || null,
        email: parsed.data.email || null,
        documento: parsed.data.documento || null,
      },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al actualizar cliente"), success: false };
  }

  revalidatePath(`/clientes/${id}`);
  return { error: null, success: true };
}

export async function deleteClienteAction(id: string): Promise<void> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  try {
    await tenantDb.cliente.delete({ where: { id } });
  } catch (err) {
    throw new Error(friendlyPrismaErrorMessage(err, "Error al eliminar cliente"));
  }
  revalidatePath("/clientes");
}
