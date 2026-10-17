"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  BarChart3,
  CalendarDays,
  Coins,
  CreditCard,
  FileSpreadsheet,
  FileText,
  HandCoins,
  History,
  Home,
  Landmark,
  ListChecks,
  Mail,
  MapPin,
  Package,
  PackagePlus,
  Receipt,
  ShieldAlert,
  Store,
  Truck,
  UserCog,
  Users,
  Wallet,
  Warehouse,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { tienePermiso, type Permiso } from "@/lib/auth/permisos";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badgeCount?: number | null;
  /** Sin permiso, el ítem lo ve cualquier usuario. */
  permiso?: Permiso;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// Standalone, ungrouped -- the dashboard/overview link at src/app/(dashboard)/page.tsx
// sits at "/" itself, not under any of the labeled groups below.
const INICIO: NavItem = { href: "/", label: "Inicio", icon: Home };

// Los ítems con `permiso` se filtran por los permisos del usuario; un grupo
// que se queda sin ítems no se pinta.
const MOSTRADOR: NavItem = { href: "/mostrador", label: "Mostrador", icon: Store, permiso: "mostrador.vender" };

const GASTOS: NavItem = { href: "/gastos", label: "Gastos", icon: Wallet, permiso: "gastos.registrar" };
const CAJA: NavItem = { href: "/caja", label: "Caja", icon: Landmark, permiso: "caja.usar" };
const CARTERA: NavItem = { href: "/cartera", label: "Cartera", icon: HandCoins, permiso: "cartera.ver" };
const CUENTAS_POR_PAGAR: NavItem = {
  href: "/cuentas-por-pagar", label: "Cuentas por pagar", icon: CreditCard, permiso: "cuentasPorPagar.usar",
};
const SERVICIOS: NavItem = { href: "/servicios", label: "Servicios", icon: ListChecks, permiso: "servicios.gestionar" };
const IMPORTAR: NavItem = { href: "/importar", label: "Importar", icon: FileSpreadsheet, permiso: "importar.usar" };

const OPERACION: NavGroup = {
  label: "Operación",
  items: [
    { href: "/clientes", label: "Clientes", icon: Users },
    { href: "/cotizaciones", label: "Cotizaciones", icon: FileText },
    { href: "/ordenes", label: "Órdenes", icon: Wrench },
    { href: "/citas", label: "Citas", icon: CalendarDays },
    { href: "/vencimientos", label: "Vencimientos", icon: ShieldAlert },
    { href: "/facturas", label: "Facturas", icon: Receipt, permiso: "facturas.ver" },
    MOSTRADOR,
    CAJA,
    CARTERA,
    CUENTAS_POR_PAGAR,
    GASTOS,
  ],
};

const INVENTARIO: NavGroup = {
  label: "Inventario",
  items: [
    { href: "/bodegas", label: "Bodegas", icon: Warehouse },
    { href: "/proveedores", label: "Proveedores", icon: Truck },
    { href: "/repuestos", label: "Repuestos", icon: Package },
    { href: "/pedidos-compra", label: "Pedidos", icon: ClipboardList },
    { href: "/entradas-mercancia", label: "Entradas", icon: PackagePlus },
    SERVICIOS,
  ],
};

const ADMINISTRACION: NavGroup = {
  label: "Administración",
  items: [
    { href: "/reportes", label: "Reportes", icon: BarChart3, permiso: "reportes.productividad" },
    { href: "/liquidaciones", label: "Liquidaciones", icon: Coins, permiso: "liquidaciones.gestionar" },
    { href: "/sedes", label: "Sedes", icon: MapPin, permiso: "sedes.gestionar" },
    { href: "/usuarios", label: "Usuarios", icon: UserCog, permiso: "usuarios.gestionar" },
    { href: "/auditoria", label: "Auditoría", icon: History, permiso: "auditoria.ver" },
    { href: "/configuracion-smtp", label: "SMTP", icon: Mail, permiso: "configuracion.taller" },
    IMPORTAR,
  ],
};

