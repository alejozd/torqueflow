import type { Prisma, TipoEventoAuditoriaPlataforma } from "@/generated/prisma-public";

/**
 * Mismo contrato que registrarEventoAuditoria (src/lib/auditoria/registrarEvento.ts),
 * pero contra el schema public. `db` acepta un Prisma.TransactionClient real
 * (desde publicDb.$transaction) o el propio `publicDb` sin envolver: crearTenantAction
 * no puede abrir una única transacción de Prisma para todo el proceso porque
 * provisionTenant crea el schema del tenant vía DDL fuera del control de
 * Prisma -- ver Task 7.
 */
export async function registrarEventoAuditoriaPlataforma(
  db: Prisma.TransactionClient,
  evento: {
    tipo: TipoEventoAuditoriaPlataforma;
    superAdminId: string | null;
    tenantId: string | null;
    detalle?: Prisma.InputJsonValue;
  },
): Promise<void> {
  await db.auditLogPlataforma.create({ data: evento });
}
