"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  BarChart3,
  ChevronRight,
  CalendarDays,
  Coins,
  CreditCard,
  FileCheck,
  FileSpreadsheet,
  FileText,
  HandCoins,
  History,
  Home,
  Landmark,
  ListChecks,
  MapPin,
  Package,
  PackagePlus,
  Receipt,
  Settings,
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
  /** Otras rutas en las que el ítem se marca como la página actual. */
  tambienActivoEn?: string[];
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

// Los grupos siguen el día del taller: lo diario arriba, en el orden en que
// avanza el trabajo (cita → cotización → orden), y lo que se configura una vez
// al final, en un grupo plegable que arranca cerrado.
const TALLER: NavGroup = {
  label: "Taller",
  items: [
    { href: "/citas", label: "Citas", icon: CalendarDays },
    { href: "/cotizaciones", label: "Cotizaciones", icon: FileText },
    { href: "/ordenes", label: "Órdenes", icon: Wrench },
    { href: "/vencimientos", label: "Vencimientos", icon: ShieldAlert },
    { href: "/clientes", label: "Clientes", icon: Users },
  ],
};

const VENTAS: NavGroup = {
  label: "Ventas y plata",
  items: [
    MOSTRADOR,
    { href: "/facturas", label: "Facturas", icon: Receipt, permiso: "facturas.ver" },
    CAJA,
    CARTERA,
    CUENTAS_POR_PAGAR,
    GASTOS,
  ],
};

const INVENTARIO: NavGroup = {
  label: "Inventario",
  items: [
    { href: "/repuestos", label: "Repuestos", icon: Package },
    { href: "/pedidos-compra", label: "Pedidos", icon: ClipboardList },
    { href: "/entradas-mercancia", label: "Entradas", icon: PackagePlus },
    { href: "/proveedores", label: "Proveedores", icon: Truck },
  ],
};

const INFORMES: NavGroup = {
  label: "Informes",
  items: [
    { href: "/reportes", label: "Reportes", icon: BarChart3, permiso: "reportes.productividad" },
    { href: "/liquidaciones", label: "Liquidaciones", icon: Coins, permiso: "liquidaciones.gestionar" },
  ],
};

const CONFIGURACION: NavGroup = {
  label: "Configuración",
  items: [
    {
      href: "/configuracion-smtp",
      label: "Configuración del taller",
      icon: Settings,
      permiso: "configuracion.taller",
      // Correo y avisos, Tarifas de IVA y Facturación electrónica son pestañas de la misma página.
      tambienActivoEn: ["/configuracion-iva", "/configuracion-factura-electronica"],
    },
    {
      href: "/configuracion-factura-electronica",
      label: "Facturación electrónica",
      icon: FileCheck,
      permiso: "facturaElectronica.configurar",
    },
    SERVICIOS,
    { href: "/bodegas", label: "Bodegas", icon: Warehouse },
    { href: "/sedes", label: "Sedes", icon: MapPin, permiso: "sedes.gestionar" },
    { href: "/usuarios", label: "Usuarios", icon: UserCog, permiso: "usuarios.gestionar" },
    IMPORTAR,
    { href: "/auditoria", label: "Auditoría", icon: History, permiso: "auditoria.ver" },
  ],
};

function isActiveHref(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function itemActivo(pathname: string, item: NavItem): boolean {
  return [item.href, ...(item.tambienActivoEn ?? [])].some((href) => isActiveHref(pathname, href));
}

// Fase 11-14: the mockup's active nav item is NOT the generic shadcn dark
// --sidebar-accent grey -- it's the brand accent at 10% opacity, exact oklch
// value from the mockup (not the theme's --sidebar-accent token). Text is
// plain white rather than the mockup's darker accent tint: against the dark
// sidebar background that darker tint read as low-contrast/muted, and white
// keeps the active label clearly the brightest text in the list.
const ACTIVE_ITEM_CLASSNAME = "data-active:bg-[oklch(0.62_0.19_45/0.10)] data-active:text-white data-active:font-medium";

function NavItemButton({ pathname, badgeCount, ...item }: NavItem & { pathname: string }) {
  const { href, label, icon: Icon } = item;
  const active = itemActivo(pathname, item);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        render={<Link href={href} aria-current={active ? "page" : undefined} />}
        className={cn(ACTIVE_ITEM_CLASSNAME)}
      >
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
   * the static nav groups into something
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

/**
 * Grupo plegable para lo que se configura una vez. Arranca cerrado salvo que la
 * página actual esté adentro. Con el menú reducido a íconos no hay título que
 * tocar, así que los ítems se muestran siempre.
 */
function NavGroupPlegable({ group, pathname }: { group: NavGroup; pathname: string }) {
  const contieneActual = group.items.some((item) => itemActivo(pathname, item));
  const [abierto, setAbierto] = useState(contieneActual);
  const [rutaVista, setRutaVista] = useState(pathname);
  // Al entrar a una página del grupo desde otro lado (un enlace en la página), se abre.
  if (rutaVista !== pathname) {
    setRutaVista(pathname);
    if (contieneActual && !abierto) setAbierto(true);
  }
  const listaId = useId();
  return (
    <SidebarGroup className="mt-auto border-t border-sidebar-border">
      <SidebarGroupLabel
        render={<button type="button" aria-expanded={abierto} aria-controls={listaId} onClick={() => setAbierto(!abierto)} />}
        className="w-full cursor-pointer gap-1.5 text-[0.6875rem] font-medium tracking-wider text-sidebar-foreground/50 uppercase hover:text-sidebar-foreground/80"
      >
        <ChevronRight aria-hidden="true" className={cn("transition-transform", abierto && "rotate-90")} />
        <span className="flex-1 text-left">{group.label}</span>
      </SidebarGroupLabel>
      <SidebarGroupContent id={listaId} className={cn(!abierto && "hidden group-data-[collapsible=icon]:block")}>
        <SidebarMenu>
          {group.items.map((item) => (
            <NavItemButton key={item.href} {...item} pathname={pathname} />
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
  const taller = visibles(TALLER);
  const ventas = visibles(VENTAS);
  const inventario = visibles(INVENTARIO);
  const informes = visibles(INFORMES);
  const configuracion = visibles(CONFIGURACION);

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
          {taller.items.length > 0 ? (
            <NavGroupSection
              group={taller}
              pathname={pathname}
              badgeCountByHref={{
                "/cotizaciones": cotizacionesPendientesSeguimiento,
                "/ordenes": ordenesEnTaller,
                "/citas": citasHoy,
              }}
            />
          ) : null}
          {ventas.items.length > 0 ? (
            <NavGroupSection group={ventas} pathname={pathname} badgeCountByHref={{ "/facturas": facturasPendientes }} />
          ) : null}
          {inventario.items.length > 0 ? (
            <NavGroupSection
              group={inventario}
              pathname={pathname}
              badgeCountByHref={{ "/repuestos": repuestosStockBajo }}
            />
          ) : null}
          {informes.items.length > 0 ? <NavGroupSection group={informes} pathname={pathname} /> : null}
          {configuracion.items.length > 0 ? <NavGroupPlegable group={configuracion} pathname={pathname} /> : null}
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
