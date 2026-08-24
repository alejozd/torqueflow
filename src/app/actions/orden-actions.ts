"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getTenantDb, type TenantPrismaClient } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { ordenTrabajoInputSchema, estadoOrdenSchema } from "@/lib/validation/orden";
import { isValidEstadoTransition } from "@/lib/orden/estado-transitions";
import { scopeOrden } from "@/lib/sede/scope";
import {
  CONFIGURACION_SMTP_ID,
  descifrarConfiguracionSmtp,
  type ConfiguracionSmtpAlmacenada,
  type SmtpConfigDescifrada,
} from "@/lib/email/smtp-config";
import { enviarEmail } from "@/lib/email/enviar-email";
import { esEstadoNotificable, type EstadoNotificable } from "@/lib/notificaciones/plantilla";
import {
  enviarNotificacionEstadoOrden,
  type ResultadoNotificacion,
} from "@/lib/notificaciones/enviar-notificacion-estado";
import type { EstadoOrden, OrdenTrabajo, Prisma } from "@/generated/prisma-tenant";

export interface OrdenFormState {
  error: string | null;
  success: boolean;
}

export interface TecnicoOption {
  id: string;
  nombre: string;
}

const ORDEN_DETAIL_INCLUDE = {
  cliente: true,
  vehiculo: true,
  sede: true,
  mecanico: { select: { id: true, nombre: true } },
  items: true,
  manoDeObra: true,
  dvi: { include: { fotos: true } },
  factura: { select: { id: true, numero: true } },
} satisfies Prisma.OrdenTrabajoInclude;

export type OrdenWithDetalle = Prisma.OrdenTrabajoGetPayload<{ include: typeof ORDEN_DETAIL_INCLUDE }>;

