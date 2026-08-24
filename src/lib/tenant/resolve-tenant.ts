import { headers } from "next/headers";
import { publicDb } from "@/lib/db/public-client";
import { TENANT_SLUG_HEADER } from "./constants";

export interface ResolvedTenant {
  slug: string;
  schemaName: string;
  estado: "ACTIVO" | "SUSPENDIDO";
}

/**
 * Node-runtime only. Reads the tenant slug tagged onto the request by
 * middleware.ts (Edge runtime) and resolves it against the public.Tenant
 * table. See docs/design/notes/2026-08-09-tenant-resolution-edge-split.md.
 */
export async function resolveTenant(): Promise<ResolvedTenant | null> {
  const headerList = await headers();
  const slug = headerList.get(TENANT_SLUG_HEADER);
  if (!slug) return null;

  const tenant = await publicDb.tenant.findUnique({ where: { slug } });
  if (!tenant) return null;

  return { slug: tenant.slug, schemaName: tenant.schemaName, estado: tenant.estado };
}
