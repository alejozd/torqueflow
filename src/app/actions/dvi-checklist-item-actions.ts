"use server";

import { requireRole, requireSession } from "@/lib/auth/guards";
import { getTenantDb, type TenantPrismaClient } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { dviChecklistItemInputSchema } from "@/lib/validation/dvi";
import { normalizeForSearch } from "@/lib/search";
import type { DviChecklistItem } from "@/generated/prisma-tenant";

export interface DviChecklistItemFormState {
  error: string | null;
  success: boolean;
  item?: DviChecklistItem;
}

export async function listDviChecklistItems(): Promise<DviChecklistItem[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.dviChecklistItem.findMany({ orderBy: { orden: "asc" } });
}

function slugifyChecklistLabel(label: string): string {
  return normalizeForSearch(label)
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function generarKeyUnica(tenantDb: TenantPrismaClient, base: string): Promise<string> {
  let key = base || "item";
  let sufijo = 2;
  while (await tenantDb.dviChecklistItem.findUnique({ where: { key } })) {
    key = `${base || "item"}_${sufijo}`;
    sufijo++;
  }
  return key;
}

export async function crearDviChecklistItemAction(
  prevState: DviChecklistItemFormState,
  formData: FormData,
): Promise<DviChecklistItemFormState> {
  const parsed = dviChecklistItemInputSchema.safeParse({ label: formData.get("label") ?? "" });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  try {
    const key = await generarKeyUnica(tenantDb, slugifyChecklistLabel(parsed.data.label));
    const { _max } = await tenantDb.dviChecklistItem.aggregate({ _max: { orden: true } });
    const item = await tenantDb.dviChecklistItem.create({
      data: { key, label: parsed.data.label, orden: (_max.orden ?? -1) + 1 },
    });
    return { error: null, success: true, item };
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al crear el ítem"), success: false };
  }
}

export async function toggleDviChecklistItemActivoAction(itemId: string): Promise<void> {
  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const item = await tenantDb.dviChecklistItem.findUnique({ where: { id: itemId } });
  if (!item) {
    throw new Error("Ítem no encontrado");
  }

  await tenantDb.dviChecklistItem.update({ where: { id: itemId }, data: { activo: !item.activo } });
}
