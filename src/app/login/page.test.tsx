import { describe, expect, it, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import LoginPage from "./page";

describe("LoginPage", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the tenant-mismatch message when ?error=tenant-mismatch is present", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ error: "tenant-mismatch" }) }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tu sesión no corresponde a este taller. Vuelve a iniciar sesión.",
    );
  });

  it("shows the forbidden message when ?error=forbidden is present", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ error: "forbidden" }) }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No tienes permiso para acceder a esa sección.",
    );
  });

  it("shows no alert when no error param is present", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({}) }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows no alert for an unrecognized error code", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ error: "bogus" }) }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders only email and password fields (Fase 10: no pre-login sede)", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByLabelText("Correo")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
    expect(screen.queryByLabelText("Sede")).not.toBeInTheDocument();
  });
});
