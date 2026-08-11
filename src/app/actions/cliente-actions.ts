"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { clienteInputSchema } from "@/lib/validation/cliente";
import type { Cliente, Vehiculo } from "@/generated/prisma-tenant";

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

export async function listClientes(): Promise<Cliente[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.cliente.findMany({ orderBy: { nombre: "asc" } });
}

export async function getCliente(id: string): Promise<(Cliente & { vehiculos: Vehiculo[] }) | null> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.cliente.findUnique({ where: { id }, include: { vehiculos: true } });
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
