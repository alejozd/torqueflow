import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { Toaster } from "sonner";
import { requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { publicDb } from "@/lib/db/public-client";
import { esCotizacionPendienteDeSeguimiento } from "@/lib/cotizacion/seguimiento-pendiente";
import { scopeCita, scopeCotizacion, scopeFactura, scopeOrden, scopeRepuesto } from "@/lib/sede/scope";
import { buildRangoFechas } from "@/lib/reportes/rango-fechas";
import { ultimosNDiasIso } from "@/lib/dashboard/calculos";
import { SignOutButton } from "./sign-out-button";
import { CambiarSedeButton } from "./cambiar-sede-button";
import { DashboardSessionProvider } from "./dashboard-session-provider";
import { DashboardSidebar, type SidebarPlanInfo } from "./dashboard-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
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

/**
 * Sidebar badge on "Cotizaciones" -- same esCotizacionPendienteDeSeguimiento
 * rule as the list page's own KPI/filter (src/lib/cotizacion/seguimiento-pendiente.ts),
 * applied here across every sede-scoped cotización still open (BORRADOR/ENVIADA).
 */
async function loadCotizacionesPendientesSeguimiento(
  session: Awaited<ReturnType<typeof requireSession>>,
): Promise<number> {
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const cotizaciones = await tenantDb.cotizacion.findMany({
    where: { ...scopeCotizacion(session.user.sedeActivaId), estado: { in: ["BORRADOR", "ENVIADA"] } },
    select: {
      estado: true,
      seguimientos: { orderBy: { fecha: "desc" }, take: 1, select: { proximoSeguimiento: true } },
    },
  });
  const ahora = new Date();
  return cotizaciones.filter((cotizacion) =>
    esCotizacionPendienteDeSeguimiento(cotizacion, cotizacion.seguimientos[0], ahora),
  ).length;
}

/**
 * Sidebar badge on "Órdenes" -- same "en el taller" definition as the Inicio
 * dashboard's own KPI (getDashboardOverview in dashboard-actions.ts): orders
 * still open (not yet ENTREGADA/ANULADA).
 */
async function loadOrdenesEnTaller(session: Awaited<ReturnType<typeof requireSession>>): Promise<number> {
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.ordenTrabajo.count({
    where: { ...scopeOrden(session.user.sedeActivaId), estado: { in: ["BORRADOR", "EN_PROCESO", "TERMINADA"] } },
  });
}

/**
 * Sidebar badge on "Citas" -- same "citas de hoy" definition as the Inicio
 * dashboard's own KPI: today's appointments, excluding cancelled ones.
 */
async function loadCitasHoy(session: Awaited<ReturnType<typeof requireSession>>): Promise<number> {
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const hoyIso = ultimosNDiasIso(new Date(), 1)[0]!;
  const rangoHoy = buildRangoFechas(hoyIso, hoyIso);
  return tenantDb.cita.count({
    where: {
      ...scopeCita(session.user.sedeActivaId),
      fechaHora: { gte: rangoHoy.gte, lt: rangoHoy.lt },
      estado: { not: "CANCELADA" },
    },
  });
}

/**
 * Sidebar badge on "Facturas" -- same "cartera.facturasPendientes"
 * definition as the Inicio dashboard's own KPI: invoices still awaiting
 * payment.
 */
async function loadFacturasPendientes(session: Awaited<ReturnType<typeof requireSession>>): Promise<number> {
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.factura.count({ where: { ...scopeFactura(session.user.sedeActivaId), estado: "PENDIENTE" } });
}

/**
 * Sidebar badge on "Repuestos" -- same "stockBajo.count" definition as the
 * Inicio dashboard's own KPI: stockActual <= stockMinimo, computed in JS
 * because Prisma cannot compare two columns of the same row in a `where`.
 */
async function loadRepuestosStockBajo(session: Awaited<ReturnType<typeof requireSession>>): Promise<number> {
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const repuestos = await tenantDb.repuesto.findMany({
    where: scopeRepuesto(session.user.sedeActivaId),
    select: { stockActual: true, stockMinimo: true },
  });
  return repuestos.filter((repuesto) => repuesto.stockActual <= repuesto.stockMinimo).length;
}

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const esAdmin = session.user.role === "ADMIN";
  // Remembers the sidebar's collapsed/expanded state per browser (SidebarProvider
  // writes this cookie on every toggle), so a preference set on a smaller screen
  // doesn't reset to expanded on the next page load.
  const cookieStore = await cookies();
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";
  const [
    plan,
    cotizacionesPendientesSeguimiento,
    ordenesEnTaller,
    citasHoy,
    facturasPendientes,
    repuestosStockBajo,
  ] = await Promise.all([
    loadPlanInfo(session),
    loadCotizacionesPendientesSeguimiento(session),
    loadOrdenesEnTaller(session),
    loadCitasHoy(session),
    loadFacturasPendientes(session),
    loadRepuestosStockBajo(session),
  ]);
  // Same name-or-email fallback as the Inicio page's greeting.
  const nombreUsuario = session.user.name ?? session.user.email ?? "";

  return (
    <DashboardSessionProvider>
      <TooltipProvider>
        <Toaster richColors position="top-right" />
        <SidebarProvider defaultOpen={sidebarOpen}>
          <DashboardSidebar
            esAdmin={esAdmin}
            tenantSlug={session.user.tenantSlug}
            plan={plan}
            cotizacionesPendientesSeguimiento={cotizacionesPendientesSeguimiento}
            ordenesEnTaller={ordenesEnTaller}
            citasHoy={citasHoy}
            facturasPendientes={facturasPendientes}
            repuestosStockBajo={repuestosStockBajo}
          />
          <SidebarInset>
            <header className="flex flex-wrap items-center gap-3 border-b bg-background px-4 py-3">
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
            <main className="flex-1 bg-slate-50 p-6 dark:bg-slate-900/40">{children}</main>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </DashboardSessionProvider>
  );
}
