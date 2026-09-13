import { publicDb } from "@/lib/db/public-client";
import { getTenantDb } from "@/lib/db/tenant-client";
import { DEFAULT_DVI_CHECKLIST_ITEMS } from "@/lib/dvi/checklist-items";

export interface BackfillDviChecklistItemsResult {
  seeded: number;
  alreadySeeded: number;
}

/**
 * One-off migration: seeds the 8 default DviChecklistItem rows for every
 * tenant provisioned before this feature shipped -- provisionTenant only
 * seeds them for tenants created from now on (see provision-tenant.ts).
 * Skips a tenant entirely if it already has any DviChecklistItem row, so
 * it's safe to re-run.
 */
export async function backfillDviChecklistItems(): Promise<BackfillDviChecklistItemsResult> {
  const tenants = await publicDb.tenant.findMany({ select: { schemaName: true } });

  const result: BackfillDviChecklistItemsResult = { seeded: 0, alreadySeeded: 0 };

  for (const tenant of tenants) {
    const tenantDb = getTenantDb(tenant.schemaName);
    const existingCount = await tenantDb.dviChecklistItem.count();
    if (existingCount > 0) {
      result.alreadySeeded++;
      continue;
    }
    await tenantDb.dviChecklistItem.createMany({
      data: DEFAULT_DVI_CHECKLIST_ITEMS.map((item, index) => ({ key: item.key, label: item.label, orden: index })),
    });
    result.seeded++;
  }

  return result;
}
