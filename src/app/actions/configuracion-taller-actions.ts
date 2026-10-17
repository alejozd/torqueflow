"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermiso, requireSession } from "@/lib/auth/guards";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { getTenantDb } from "@/lib/db/tenant-client";
import {
  CONFIGURACION_TALLER_ID,
  DIAS_AVISO_MAX,
  DIAS_AVISO_MIN,
  leerDiasAviso,
} from "@/lib/vencimientos/configuracion";
import {
  DIAS_ESTANCADA_MAX,
  DIAS_ESTANCADA_MIN,
  diasEstancadaSchema,
} from "@/lib/validation/orden";
import { leerDiasEstancada } from "@/lib/orden/configuracion-estancada";
import { leerOpcionesTaller, type OpcionesTaller } from "@/lib/configuracion/opciones-taller";

export interface ConfiguracionTallerFormState {
  error: string | null;
  success: boolean;
}

const MENSAJE_RANGO = `Ingresa un número de días entre ${DIAS_AVISO_MIN} y ${DIAS_AVISO_MAX}`;
const MENSAJE_DIAS_ESTANCADA = `Ingresa un número de días entre ${DIAS_ESTANCADA_MIN} y ${DIAS_ESTANCADA_MAX}`;

const MENSAJE_DESCUENTO_MAX = "Ingresa un porcentaje entero entre 0 y 100";

const descuentoMaxSchema = z.coerce
  .number({ error: MENSAJE_DESCUENTO_MAX })
  .int(MENSAJE_DESCUENTO_MAX)
  .min(0, MENSAJE_DESCUENTO_MAX)
  .max(100, MENSAJE_DESCUENTO_MAX);

const diasSchema = z.coerce
  .number({ error: MENSAJE_RANGO })
  .int(MENSAJE_RANGO)
  .min(DIAS_AVISO_MIN, MENSAJE_RANGO)
  .max(DIAS_AVISO_MAX, MENSAJE_RANGO);

export async function getDiasAvisoVencimiento(): Promise<number> {
  const session = await requireSession();
  return leerDiasAviso(getTenantDb(session.user.tenantSchema));
}

/** Fase 22: días sin actividad para considerar una orden estancada. */
export async function getDiasEstancada(): Promise<number> {
  const session = await requireSession();
  return leerDiasEstancada(getTenantDb(session.user.tenantSchema));
}

/** Fase de consolidación: firma obligatoria al entregar y control de caja. */
export async function getOpcionesTaller(): Promise<OpcionesTaller> {
  const session = await requireSession();
  return leerOpcionesTaller(getTenantDb(session.user.tenantSchema));
}

/**
 * Guarda las opciones del taller. Dos son casillas: una sin marcar no viaja en el
 * formulario, así que se lee como apagada; solo el valor "true" la enciende. El tope
 * de descuento de recepción es un entero 0-100 y un campo vacío no se lee como 0.
 */
export async function guardarOpcionesTallerAction(
  prevState: ConfiguracionTallerFormState,
  formData: FormData,
): Promise<ConfiguracionTallerFormState> {
  void prevState;
  const session = await requirePermiso("configuracion.taller");
  const crudoTope = formData.get("descuentoMaxRecepcion");
  const tope = crudoTope === null || crudoTope === "" ? null : descuentoMaxSchema.safeParse(crudoTope);
  if (!tope || !tope.success) return { error: MENSAJE_DESCUENTO_MAX, success: false };

  const opciones: OpcionesTaller = {
    exigirActaFirmada: formData.get("exigirActaFirmada") === "true",
    usarControlCaja: formData.get("usarControlCaja") === "true",
    descuentoMaxRecepcion: tope.data,
  };

  const tenantDb = getTenantDb(session.user.tenantSchema);
  try {
    await tenantDb.configuracionTaller.upsert({
      where: { id: CONFIGURACION_TALLER_ID },
      create: { id: CONFIGURACION_TALLER_ID, ...opciones },
      update: opciones,
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "No se pudo guardar la configuración"), success: false };
  }

  // Las opciones cambian lo que muestran la orden, la caja y el mostrador.
  revalidatePath("/configuracion-smtp");
  revalidatePath("/ordenes", "layout");
  revalidatePath("/caja");
  revalidatePath("/mostrador");
  return { error: null, success: true };
}

export async function guardarDiasEstancadaAction(
  prevState: ConfiguracionTallerFormState,
  formData: FormData,
): Promise<ConfiguracionTallerFormState> {
  void prevState;
  const session = await requirePermiso("configuracion.taller");
  const crudo = formData.get("diasOrdenEstancada");
  // Un campo vacío nunca debe leerse como "0 días" (mismo cuidado que arriba).
  const parsed = crudo === null || crudo === "" ? null : diasEstancadaSchema.safeParse(crudo);
  if (!parsed || !parsed.success) return { error: MENSAJE_DIAS_ESTANCADA, success: false };

  const tenantDb = getTenantDb(session.user.tenantSchema);
  try {
    await tenantDb.configuracionTaller.upsert({
      where: { id: CONFIGURACION_TALLER_ID },
      create: { id: CONFIGURACION_TALLER_ID, diasOrdenEstancada: parsed.data },
      update: { diasOrdenEstancada: parsed.data },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "No se pudo guardar la configuración"), success: false };
  }

  // El umbral se ve en la configuración, en el Inicio y en el listado.
  revalidatePath("/configuracion-smtp");
  revalidatePath("/");
  revalidatePath("/ordenes");
  return { error: null, success: true };
}

export async function guardarDiasAvisoAction(
  prevState: ConfiguracionTallerFormState,
  formData: FormData,
): Promise<ConfiguracionTallerFormState> {
  void prevState;
  const session = await requirePermiso("configuracion.taller");
  const crudo = formData.get("diasAvisoVencimiento");
  // z.coerce.number turns "" into 0, which the min() check rejects -- but be
  // explicit so an empty field never reads as "0 días".
  const parsed = crudo === null || crudo === "" ? null : diasSchema.safeParse(crudo);
  if (!parsed || !parsed.success) return { error: MENSAJE_RANGO, success: false };

  const tenantDb = getTenantDb(session.user.tenantSchema);
  try {
    await tenantDb.configuracionTaller.upsert({
      where: { id: CONFIGURACION_TALLER_ID },
      create: { id: CONFIGURACION_TALLER_ID, diasAvisoVencimiento: parsed.data },
      update: { diasAvisoVencimiento: parsed.data },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "No se pudo guardar la configuración"), success: false };
  }

  revalidatePath("/configuracion-smtp");
  revalidatePath("/vencimientos");
  return { error: null, success: true };
}
