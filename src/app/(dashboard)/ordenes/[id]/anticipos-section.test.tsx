import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRegistrar = vi.fn();
const mockDevolver = vi.fn();
const mockRefresh = vi.fn();
vi.mock("@/app/actions/anticipo-actions", () => ({
  registrarAnticipoAction: (...a: unknown[]) => mockRegistrar(...a),
  devolverAnticipoAction: (...a: unknown[]) => mockDevolver(...a),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AnticiposSection } from "./anticipos-section";

const PENDIENTE = {
  id: "a1",
  monto: 50000,
  metodoPago: "EFECTIVO" as const,
  referencia: null,
  estado: "PENDIENTE" as const,
  createdAt: new Date("2026-10-10T15:00:00Z"),
  registradoPorNombre: "Ana",
};

function renderSection(props: Partial<React.ComponentProps<typeof AnticiposSection>> = {}) {
  return render(
    <AnticiposSection
      ordenId="o1"
      anticipos={[PENDIENTE]}
      puedeRegistrar
      puedeDevolver
      ordenAnulada={false}
      {...props}
    />,
  );
}

describe("AnticiposSection", () => {
  beforeEach(() => {
    mockRegistrar.mockReset();
    mockDevolver.mockReset();
    mockRefresh.mockReset();
  });

  it("lists anticipos with estado and registrador", () => {
    renderSection();
    expect(screen.getByText("Pendiente")).toBeInTheDocument();
    expect(screen.getByText(/Ana/)).toBeInTheDocument();
  });

  it("registers an anticipo with the default EFECTIVO method", async () => {
    mockRegistrar.mockResolvedValue({ error: null, success: true });
    renderSection({ anticipos: [] });

    await userEvent.type(screen.getByLabelText("Monto"), "25000");
    await userEvent.click(screen.getByRole("button", { name: "Registrar anticipo" }));

    await vi.waitFor(() => expect(mockRegistrar).toHaveBeenCalled());
    const [ordenId, , formData] = mockRegistrar.mock.calls[0];
    expect(ordenId).toBe("o1");
    expect(formData.get("monto")).toBe("25000");
    expect(formData.get("metodoPago")).toBe("EFECTIVO");
    await vi.waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it("shows the action error", async () => {
    mockRegistrar.mockResolvedValue({ error: "La orden ya está facturada", success: false });
    renderSection({ anticipos: [] });

    await userEvent.type(screen.getByLabelText("Monto"), "10");
    await userEvent.click(screen.getByRole("button", { name: "Registrar anticipo" }));

    expect(await screen.findByText("La orden ya está facturada")).toBeInTheDocument();
  });

  it("hides the form when registering is not allowed", () => {
    renderSection({ puedeRegistrar: false });
    expect(screen.queryByRole("button", { name: "Registrar anticipo" })).not.toBeInTheDocument();
  });

  it("asks for confirmation before returning an anticipo", async () => {
    mockDevolver.mockResolvedValue({ error: null, success: true });
    renderSection();

    await userEvent.click(screen.getByRole("button", { name: "Devolver" }));
    expect(mockDevolver).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Sí, devolver" }));

    await vi.waitFor(() => expect(mockDevolver).toHaveBeenCalled());
    const [anticipoId, , formData] = mockDevolver.mock.calls[0];
    expect(anticipoId).toBe("a1");
    expect(formData.get("metodoDevolucion")).toBe("EFECTIVO");
  });

  it("'No' cancels the return", async () => {
    renderSection();
    await userEvent.click(screen.getByRole("button", { name: "Devolver" }));
    await userEvent.click(screen.getByRole("button", { name: "No" }));
    expect(mockDevolver).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Devolver" })).toBeInTheDocument();
  });

  it("does not offer Devolver to non-admins nor for non-pending anticipos", () => {
    const { unmount } = renderSection({ puedeDevolver: false });
    expect(screen.queryByRole("button", { name: "Devolver" })).not.toBeInTheDocument();
    unmount();
    renderSection({ anticipos: [{ ...PENDIENTE, estado: "APLICADO" }] });
    expect(screen.queryByRole("button", { name: "Devolver" })).not.toBeInTheDocument();
  });

  it("warns about pending anticipos on an ANULADA orden", () => {
    renderSection({ ordenAnulada: true, puedeRegistrar: false });
    expect(screen.getByText("Hay anticipos por devolver")).toBeInTheDocument();
  });
});
