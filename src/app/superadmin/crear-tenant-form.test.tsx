import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCrearTenantAction = vi.fn();
vi.mock("@/app/actions/super-admin-actions", () => ({
  crearTenantAction: (...args: unknown[]) => mockCrearTenantAction(...args),
}));

import { CrearTenantForm } from "./crear-tenant-form";

const PLANES = [
  { id: "plan_basico", nombre: "Básico" },
  { id: "plan_avanzado", nombre: "Avanzado" },
];

describe("CrearTenantForm", () => {
  beforeEach(() => {
    mockCrearTenantAction.mockReset().mockResolvedValue({ error: null, credenciales: null });
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  afterEach(() => {
    cleanup();
  });

  it("auto-generates the slug from the nombre field until the user edits slug by hand", async () => {
    render(<CrearTenantForm planes={PLANES} />);

    const nombreInput = screen.getByLabelText("Nombre del tenant *");
    const slugInput = screen.getByLabelText("Slug del tenant (identificador interno) *") as HTMLInputElement;

    await userEvent.type(nombreInput, "Taller Familiar Gómez");
    expect(slugInput.value).toBe("taller-familiar-gomez");

    await userEvent.clear(slugInput);
    await userEvent.type(slugInput, "mi-slug-manual");
    await userEvent.type(nombreInput, " S.A.S");

    expect(slugInput.value).toBe("mi-slug-manual");
  });

  it("does not show the credentials dialog before a successful submit", () => {
    render(<CrearTenantForm planes={PLANES} />);

    expect(screen.queryByText("✅ Cliente creado exitosamente")).not.toBeInTheDocument();
  });

  it("shows the credentials dialog with a 'Copiar' button after a successful submit", async () => {
    mockCrearTenantAction.mockResolvedValue({
      error: null,
      credenciales: { email: "admin@tallerfamiliar.test", password: "X9k#mP2qL5nR" },
    });

    render(<CrearTenantForm planes={PLANES} />);

    await userEvent.type(screen.getByLabelText("Nombre del tenant *"), "Taller Familiar Gómez");
    await userEvent.type(screen.getByLabelText("Email del admin del taller *"), "admin@tallerfamiliar.test");
    await userEvent.type(screen.getByLabelText("Nombre del administrador responsable *"), "Juan Pérez");
    await userEvent.click(screen.getByRole("button", { name: "Crear cliente" }));

    await waitFor(() => expect(screen.getByText("✅ Cliente creado exitosamente")).toBeInTheDocument());
    expect(screen.getByDisplayValue("X9k#mP2qL5nR")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Copiar" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("X9k#mP2qL5nR");
  });
});
