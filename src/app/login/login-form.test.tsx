import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockSignIn = vi.fn();
const mockPush = vi.fn();

vi.mock("next-auth/react", () => ({ signIn: (...args: unknown[]) => mockSignIn(...args) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

import { LoginForm } from "./login-form";

const SEDES = [
  { id: "sede-1", nombre: "Sede principal" },
  { id: "sede-2", nombre: "Sede norte" },
];

describe("LoginForm", () => {
  beforeEach(() => {
    mockSignIn.mockReset();
    mockPush.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("submits email, password and the chosen sedeId to signIn", async () => {
    mockSignIn.mockResolvedValue({ ok: true, error: null });
    render(<LoginForm sedes={SEDES} />);

    await userEvent.type(screen.getByLabelText("Correo"), "admin@taller-perez.test");
    await userEvent.type(screen.getByLabelText("Contraseña"), "SuperSecret123!");
    await userEvent.selectOptions(screen.getByLabelText("Sede"), "sede-2");
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(mockSignIn).toHaveBeenCalledWith("credentials", {
      email: "admin@taller-perez.test",
      password: "SuperSecret123!",
      sedeId: "sede-2",
      redirect: false,
    });
  });

  it("defaults to the first sede when the user does not touch the select", async () => {
    mockSignIn.mockResolvedValue({ ok: true, error: null });
    render(<LoginForm sedes={SEDES} />);

    await userEvent.type(screen.getByLabelText("Correo"), "admin@taller-perez.test");
    await userEvent.type(screen.getByLabelText("Contraseña"), "SuperSecret123!");
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(mockSignIn).toHaveBeenCalledWith(
      "credentials",
      expect.objectContaining({ sedeId: "sede-1" }),
    );
  });

  it("redirects to /clientes after a successful login", async () => {
    mockSignIn.mockResolvedValue({ ok: true, error: null });
    render(<LoginForm sedes={SEDES} />);

    await userEvent.type(screen.getByLabelText("Correo"), "admin@taller-perez.test");
    await userEvent.type(screen.getByLabelText("Contraseña"), "SuperSecret123!");
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(mockPush).toHaveBeenCalledWith("/clientes");
  });

  it("shows one uniform error when signIn fails, without saying which field was wrong", async () => {
    mockSignIn.mockResolvedValue({ ok: false, error: "CredentialsSignin" });
    render(<LoginForm sedes={SEDES} />);

    await userEvent.type(screen.getByLabelText("Correo"), "admin@taller-perez.test");
    await userEvent.type(screen.getByLabelText("Contraseña"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Correo, contraseña o sede incorrectos");
  });

  it("explains the problem and disables submission when the taller has no sedes", () => {
    render(<LoginForm sedes={[]} />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Este taller no tiene sedes configuradas. Contacta al administrador.",
    );
    expect(screen.getByRole("button", { name: "Ingresar" })).toBeDisabled();
  });
});
