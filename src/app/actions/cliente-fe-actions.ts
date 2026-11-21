"use server";

import { revalidatePath } from "next/cache";
import { requirePermiso } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { calcularDvNit } from "@/modulos/factura-electronica";
import { datosFeClienteSchema } from "@/lib/validation/factura-electronica";

export interface DatosFeClienteState {
  error: string | null;
  success: boolean;
}

function dvDe(documento: string): string | null {
  try {
    return calcularDvNit(documento);
  } catch {
    return null;
  }
}

export async function guardarDatosFeClienteAction(
  clienteId: string,
  _prev: DatosFeClienteState,
  formData: FormData,
): Promise<DatosFeClienteState> {
  const session = await requirePermiso("clientes.editar");
  const campo = (n: string) => String(formData.get(n) ?? "");
  const parsed = datosFeClienteSchema.safeParse({
    tipoDocumento: campo("tipoDocumento"),
    dv: campo("dv"),
    tipoPersona: campo("tipoPersona"),
    responsabilidadFiscal: campo("responsabilidadFiscal"),
    municipioCodigo: campo("municipioCodigo"),
    direccion: campo("direccion"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos.", success: false };

  const db = getTenantDb(session.user.tenantSchema);
  const cliente = await db.cliente.findUnique({ where: { id: clienteId }, select: { id: true, documento: true } });
  if (!cliente) return { error: "El cliente no existe.", success: false };

  const d = parsed.data;
  if (d.tipoDocumento === "31" && cliente.documento) {
    if (!d.dv) return { error: "Con NIT, escribe el dígito de verificación.", success: false };
    if (dvDe(cliente.documento) !== d.dv) {
      return { error: "El dígito de verificación no corresponde al NIT del cliente.", success: false };
    }
  }

  try {
    await db.cliente.update({ where: { id: clienteId }, data: d });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al guardar los datos del cliente"), success: false };
  }
  revalidatePath(`/clientes/${clienteId}`);
  return { error: null, success: true };
}
