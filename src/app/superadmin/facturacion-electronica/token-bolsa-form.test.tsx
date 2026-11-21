import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/app/actions/super-admin-fe-actions", () => ({ registrarTokenBolsaAction: vi.fn() }));

import { TokenBolsaForm } from "./token-bolsa-form";

afterEach(cleanup);

describe("TokenBolsaForm", () => {
  it("con token registrado avisa y deja el campo vacío", () => {
    render(<TokenBolsaForm tenantId="t1" tokenRegistrado={true} />);
    expect(screen.getByText("Ya hay un token registrado; escribe uno nuevo para cambiarlo.")).toBeTruthy();
    const campo = screen.getByLabelText("Token de la bolsa") as HTMLInputElement;
    expect(campo.type).toBe("password");
    expect(campo.value).toBe("");
  });
  it("sin token explica la limitación", () => {
    render(<TokenBolsaForm tenantId="t1" tokenRegistrado={false} />);
    expect(screen.getByText("Sin token: este taller solo puede usar Simulado.")).toBeTruthy();
  });
});
