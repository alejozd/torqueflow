"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/super-admin/guards";
import { publicDb } from "@/lib/db/public-client";
import { getTenantDb } from "@/lib/db/tenant-client";
import { rangoMesBogota } from "@/lib/factura-electronica/rango-mes";
import { cifrarSecreto } from "@/lib/crypto/secret-box";
import type { SuperAdminFormState } from "@/app/actions/super-admin-actions";
import type { AmbienteFacturaElectronica, CuentaFacturaElectronica } from "@/generated/prisma-tenant";

export interface FilaFeTaller {
  tenantId: string;
  slug: string;
  nombre: string | null;
  estado: "SIN_MIGRAR" | "SIN_CONFIGURAR" | "CONFIGURADA";
  activa: boolean;
  ambiente: AmbienteFacturaElectronica | null;
  cuenta: CuentaFacturaElectronica | null;
  tokenRegistrado: boolean;
  aceptadosMes: number;
}

export async function listFacturacionElectronicaTalleres(mes: string): Promise<FilaFeTaller[]> {
  await requireSuperAdmin();
  const { desde, hasta } = rangoMesBogota(mes);
  const tenants = await publicDb.tenant.findMany({
    select: { id: true, slug: true, nombre: true, schemaName: true },
    orderBy: { slug: "asc" },
  });
  return Promise.all(
    tenants.map(async (t): Promise<FilaFeTaller> => {
      const vacia = {
        tenantId: t.id,
        slug: t.slug,
        nombre: t.nombre,
        activa: false,
        ambiente: null,
        cuenta: null,
        tokenRegistrado: false,
        aceptadosMes: 0,
      };
      try {
        const db = getTenantDb(t.schemaName);
        const config = await db.configuracionFacturaElectronica.findUnique({ where: { id: "singleton" } });
        if (!config) return { ...vacia, estado: "SIN_CONFIGURAR" };
        const aceptadosMes = await db.documentoElectronico.count({
          where: {
            ambiente: "PRODUCCION",
            estado: { in: ["ACEPTADO", "ANULADO"] },
            createdAt: { gte: desde, lt: hasta },
          },
        });
        return {
          ...vacia,
          estado: "CONFIGURADA",
          activa: config.activa,
          ambiente: config.ambiente,
          cuenta: config.cuenta,
          tokenRegistrado: Boolean(config.tokenCifrado),
          aceptadosMes,
        };
      } catch {
        return { ...vacia, estado: "SIN_MIGRAR" };
      }
    }),
  );
}

export async function registrarTokenBolsaAction(
  tenantId: string,
  _prev: SuperAdminFormState,
  formData: FormData,
): Promise<SuperAdminFormState> {
  await requireSuperAdmin();
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return { error: "Escribe el token.", success: false };
  const tenant = await publicDb.tenant.findUnique({ where: { id: tenantId }, select: { schemaName: true } });
  if (!tenant) return { error: "El taller no existe.", success: false };
  const db = getTenantDb(tenant.schemaName);
  const config = await db.configuracionFacturaElectronica.findUnique({ where: { id: "singleton" } });
  if (config?.cuenta === "PROPIA") return { error: "Este taller usa su propia cuenta del proveedor.", success: false };
  const tokenCifrado = cifrarSecreto(token);
  await db.configuracionFacturaElectronica.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", cuenta: "BOLSA", tokenCifrado },
    update: { tokenCifrado },
  });
  revalidatePath("/superadmin/facturacion-electronica");
  return { error: null, success: true };
}
