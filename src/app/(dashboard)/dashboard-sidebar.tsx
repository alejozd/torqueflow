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
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

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
      <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {group.items.map(({ href, label, icon: Icon }) => (
            <SidebarMenuItem key={href}>
              <SidebarMenuButton isActive={isActiveHref(pathname, href)} render={<Link href={href} />}>
                <Icon />
                {label}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function DashboardSidebar({ esAdmin }: { esAdmin: boolean }) {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Wrench className="size-5 text-primary" />
          <span className="text-sm font-semibold">TorqueFlow</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <NavGroupSection group={OPERACION} pathname={pathname} />
        <NavGroupSection group={INVENTARIO} pathname={pathname} />
        {esAdmin ? <NavGroupSection group={ADMINISTRACION} pathname={pathname} /> : null}
      </SidebarContent>
    </Sidebar>
  );
}
