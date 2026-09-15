"use server";

import { requireRole } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import type { TipoEventoAuditoria } from "@/generated/prisma-tenant";

export interface AuditLogConActor {
  id: string;
  tipo: TipoEventoAuditoria;
  actorNombre: string | null;
  entidadTipo: string;
  entidadId: string;
  detalle: unknown;
  createdAt: Date;
}

export interface ListarAuditLogFiltros {
  tipo?: TipoEventoAuditoria;
}

/** Tope de 200 eventos más recientes -- catálogo curado (4 tipos), volumen
 * bajo por diseño (ver spec §"Alcance v1"). Mismo patrón que /usuarios y
 * /bodegas: trae la lista completa (acotada) y deja que DataTable pagine en
 * cliente, sin infraestructura de paginación server-side nueva. */
export async function listAuditLog(filtros: ListarAuditLogFiltros = {}): Promise<AuditLogConActor[]> {
  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const eventos = await tenantDb.auditLog.findMany({
    where: { tipo: filtros.tipo },
    include: { actor: { select: { nombre: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return eventos.map((evento) => ({
    id: evento.id,
    tipo: evento.tipo,
    actorNombre: evento.actor?.nombre ?? null,
    entidadTipo: evento.entidadTipo,
    entidadId: evento.entidadId,
    detalle: evento.detalle,
    createdAt: evento.createdAt,
  }));
}