export async function listOrdenes(estado?: EstadoOrden): Promise<OrdenWithDetalle[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.ordenTrabajo.findMany({
    where: { ...scopeOrden(session.user.sedeActivaId), ...(estado ? { estado } : {}) },
    include: ORDEN_DETAIL_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

export async function listOrdenesByVehiculo(vehiculoId: string): Promise<OrdenTrabajo[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  // The Vehiculo is tenant-wide on purpose (a client may bring the same car to
  // any sede), but its órdenes belong to whichever sede opened them.
  return tenantDb.ordenTrabajo.findMany({
    where: { vehiculoId, ...scopeOrden(session.user.sedeActivaId) },
    orderBy: { createdAt: "desc" },
  });
}

export async function getOrden(id: string): Promise<OrdenWithDetalle | null> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  // findFirst, not findUnique: findUnique cannot carry the sede filter, so an
  // id from another sede would resolve. This is the IDOR boundary.
  return tenantDb.ordenTrabajo.findFirst({
    where: { id, ...scopeOrden(session.user.sedeActivaId) },
    include: ORDEN_DETAIL_INCLUDE,
  });
}

export async function listTecnicos(): Promise<TecnicoOption[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  // Only técnicos who actually work in this sede can be assigned an orden here.
  return tenantDb.usuario.findMany({
    where: { role: "TECNICO", sedes: { some: { sedeId: session.user.sedeActivaId } } },
    select: { id: true, nombre: true },
    orderBy: { nombre: "asc" },
  });
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

  try {
    await tenantDb.ordenTrabajo.create({
      data: {
        clienteId,
        vehiculoId,
        sedeId: session.user.sedeActivaId,
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

export interface EstadoFormState {
  error: string | null;
  advertencia?: string | null;
}

const ADVERTENCIA_POR_RESULTADO: Partial<Record<ResultadoNotificacion, string>> = {
  SIN_SMTP_ACTIVO:
    "Estado actualizado. El correo del taller no está configurado, no se notificó al cliente.",
  SIN_EMAIL_CLIENTE:
    "Estado actualizado. El cliente no tiene un correo registrado, no se le notificó.",
  FALLO_ENVIO:
    "Estado actualizado, pero no se pudo enviar la notificación por correo al cliente.",
};

async function notificarCambioEstadoOrden(
  tenantDb: TenantPrismaClient,
  params: {
    ordenId: string;
    clienteId: string;
    clienteNombre: string;
    clienteEmail: string | null;
    placa: string;
    marca: string;
    modelo: string;
    estado: EstadoNotificable;
  },
): Promise<string | null> {
  let smtp: SmtpConfigDescifrada | null = null;
  try {
    const filaSmtp = await tenantDb.configuracionSmtp.findUnique({ where: { id: CONFIGURACION_SMTP_ID } });
    smtp = filaSmtp && filaSmtp.activo ? descifrarConfiguracionSmtp(filaSmtp as ConfiguracionSmtpAlmacenada) : null;
  } catch {
    // descifrarConfiguracionSmtp throws on a rotated/missing SMTP_ENCRYPTION_KEY
    // or a corrupted envelope. The estado change already committed by the time
    // this runs -- nothing was attempted, so no audit row, just the same
    // FALLO_ENVIO advertencia a send failure would produce.
    return ADVERTENCIA_POR_RESULTADO.FALLO_ENVIO ?? null;
  }

  const resultado = await enviarNotificacionEstadoOrden(
    { smtp, enviarEmail },
    {
      clienteNombre: params.clienteNombre,
      clienteEmail: params.clienteEmail,
      placa: params.placa,
      marca: params.marca,
      modelo: params.modelo,
      estado: params.estado,
    },
  );

  if (resultado === "ENVIADA" || resultado === "FALLO_ENVIO") {
    try {
      await tenantDb.notificacionOrdenEnviada.create({
        data: {
          ordenId: params.ordenId,
          clienteId: params.clienteId,
          estado: params.estado,
          emailDestino: params.clienteEmail as string,
          resultado,
        },
      });
    } catch {
      // Best-effort audit row: the email either went out or didn't, and the
      // estado change already committed either way. A failed log write must
      // not surface as an action error.
    }
  }

  return ADVERTENCIA_POR_RESULTADO[resultado] ?? null;
}

export async function updateEstadoOrdenAction(
  id: string,
  prevState: EstadoFormState,
  formData: FormData,
): Promise<EstadoFormState> {
  const parsedEstado = estadoOrdenSchema.safeParse(formData.get("estado"));
  if (!parsedEstado.success) {
    return { error: "Estado inválido" };
  }

  const session = await requireRole(["ADMIN", "RECEPCION", "TECNICO"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const orden = await tenantDb.ordenTrabajo.findFirst({
    where: { id, ...scopeOrden(session.user.sedeActivaId) },
    include: { cliente: true, vehiculo: true },
  });
  if (!orden) {
    return { error: "Orden no encontrada" };
  }

  if (!isValidEstadoTransition(orden.estado, parsedEstado.data)) {
    return { error: `No se puede cambiar de ${orden.estado} a ${parsedEstado.data}` };
  }

  try {
    await tenantDb.ordenTrabajo.update({
      where: { id },
      data: {
        estado: parsedEstado.data,
        entregadaAt: parsedEstado.data === "ENTREGADA" ? new Date() : undefined,
        anuladaAt: parsedEstado.data === "ANULADA" ? new Date() : undefined,
      },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al actualizar el estado") };
  }

  revalidatePath(`/ordenes/${id}`);

  const nuevoEstado = parsedEstado.data;
  const advertencia = esEstadoNotificable(nuevoEstado)
    ? await notificarCambioEstadoOrden(tenantDb, {
        ordenId: id,
        clienteId: orden.clienteId,
        clienteNombre: orden.cliente.nombre,
        clienteEmail: orden.cliente.email,
        placa: orden.vehiculo.placa,
        marca: orden.vehiculo.marca,
        modelo: orden.vehiculo.modelo,
        estado: nuevoEstado,
      })
    : null;

  return { error: null, advertencia };
}
