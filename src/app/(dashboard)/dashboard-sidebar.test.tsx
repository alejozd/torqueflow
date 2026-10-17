import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

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

function renderMenu(role: Role) {
  return render(
    <SidebarProvider>
      <DashboardSidebar permisos={permisosEfectivos({ role })} tenantSlug="taller" plan={null} />
    </SidebarProvider>,
  );
}

const visible = (name: string) => screen.queryByRole("link", { name }) !== null;

describe("DashboardSidebar", () => {
  it("TECNICO no ve Mostrador, Caja ni Usuarios, pero sí Facturas", () => {
    renderMenu("TECNICO");
    expect(visible("Mostrador")).toBe(false);
    expect(visible("Caja")).toBe(false);
    expect(visible("Usuarios")).toBe(false);
    expect(visible("Facturas")).toBe(true);
    expect(visible("Servicios")).toBe(false);
    expect(visible("Importar")).toBe(false);
    expect(screen.queryByText("Administración")).toBeNull();
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
    expect(screen.getByText("Administración")).toBeInTheDocument();
  });

  it("ADMIN ve todo en el orden de siempre", () => {
    renderMenu("ADMIN");
    for (const n of ["Mostrador", "Caja", "Cartera", "Cuentas por pagar", "Gastos", "Facturas", "Servicios", "Importar", "Reportes", "Liquidaciones", "Sedes", "Usuarios", "Auditoría", "SMTP"]) {
      expect(visible(n)).toBe(true);
    }
    const nombres = screen.getAllByRole("link").map((a) => a.textContent);
    expect(nombres.indexOf("Facturas")).toBeLessThan(nombres.indexOf("Mostrador"));
    expect(nombres.indexOf("Gastos")).toBeLessThan(nombres.indexOf("Bodegas"));
    expect(nombres.indexOf("Repuestos")).toBeLessThan(nombres.indexOf("Servicios"));
    expect(nombres.indexOf("SMTP")).toBeLessThan(nombres.indexOf("Importar"));
  });
});
