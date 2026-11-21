import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

let rutaActual = "/";
vi.mock("next/navigation", () => ({ usePathname: () => rutaActual }));

import { DashboardSidebar } from "./dashboard-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { permisosEfectivos, type Role } from "@/lib/auth/permisos";

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  })) as typeof window.matchMedia;
});

beforeEach(() => {
  rutaActual = "/";
});

function renderMenu(role: Role) {
  return render(
    <SidebarProvider>
      <DashboardSidebar permisos={permisosEfectivos({ role })} tenantSlug="taller" plan={null} />
    </SidebarProvider>,
  );
}

const visible = (name: string) => screen.queryByRole("link", { name }) !== null;
const botonConfiguracion = () => screen.getByRole("button", { name: "Configuración" });

describe("DashboardSidebar", () => {
  it("TECNICO no ve Mostrador, Caja ni Usuarios ni Facturas (D8)", () => {
    renderMenu("TECNICO");
    expect(visible("Mostrador")).toBe(false);
    expect(visible("Caja")).toBe(false);
    expect(visible("Usuarios")).toBe(false);
    expect(visible("Facturas")).toBe(false);
    expect(visible("Servicios")).toBe(false);
    expect(visible("Importar")).toBe(false);
    expect(visible("Configuración del taller")).toBe(false);
    expect(screen.queryByText("Ventas y plata")).toBeNull();
    expect(screen.queryByText("Informes")).toBeNull();
  });

  it("RECEPCION ve Importar y el dinero, no Usuarios ni Servicios", () => {
    renderMenu("RECEPCION");
    expect(visible("Importar")).toBe(true);
    expect(visible("Mostrador")).toBe(true);
    expect(visible("Caja")).toBe(true);
    expect(visible("Gastos")).toBe(true);
    expect(visible("Usuarios")).toBe(false);
    expect(visible("Servicios")).toBe(false);
    expect(visible("Reportes")).toBe(false);
    expect(screen.getByText("Ventas y plata")).toBeInTheDocument();
  });

  it("ADMIN ve todo: lo diario arriba en el orden del trabajo y la configuración al final", () => {
    renderMenu("ADMIN");
    for (const n of ["Mostrador", "Caja", "Cartera", "Cuentas por pagar", "Gastos", "Facturas", "Servicios", "Importar", "Reportes", "Liquidaciones", "Sedes", "Usuarios", "Auditoría", "Configuración del taller"]) {
      expect(visible(n)).toBe(true);
    }
    expect(visible("SMTP")).toBe(false);
    expect(visible("Tarifas de IVA")).toBe(false);
    const nombres = screen.getAllByRole("link").map((a) => a.textContent);
    expect(nombres.indexOf("Citas")).toBeLessThan(nombres.indexOf("Cotizaciones"));
    expect(nombres.indexOf("Cotizaciones")).toBeLessThan(nombres.indexOf("Órdenes"));
    expect(nombres.indexOf("Clientes")).toBeLessThan(nombres.indexOf("Mostrador"));
    expect(nombres.indexOf("Gastos")).toBeLessThan(nombres.indexOf("Repuestos"));
    expect(nombres.indexOf("Proveedores")).toBeLessThan(nombres.indexOf("Reportes"));
    expect(nombres.indexOf("Liquidaciones")).toBeLessThan(nombres.indexOf("Configuración del taller"));
    expect(nombres.indexOf("Configuración del taller")).toBeLessThan(nombres.indexOf("Bodegas"));
  });

  it("Configuración arranca cerrada y se abre al tocarla", () => {
    renderMenu("ADMIN");
    expect(botonConfiguracion()).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(botonConfiguracion());
    expect(botonConfiguracion()).toHaveAttribute("aria-expanded", "true");
  });

  it("en Tarifas de IVA, Configuración está abierta y marca Configuración del taller", () => {
    rutaActual = "/configuracion-iva";
    renderMenu("ADMIN");
    expect(botonConfiguracion()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Configuración del taller" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Inicio" })).not.toHaveAttribute("aria-current");
  });

  it("Facturación electrónica: el ADMIN la ve; RECEPCION solo con el permiso agregado", () => {
    rutaActual = "/configuracion-factura-electronica";
    const { unmount } = renderMenu("ADMIN");
    expect(visible("Facturación electrónica")).toBe(true);
    unmount();

    renderMenu("RECEPCION");
    expect(visible("Facturación electrónica")).toBe(false);
  });

  it("RECEPCION con el permiso agregado ve Facturación electrónica", () => {
    rutaActual = "/configuracion-factura-electronica";
    render(
      <SidebarProvider>
        <DashboardSidebar
          permisos={permisosEfectivos({ role: "RECEPCION", agregados: ["facturaElectronica.configurar"] })}
          tenantSlug="taller"
          plan={null}
        />
      </SidebarProvider>,
    );
    expect(visible("Facturación electrónica")).toBe(true);
  });
});
