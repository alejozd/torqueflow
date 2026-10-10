"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import {
  CONFIGURACION_TALLER_ID,
  DIAS_AVISO_MAX,
  DIAS_AVISO_MIN,
  leerDiasAviso,
} from "@/lib/vencimientos/configuracion";

export interface ConfiguracionTallerFormState {
  error: string | null;
  success: boolean;
}

const MENSAJE_RANGO = `Ingresa un número de días entre ${DIAS_AVISO_MIN} y ${DIAS_AVISO_MAX}`;

const diasSchema = z.coerce
  .number({ error: MENSAJE_RANGO })
  .int(MENSAJE_RANGO)
  .min(DIAS_AVISO_MIN, MENSAJE_RANGO)
  .max(DIAS_AVISO_MAX, MENSAJE_RANGO);

export async function getDiasAvisoVencimiento(): Promise<number> {
  const session = await requireSession();
  return leerDiasAviso(getTenantDb(session.user.tenantSchema));
}

export async function guardarDiasAvisoAction(
  prevState: ConfiguracionTallerFormState,
  formData: FormData,
): Promise<ConfiguracionTallerFormState> {
  void prevState;
  const session = await requireRole(["ADMIN"]);
  const crudo = formData.get("diasAvisoVencimiento");
  // z.coerce.number turns "" into 0, which the min() check rejects -- but be
  // explicit so an empty field never reads as "0 días".
  const parsed = crudo === null || crudo === "" ? null : diasSchema.safeParse(crudo);
  if (!parsed || !parsed.success) return { error: MENSAJE_RANGO, success: false };

  const tenantDb = getTenantDb(session.user.tenantSchema);
  await tenantDb.configuracionTaller.upsert({
    where: { id: CONFIGURACION_TALLER_ID },
    create: { id: CONFIGURACION_TALLER_ID, diasAvisoVencimiento: parsed.data },
    update: { diasAvisoVencimiento: parsed.data },
  });

  revalidatePath("/configuracion-smtp");
  revalidatePath("/vencimientos");
  return { error: null, success: true };
}
