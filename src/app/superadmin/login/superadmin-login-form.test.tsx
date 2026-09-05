import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockSignIn = vi.fn();
const mockPush = vi.fn();
vi.mock("next-auth/react", () => ({ signIn: (...args: unknown[]) => mockSignIn(...args) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

import { SuperAdminLoginForm } from "./superadmin-login-form";

describe("SuperAdminLoginForm", () => {
  beforeEach(() => {
    mockSignIn.mockReset();
    mockPush.mockReset();
  });

  it("redirects to /superadmin on a successful sign-in", async () => {
    mockSignIn.mockResolvedValue({ ok: true, error: undefined });
    render(<SuperAdminLoginForm />);

    await userEvent.type(screen.getByLabelText("Correo institucional"), "owner@torqueflow.test");
    await userEvent.type(screen.getByLabelText("Contraseña maestra"), "clave-larga-segura");
    await userEvent.click(screen.getByRole("button", { name: /Ingresar/ }));

    expect(mockSignIn).toHaveBeenCalledWith("credentials", {
      email: "owner@torqueflow.test",
      password: "clave-larga-segura",
      redirect: false,
    });
    expect(mockPush).toHaveBeenCalledWith("/superadmin");
  });

  it("shows one generic error on failure, never distinguishing wrong email from wrong password", async () => {
    // NextAuth's real credentials callback responds HTTP 200 (ok: true) even
    // when the credentials are wrong -- `error` is what actually signals
    // failure. This mock reflects that real shape, not a 4xx-style failure.
    mockSignIn.mockResolvedValue({ ok: true, error: "CredentialsSignin" });
    render(<SuperAdminLoginForm />);

    await userEvent.type(screen.getByLabelText("Correo institucional"), "owner@torqueflow.test");
    await userEvent.type(screen.getByLabelText("Contraseña maestra"), "incorrecta");
    await userEvent.click(screen.getByRole("button", { name: /Ingresar/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Correo o contraseña incorrectos");
  });

  it("toggles the password field between hidden and visible text", async () => {
    render(<SuperAdminLoginForm />);

    const passwordInput = screen.getByLabelText("Contraseña maestra");
    expect(passwordInput).toHaveAttribute("type", "password");

    await userEvent.click(screen.getByRole("button", { name: /Mostrar/ }));
    expect(passwordInput).toHaveAttribute("type", "text");

    await userEvent.click(screen.getByRole("button", { name: /Ocultar/ }));
    expect(passwordInput).toHaveAttribute("type", "password");
  });
});
