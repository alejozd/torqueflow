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

// Same convention as clientes/[id]/page.tsx's getIniciales.
function getIniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  if (partes.length === 1) return partes[0]!.slice(0, 2).toUpperCase();
  return (partes[0]!.charAt(0) + partes[1]!.charAt(0)).toUpperCase();
}

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
  // Same name-or-email fallback as the Inicio page's greeting.
  const nombreUsuario = session.user.name ?? session.user.email ?? "";

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
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[oklch(0.62_0.19_45/0.14)] text-[10.5px] font-semibold text-[oklch(0.42_0.14_45)]">
                    {getIniciales(nombreUsuario)}
                  </div>
                  <div className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-xs font-medium">{session.user.email}</span>
                    <span className="font-mono text-[10.5px] text-muted-foreground">{session.user.tenantSlug}</span>
                  </div>
                </div>
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