function isActiveHref(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Fase 11-14: the mockup's active nav item is NOT the generic shadcn dark
// --sidebar-accent grey -- it's the brand accent at 10% opacity, exact oklch
// value from the mockup (not the theme's --sidebar-accent token). Text is
// plain white rather than the mockup's darker accent tint: against the dark
// sidebar background that darker tint read as low-contrast/muted, and white
// keeps the active label clearly the brightest text in the list.
const ACTIVE_ITEM_CLASSNAME = "data-active:bg-[oklch(0.62_0.19_45/0.10)] data-active:text-white data-active:font-medium";

function NavItemButton({ href, label, icon: Icon, pathname, badgeCount }: NavItem & { pathname: string }) {
  const active = isActiveHref(pathname, href);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton isActive={active} render={<Link href={href} />} className={cn(ACTIVE_ITEM_CLASSNAME)}>
        <Icon />
        <span className="flex-1 truncate">{label}</span>
        {typeof badgeCount === "number" && badgeCount > 0 ? (
          <Badge
            variant="default"
            className="h-5 min-w-5 shrink-0 justify-center rounded-full px-1 font-mono text-[10px] group-data-[collapsible=icon]:hidden"
          >
            {badgeCount}
          </Badge>
        ) : null}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function NavGroupSection({
  group,
  pathname,
  badgeCountByHref,
}: {
  group: NavGroup;
  pathname: string;
  /** Overlays a badgeCount onto the item whose href matches, without turning
   * the static OPERACION/INVENTARIO/ADMINISTRACION nav data into something
   * dynamic. Currently only /cotizaciones (pendientes de seguimiento) uses it. */
  badgeCountByHref?: Record<string, number | null | undefined>;
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-[0.6875rem] font-medium tracking-wider text-sidebar-foreground/50 uppercase">
        {group.label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {group.items.map((item) => (
            <NavItemButton
              key={item.href}
              {...item}
              badgeCount={badgeCountByHref?.[item.href] ?? item.badgeCount}
              pathname={pathname}
            />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export interface SidebarPlanInfo {
  nombre: string;
  maxSedes: number | null;
  sedesCount: number;
}

export function DashboardSidebar({
  permisos,
  tenantSlug,
  plan,
  cotizacionesPendientesSeguimiento,
  ordenesEnTaller,
  citasHoy,
  facturasPendientes,
  repuestosStockBajo,
}: {
  permisos: Permiso[];
  tenantSlug: string;
  plan: SidebarPlanInfo | null;
  cotizacionesPendientesSeguimiento?: number;
  ordenesEnTaller?: number;
  citasHoy?: number;
  facturasPendientes?: number;
  repuestosStockBajo?: number;
}) {
  const pathname = usePathname();
  const visibles = (grupo: NavGroup): NavGroup => ({
    ...grupo,
    items: grupo.items.filter((item) => !item.permiso || tienePermiso(permisos, item.permiso)),
  });
  const operacion = visibles(OPERACION);
  const inventario = visibles(INVENTARIO);
  const administracion = visibles(ADMINISTRACION);

  return (
    <div className="dark">
      <Sidebar collapsible="icon">
        <SidebarHeader className="px-2 py-3">
          {/* items-center works for both the default row layout and the
              collapsed column layout below -- it maps to align-items, which
              centers cross-axis regardless of flex-direction. */}
          <div className="flex items-center gap-2.5 px-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary">
              <Wrench className="size-4 text-primary-foreground" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
              <span className="truncate text-sm font-semibold text-sidebar-foreground">TorqueFlow</span>
              <span className="truncate font-mono text-[0.6875rem] text-sidebar-foreground/50">{tenantSlug}</span>
            </div>
            <SidebarTrigger />
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <NavItemButton {...INICIO} pathname={pathname} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          {operacion.items.length > 0 ? (
            <NavGroupSection
              group={operacion}
              pathname={pathname}
              badgeCountByHref={{
                "/cotizaciones": cotizacionesPendientesSeguimiento,
                "/ordenes": ordenesEnTaller,
                "/citas": citasHoy,
                "/facturas": facturasPendientes,
              }}
            />
          ) : null}
          {inventario.items.length > 0 ? (
            <NavGroupSection
              group={inventario}
              pathname={pathname}
              badgeCountByHref={{ "/repuestos": repuestosStockBajo }}
            />
          ) : null}
          {administracion.items.length > 0 ? (
            <NavGroupSection group={administracion} pathname={pathname} />
          ) : null}
        </SidebarContent>
        {plan ? (
          <SidebarFooter className="gap-2 border-t border-sidebar-border px-3 py-3 group-data-[collapsible=icon]:hidden">
            <div className="flex items-center justify-between text-xs text-sidebar-foreground/70">
              <span>
                Plan <span className="font-medium text-sidebar-foreground">{plan.nombre}</span>
              </span>
              <span className="font-mono">
                {plan.sedesCount}
                {plan.maxSedes !== null ? `/${plan.maxSedes}` : ""} sedes
              </span>
            </div>
            {plan.maxSedes !== null && plan.maxSedes > 0 ? (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-sidebar-foreground/10">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.min(100, (plan.sedesCount / plan.maxSedes) * 100)}%` }}
                />
              </div>
            ) : null}
          </SidebarFooter>
        ) : null}
      </Sidebar>
    </div>
  );
}
