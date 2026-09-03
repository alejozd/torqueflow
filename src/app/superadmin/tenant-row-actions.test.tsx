import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCambiarEstadoTenantAction = vi.fn();
const mockCambiarPlanTenantAction = vi.fn();
vi.mock("@/app/actions/super-admin-actions", () => ({
  cambiarEstadoTenantAction: (...args: unknown[]) => mockCambiarEstadoTenantAction(...args),
  cambiarPlanTenantAction: (...args: unknown[]) => mockCambiarPlanTenantAction(...args),
}));

import { TenantRowActions } from "./tenant-row-actions";

const PLANES = [
  { id: "plan_basico", nombre: "Básico" },
  { id: "plan_estandar", nombre: "Estándar" },
  { id: "plan_avanzado", nombre: "Avanzado" },
];

describe("TenantRowActions", () => {
  beforeEach(() => {
    mockCambiarEstadoTenantAction.mockReset().mockResolvedValue({ error: null, success: false });
    mockCambiarPlanTenantAction.mockReset().mockResolvedValue({ error: null, success: false });
  });

  it("offers 'Suspender' for an ACTIVO tenant and 'Activar' for a SUSPENDIDO one", () => {
    const { rerender } = render(
      <TenantRowActions tenantId="t1" estadoActual="ACTIVO" planIdActual="plan_basico" planes={PLANES} />,
    );
    expect(screen.getByRole("button", { name: "Suspender" })).toBeInTheDocument();

    rerender(<TenantRowActions tenantId="t1" estadoActual="SUSPENDIDO" planIdActual="plan_basico" planes={PLANES} />);
    expect(screen.getByRole("button", { name: "Activar" })).toBeInTheDocument();
  });

  it("submits the new plan when the select changes and the form is submitted", async () => {
    render(<TenantRowActions tenantId="t1" estadoActual="ACTIVO" planIdActual="plan_basico" planes={PLANES} />);

    const trigger = screen.getByRole("combobox", { name: "Plan" });
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("option", { name: "Estándar" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar plan" }));

    expect(mockCambiarPlanTenantAction).toHaveBeenCalledWith("t1", expect.anything(), expect.any(FormData));
    const formData = mockCambiarPlanTenantAction.mock.calls[0][2] as FormData;
    expect(formData.get("planId")).toBe("plan_estandar");
  });
});
