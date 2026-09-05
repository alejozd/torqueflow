import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCambiarEstadoTenantAction = vi.fn();
const mockCambiarPlanTenantAction = vi.fn();
vi.mock("@/app/actions/super-admin-actions", () => ({
  cambiarEstadoTenantAction: (...args: unknown[]) => mockCambiarEstadoTenantAction(...args),
  cambiarPlanTenantAction: (...args: unknown[]) => mockCambiarPlanTenantAction(...args),
}));

import { EstadoTenantButton, PlanTenantSelector } from "./tenant-row-actions";

const PLANES = [
  { id: "plan_basico", nombre: "Básico" },
  { id: "plan_estandar", nombre: "Estándar" },
  { id: "plan_avanzado", nombre: "Avanzado" },
];

describe("EstadoTenantButton", () => {
  beforeEach(() => {
    mockCambiarEstadoTenantAction.mockReset().mockResolvedValue({ error: null, success: false });
  });

  it("offers 'Suspender' for an ACTIVO tenant and 'Activar' for a SUSPENDIDO one", () => {
    const { rerender } = render(<EstadoTenantButton tenantId="t1" estadoActual="ACTIVO" />);
    expect(screen.getByRole("button", { name: "Suspender" })).toBeInTheDocument();

    rerender(<EstadoTenantButton tenantId="t1" estadoActual="SUSPENDIDO" />);
    expect(screen.getByRole("button", { name: "Activar" })).toBeInTheDocument();
  });
});

describe("PlanTenantSelector", () => {
  beforeEach(() => {
    mockCambiarPlanTenantAction.mockReset().mockResolvedValue({ error: null, success: false });
  });

  it("submits the new plan when the select changes and the form is submitted", async () => {
    render(<PlanTenantSelector tenantId="t1" planIdActual="plan_basico" planes={PLANES} />);

    const trigger = screen.getByRole("combobox", { name: "Plan" });
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("option", { name: "Estándar" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(mockCambiarPlanTenantAction).toHaveBeenCalledWith("t1", expect.anything(), expect.any(FormData));
    const formData = mockCambiarPlanTenantAction.mock.calls[0][2] as FormData;
    expect(formData.get("planId")).toBe("plan_estandar");
  });
});
