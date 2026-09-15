import type { TipoEventoAuditoria } from "@/generated/prisma-tenant";

/** Catálogo cerrado de eventos de auditoría de taller (v1) -- fuente única
 * para el orden de los filtros y las etiquetas en español, compartida entre
 * el panel del taller (/auditoria) y el drill-down de super-admin
 * (/superadmin/tenants/[tenantId]/auditoria) para que un mismo evento se
 * lea igual en los dos lugares. */
export const TIPOS_EVENTO_AUDITORIA: TipoEventoAuditoria[] = [
  "ORDEN_ANULAR",
  "USUARIO_ACTUALIZAR_PERMISOS",
  "USUARIO_ELIMINAR",
  "BODEGA_ELIMINAR",
];

export const TIPO_EVENTO_AUDITORIA_LABELS: Record<TipoEventoAuditoria, string> = {
  ORDEN_ANULAR: "Orden anulada",
  USUARIO_ACTUALIZAR_PERMISOS: "Permisos actualizados",
  USUARIO_ELIMINAR: "Usuario eliminado",
  BODEGA_ELIMINAR: "Bodega eliminada",
};
