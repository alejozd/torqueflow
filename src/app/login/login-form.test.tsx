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

  it("submits only email and password to signIn (Fase 10: no pre-login sede)", async () => {
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

  it("has no sede field", () => {
    render(<LoginForm />);

    expect(screen.queryByLabelText("Sede")).not.toBeInTheDocument();
  });

  it("redirects to /clientes after a successful login", async () => {
    mockSignIn.mockResolvedValue({ ok: true, error: null });
    render(<LoginForm />);

    await userEvent.type(screen.getByLabelText("Correo"), "admin@taller-perez.test");
    await userEvent.type(screen.getByLabelText("Contraseña"), "SuperSecret123!");
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(mockPush).toHaveBeenCalledWith("/clientes");
  });

  it("shows one uniform error when signIn fails, without saying which field was wrong", async () => {
    // NextAuth's real credentials callback responds HTTP 200 (ok: true) even
    // when the credentials are wrong -- `error` is what actually signals
    // failure. This mock reflects that real shape, not a 4xx-style failure.
    mockSignIn.mockResolvedValue({ ok: true, error: "CredentialsSignin" });
    render(<LoginForm />);

    await userEvent.type(screen.getByLabelText("Correo"), "admin@taller-perez.test");
    await userEvent.type(screen.getByLabelText("Contraseña"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Correo o contraseña incorrectos");
  });
});
