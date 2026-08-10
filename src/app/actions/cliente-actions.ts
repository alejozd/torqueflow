"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { resolveTenant } from "@/lib/tenant/resolve-tenant";
import { getTenantDb } from "@/lib/db/tenant-client";
import { clienteInputSchema, type ClienteInput } from "@/lib/validation/cliente";
import type { Cliente, Vehiculo } from "@/generated/prisma-tenant";

export interface ClienteFormState {
  error: string | null;
  success: boolean;
}

async function tenantDbOrThrow() {
  const tenant = await resolveTenant();
  if (!tenant) throw new Error("No se pudo resolver el taller actual");
  return getTenantDb(tenant.schemaName);
}

async function createCliente(input: ClienteInput): Promise<Cliente> {
  await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = await tenantDbOrThrow();
  return tenantDb.cliente.create({
    data: {
      nombre: input.nombre,
      telefono: input.telefono || null,
      email: input.email || null,
      documento: input.documento || null,
    },
  });
}

async function updateCliente(id: string, input: ClienteInput): Promise<Cliente> {
  await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = await tenantDbOrThrow();
  return tenantDb.cliente.update({
    where: { id },
    data: {
      nombre: input.nombre,
      telefono: input.telefono || null,
      email: input.email || null,
      documento: input.documento || null,
    },
  });
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
  await requireSession();
  const tenantDb = await tenantDbOrThrow();
  return tenantDb.cliente.findMany({ orderBy: { nombre: "asc" } });
}

export async function getCliente(id: string): Promise<(Cliente & { vehiculos: Vehiculo[] }) | null> {
  await requireSession();
  const tenantDb = await tenantDbOrThrow();
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

  try {
    await createCliente(parsed.data);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al crear cliente", success: false };
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

  try {
    await updateCliente(id, parsed.data);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al actualizar cliente", success: false };
  }

  revalidatePath(`/clientes/${id}`);
  return { error: null, success: true };
}

export async function deleteClienteAction(id: string): Promise<void> {
  await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = await tenantDbOrThrow();
  await tenantDb.cliente.delete({ where: { id } });
  revalidatePath("/clientes");
}
