"use server";

import { auth, unstable_update } from "@/auth";
import { getTenantDb } from "@/lib/db/tenant-client";
import { resolveSedeActiva } from "@/lib/auth/sede-access";

export interface SeleccionarSedeResult {
  error: string | null;
}

/**
 * Completes a session that signed in with no auto-resolved sede (Fase 10:
 * an ADMIN with more than one sede, or a TECNICO/RECEPCION with more than
 * one assignment). Deliberately uses auth() and NOT requireSession() --
 * requireSession() itself redirects to /seleccionar-sede whenever
 * sedeActivaId is missing, so calling it here would loop.
 */
export async function seleccionarSedeAction(sedeId: string): Promise<SeleccionarSedeResult> {
  const session = await auth();
  if (!session?.user) {
    return { error: "Sesión no encontrada. Vuelve a iniciar sesión." };
  }
  if (!sedeId) {
    return { error: "Selecciona una sede." };
  }

  const tenantDb = getTenantDb(session.user.tenantSchema);
  const sedeActiva = await resolveSedeActiva(tenantDb, session.user.id, session.user.role, sedeId);
  if (!sedeActiva) {
    return { error: "Sede inválida." };
  }

  await unstable_update({ user: { sedeActivaId: sedeActiva.id, sedeActivaNombre: sedeActiva.nombre } });

  return { error: null };
}
