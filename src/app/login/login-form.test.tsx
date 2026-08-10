import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockSignIn = vi.fn();
const mockPush = vi.fn();

vi.mock("next-auth/react", () => ({ signIn: (...args: unknown[]) => mockSignIn(...args) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

import { LoginForm } from "./login-form";

describe("LoginForm", () => {
  beforeEach(() => {
    mockSignIn.mockReset();
    mockPush.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("submits email and password to signIn with the credentials provider", async () => {
    mockSignIn.mockResolvedValue({ ok: true, error: null });
    render(<LoginForm />);

    await userEvent.type(screen.getByLabelText("Correo"), "admin@taller-perez.test");
    await userEvent.type(screen.getByLabelText("Contraseña"), "SuperSecret123!");
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(mockSignIn).toHaveBeenCalledWith("credentials", {
      email: "admin@taller-perez.test",
      password: "SuperSecret123!",
      redirect: false,
    });
  });

  it("redirects to /clientes after a successful login", async () => {
    mockSignIn.mockResolvedValue({ ok: true, error: null });
    render(<LoginForm />);

    await userEvent.type(screen.getByLabelText("Correo"), "admin@taller-perez.test");
    await userEvent.type(screen.getByLabelText("Contraseña"), "SuperSecret123!");
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(mockPush).toHaveBeenCalledWith("/clientes");
  });

  it("shows an error message when signIn fails", async () => {
    mockSignIn.mockResolvedValue({ ok: false, error: "CredentialsSignin" });
    render(<LoginForm />);

    await userEvent.type(screen.getByLabelText("Correo"), "admin@taller-perez.test");
    await userEvent.type(screen.getByLabelText("Contraseña"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Correo o contraseña incorrectos");
  });
});
