import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getTenantDb } from "@/lib/db/tenant-client";
import { listSedesDisponibles } from "@/lib/auth/sede-access";
import { SeleccionarSedeForm } from "./seleccionar-sede-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Selecciona tu sede</CardTitle>
          <CardDescription>Elige la sede con la que vas a trabajar</CardDescription>
        </CardHeader>
        <CardContent>
          <SeleccionarSedeForm sedes={sedes} />
        </CardContent>
      </Card>
    </main>
  );
}
