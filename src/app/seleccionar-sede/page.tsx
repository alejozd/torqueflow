import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getTenantDb } from "@/lib/db/tenant-client";
import { listSedesDisponibles } from "@/lib/auth/sede-access";
import { SeleccionarSedeForm } from "./seleccionar-sede-form";

/**
 * Completes a session that signed in without an auto-resolved sede (Fase
 * 10). Uses auth() directly, not requireSession() -- requireSession()
 * redirects HERE whenever sedeActivaId is missing, so calling it in this
 * page would loop.
 */
export default async function SeleccionarSedePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.sedeActivaId) {
    redirect("/clientes");
  }

  const tenantDb = getTenantDb(session.user.tenantSchema);
  const sedes = await listSedesDisponibles(tenantDb, session.user.id, session.user.role);

  return (
    <main style={{ padding: "2rem", maxWidth: "24rem", margin: "0 auto" }}>
      <h1>Selecciona tu sede</h1>
      <SeleccionarSedeForm sedes={sedes} />
    </main>
  );
}
