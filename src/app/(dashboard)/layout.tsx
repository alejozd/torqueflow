import type { ReactNode } from "react";
import { requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { publicDb } from "@/lib/db/public-client";
import { SignOutButton } from "./sign-out-button";
import { CambiarSedeButton } from "./cambiar-sede-button";
import { DashboardSessionProvider } from "./dashboard-session-provider";
import { DashboardSidebar, type SidebarPlanInfo } from "./dashboard-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";

async function loadPlanInfo(session: Awaited<ReturnType<typeof requireSession>>): Promise<SidebarPlanInfo | null> {
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const [tenant, sedesCount] = await Promise.all([
    publicDb.tenant.findUnique({
      where: { schemaName: session.user.tenantSchema },
      select: { plan: { select: { nombre: true, maxSedes: true } } },
    }),
    tenantDb.sede.count(),
  ]);

  if (!tenant?.plan) return null;

  return { nombre: tenant.plan.nombre, maxSedes: tenant.plan.maxSedes, sedesCount };
}

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const esAdmin = session.user.role === "ADMIN";
  const plan = await loadPlanInfo(session);

  return (
    <DashboardSessionProvider>
      <TooltipProvider>
        <SidebarProvider>
          <DashboardSidebar esAdmin={esAdmin} tenantSlug={session.user.tenantSlug} plan={plan} />
          <SidebarInset>
            <header className="flex flex-wrap items-center gap-3 border-b bg-background px-4 py-3">
              <SidebarTrigger />
              <Separator orientation="vertical" className="h-5" />
              <div className="flex flex-1 flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">
                  Sesión: {session.user.email} — {session.user.tenantSlug}
                </span>
                <div className="flex items-center gap-2">
                  {/* The sede activa scopes everything below this header, so it is shown
                      on every page rather than only on /sedes. */}
                  <Badge variant="secondary">Sede: {session.user.sedeActivaNombre}</Badge>
                  <CambiarSedeButton />
                  <SignOutButton />
                </div>
              </div>
            </header>
            <main className="flex-1 p-6">{children}</main>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </DashboardSessionProvider>
  );
}
