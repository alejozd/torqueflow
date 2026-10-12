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
  "LIQUIDACION_GENERAR",
  "LIQUIDACION_PAGAR",
  "LIQUIDACION_ANULAR",
  "LIQUIDACION_ESQUEMA_ACTUALIZAR",
  "LIQUIDACION_FRECUENCIA_ACTUALIZAR",
];

export const TIPO_EVENTO_AUDITORIA_LABELS: Record<TipoEventoAuditoria, string> = {
  ORDEN_ANULAR: "Orden anulada",
  USUARIO_ACTUALIZAR_PERMISOS: "Permisos actualizados",
  USUARIO_ELIMINAR: "Usuario eliminado",
  BODEGA_ELIMINAR: "Bodega eliminada",
  LIQUIDACION_GENERAR: "Liquidación generada",
  LIQUIDACION_PAGAR: "Liquidación pagada",
  LIQUIDACION_ANULAR: "Liquidación anulada",
  LIQUIDACION_ESQUEMA_ACTUALIZAR: "Esquema de pago actualizado",
  LIQUIDACION_FRECUENCIA_ACTUALIZAR: "Frecuencia de liquidación actualizada",
};
