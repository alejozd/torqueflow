import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockEstado = vi.fn();
vi.mock("@/app/actions/orden-actions", () => ({
  updateEstadoOrdenAction: (...args: unknown[]) => mockEstado(...args),
}));

import { AvanceFase } from "./avance-fase";

const enviado = () => (mockEstado.mock.calls.at(-1)![2] as FormData).get("estado");

describe("AvanceFase", () => {
  beforeEach(() => {
    mockEstado.mockReset().mockResolvedValue({ error: null, advertencia: null });
  });

  it("en borrador ofrece pasar a En proceso, en un solo clic", async () => {
    render(<AvanceFase ordenId="o1" estado="BORRADOR" />);
    await userEvent.click(screen.getByRole("button", { name: /Pasar a En proceso/ }));
    expect(mockEstado).toHaveBeenCalledTimes(1);
    expect(mockEstado.mock.calls[0]![0]).toBe("o1");
    expect(enviado()).toBe("EN_PROCESO");
  });

  it("en proceso ofrece marcarla como terminada", async () => {
    render(<AvanceFase ordenId="o1" estado="EN_PROCESO" />);
    await userEvent.click(screen.getByRole("button", { name: /Marcar como terminada/ }));
    expect(enviado()).toBe("TERMINADA");
  });

  it("terminada lleva al acta en vez de entregar directo", () => {
    render(<AvanceFase ordenId="o1" estado="TERMINADA" />);
    expect(screen.getByRole("link", { name: /Ir a la entrega/ })).toHaveAttribute("href", "?tab=entrega");
    expect(screen.getByText("Falta el acta firmada")).toBeInTheDocument();
  });

  it("entregada o anulada no ofrece nada", () => {
    const { container, rerender } = render(<AvanceFase ordenId="o1" estado="ENTREGADA" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    rerender(<AvanceFase ordenId="o1" estado="ANULADA" />);
    expect(container.querySelector("button, a")).toBeNull();
  });

  it("anular pide confirmación antes de enviar", async () => {
    render(<AvanceFase ordenId="o1" estado="BORRADOR" />);
    await userEvent.click(screen.getByRole("button", { name: "Más acciones" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Anular orden/ }));
    expect(mockEstado).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Sí, anular" }));
    expect(enviado()).toBe("ANULADA");
  });

  it("sin permiso de anular no ofrece el menú de anular", () => {
    render(<AvanceFase ordenId="o1" estado="BORRADOR" puedeAnular={false} />);
    expect(screen.queryByRole("button", { name: "Más acciones" })).toBeNull();
  });

  it("muestra el error de la acción", async () => {
    mockEstado.mockResolvedValue({ error: "Transición inválida", advertencia: null });
    render(<AvanceFase ordenId="o1" estado="BORRADOR" />);
    await userEvent.click(screen.getByRole("button", { name: /Pasar a En proceso/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Transición inválida");
  });
});
