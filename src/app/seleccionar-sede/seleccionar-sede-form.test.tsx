import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockSeleccionarSedeAction = vi.fn();
const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock("@/app/actions/seleccionar-sede-actions", () => ({
  seleccionarSedeAction: (...args: unknown[]) => mockSeleccionarSedeAction(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush, refresh: mockRefresh }) }));

import { SeleccionarSedeForm } from "./seleccionar-sede-form";

const SEDES = [
  { id: "sede-1", nombre: "Sede principal" },
  { id: "sede-2", nombre: "Sede norte" },
];

describe("SeleccionarSedeForm", () => {
  beforeEach(() => {
    mockSeleccionarSedeAction.mockReset();
    mockPush.mockReset();
    mockRefresh.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("submits the chosen sedeId to seleccionarSedeAction", async () => {
    mockSeleccionarSedeAction.mockResolvedValue({ error: null });
    render(<SeleccionarSedeForm sedes={SEDES} />);

    await userEvent.selectOptions(screen.getByLabelText("Sede"), "sede-2");
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(mockSeleccionarSedeAction).toHaveBeenCalledWith("sede-2");
  });

  it("defaults to the first sede when the user does not touch the select", async () => {
    mockSeleccionarSedeAction.mockResolvedValue({ error: null });
    render(<SeleccionarSedeForm sedes={SEDES} />);

    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(mockSeleccionarSedeAction).toHaveBeenCalledWith("sede-1");
  });

  it("redirects to / and refreshes the router cache after a successful selection", async () => {
    mockSeleccionarSedeAction.mockResolvedValue({ error: null });
    render(<SeleccionarSedeForm sedes={SEDES} />);

    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

    // router.refresh() matters here: "/" was already visited once by
    // this same navigation cycle (requireSession() redirected here from
    // "/" because sedeActivaId was still empty) -- without it, the
    // client Router Cache can serve that earlier redirect instead of
    // re-fetching with the now-updated session cookie.
    expect(mockPush).toHaveBeenCalledWith("/");
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("shows the returned error and does not navigate", async () => {
    mockSeleccionarSedeAction.mockResolvedValue({ error: "Sede inválida." });
    render(<SeleccionarSedeForm sedes={SEDES} />);

    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Sede inválida.");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("explains the problem and disables submission when there are no sedes to choose from", () => {
    render(<SeleccionarSedeForm sedes={[]} />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "No tienes ninguna sede asignada. Contacta al administrador.",
    );
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
  });
});
