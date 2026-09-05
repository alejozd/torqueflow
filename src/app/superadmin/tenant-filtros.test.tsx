import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockPush = vi.fn();
const mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/superadmin",
  useSearchParams: () => mockSearchParams,
}));

import { TenantFiltros } from "./tenant-filtros";

const PLANES = [
  { id: "plan_basico", nombre: "Básico" },
  { id: "plan_avanzado", nombre: "Avanzado" },
];

describe("TenantFiltros", () => {
  beforeEach(() => {
    mockPush.mockReset();
    [...mockSearchParams.keys()].forEach((key) => mockSearchParams.delete(key));
  });

  it("navega con el parametro estado cuando se elige un estado", async () => {
    render(<TenantFiltros planes={PLANES} />);

    const triggers = screen.getAllByRole("combobox");
    await userEvent.click(triggers[0]!);
    await userEvent.click(await screen.findByRole("option", { name: "Suspendido" }));

    expect(mockPush).toHaveBeenCalledWith("/superadmin?estado=SUSPENDIDO");
  });

  it("navega con el parametro planId cuando se elige un plan", async () => {
    render(<TenantFiltros planes={PLANES} />);

    const triggers = screen.getAllByRole("combobox");
    await userEvent.click(triggers[1]!);
    await userEvent.click(await screen.findByRole("option", { name: "Avanzado" }));

    expect(mockPush).toHaveBeenCalledWith("/superadmin?planId=plan_avanzado");
  });
});
