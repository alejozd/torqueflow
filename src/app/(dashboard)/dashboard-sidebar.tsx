"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  Mail,
  MapPin,
  Package,
  PackagePlus,
  Receipt,
  Truck,
  UserCog,
  Users,
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
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const OPERACION: NavGroup = {
  label: "Operación",
  items: [
    { href: "/clientes", label: "Clientes", icon: Users },
    { href: "/ordenes", label: "Órdenes", icon: Wrench },
    { href: "/citas", label: "Citas", icon: CalendarDays },
    { href: "/facturas", label: "Facturas", icon: Receipt },
  ],
};

const INVENTARIO: NavGroup = {
  label: "Inventario",
  items: [
    { href: "/bodegas", label: "Bodegas", icon: Warehouse },
    { href: "/proveedores", label: "Proveedores", icon: Truck },
    { href: "/repuestos", label: "Repuestos", icon: Package },
    { href: "/entradas-mercancia", label: "Entradas", icon: PackagePlus },
  ],
};

const ADMINISTRACION: NavGroup = {
  label: "Administración",
  items: [
    { href: "/reportes", label: "Reportes", icon: BarChart3 },
    { href: "/sedes", label: "Sedes", icon: MapPin },
    { href: "/usuarios", label: "Usuarios", icon: UserCog },
    { href: "/configuracion-smtp", label: "SMTP", icon: Mail },
  ],
};

function isActiveHref(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavGroupSection({ group, pathname }: { group: NavGroup; pathname: string }) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-[0.6875rem] font-medium tracking-wider text-sidebar-foreground/50 uppercase">
        {group.label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {group.items.map(({ href, label, icon: Icon }) => {
            const active = isActiveHref(pathname, href);
            return (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton
                  isActive={active}
                  render={<Link href={href} />}
                  className={cn(
                    // Fase 11-14: the mockup's active nav item is NOT the
                    // generic shadcn dark --sidebar-accent grey -- it's the
                    // brand accent at 10% opacity with the darker accent text,
                    // exact oklch values from the mockup (not the theme's
                    // --sidebar-accent/--sidebar-accent-foreground tokens).
                    "data-active:bg-[oklch(0.62_0.19_45/0.10)] data-active:text-[oklch(0.45_0.15_45)] data-active:font-medium",
                  )}
                >
                  <Icon />
                  {label}
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
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
  esAdmin,
  tenantSlug,
  plan,
}: {
  esAdmin: boolean;
  tenantSlug: string;
  plan: SidebarPlanInfo | null;
}) {
  const pathname = usePathname();

  return (
    <div className="dark">
      <Sidebar>
        <SidebarHeader className="px-2 py-3">
          <div className="flex items-center gap-2.5 px-1">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary">
              <Wrench className="size-4 text-primary-foreground" />
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold text-sidebar-foreground">TorqueFlow</span>
              <span className="truncate font-mono text-[0.6875rem] text-sidebar-foreground/50">{tenantSlug}</span>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <NavGroupSection group={OPERACION} pathname={pathname} />
          <NavGroupSection group={INVENTARIO} pathname={pathname} />
          {esAdmin ? <NavGroupSection group={ADMINISTRACION} pathname={pathname} /> : null}
        </SidebarContent>
        {plan ? (
          <SidebarFooter className="gap-2 border-t border-sidebar-border px-3 py-3">
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
