import type { Prisma, TipoEventoAuditoria } from "@/generated/prisma-tenant";

/**
 * Recibe siempre un tx ya abierto por la action que la llama -- nunca abre
 * el suyo. Así la escritura de auditoría queda atómica con la mutación que
 * audita: si una falla, la otra se revierte con ella (ver Global Constraints
 * del plan). Ninguna action llama a auditLog.update ni .delete -- solo
 * .create (aquí) y lecturas (src/app/actions/auditoria-actions.ts).
 */
export async function registrarEventoAuditoria(
  tx: Prisma.TransactionClient,
  evento: {
    tipo: TipoEventoAuditoria;
    actorId: string | null;
    entidadTipo: string;
    entidadId: string;
    detalle?: Prisma.InputJsonValue;
  },
): Promise<void> {
  await tx.auditLog.create({ data: evento });
}
