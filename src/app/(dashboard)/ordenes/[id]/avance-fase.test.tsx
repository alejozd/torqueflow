import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockEstado = vi.fn();
const mockAvisar = vi.fn();
vi.mock("@/app/actions/orden-actions", () => ({
  updateEstadoOrdenAction: (...args: unknown[]) => mockEstado(...args),
  avisarClienteEstadoOrdenAction: (...args: unknown[]) => mockAvisar(...args),
}));

import { AvanceFase } from "./avance-fase";

const CLIENTE = { clienteNombre: "Ana Pérez", clienteEmail: "ana@cliente.test" };

const enviado = () => (mockEstado.mock.calls.at(-1)![2] as FormData).get("estado");

describe("AvanceFase", () => {
  beforeEach(() => {
    mockEstado.mockReset().mockResolvedValue({ error: null, advertencia: null });
    mockAvisar.mockReset().mockResolvedValue({ error: null, mensaje: "Se está enviando el aviso a ana@cliente.test." });
  });

  it("en borrador ofrece pasar a En proceso, en un solo clic", async () => {
    render(<AvanceFase ordenId="o1" estado="BORRADOR" puedeAnular {...CLIENTE} />);
    await userEvent.click(screen.getByRole("button", { name: /Pasar a En proceso/ }));
    expect(mockEstado).toHaveBeenCalledTimes(1);
    expect(mockEstado.mock.calls[0]![0]).toBe("o1");
    expect(enviado()).toBe("EN_PROCESO");
  });

  it("en proceso ofrece marcarla como terminada", async () => {
    render(<AvanceFase ordenId="o1" estado="EN_PROCESO" puedeAnular {...CLIENTE} />);
    await userEvent.click(screen.getByRole("button", { name: /Marcar como terminada/ }));
    expect(enviado()).toBe("TERMINADA");
  });

  it("terminada lleva al acta en vez de entregar directo", () => {
    render(<AvanceFase ordenId="o1" estado="TERMINADA" puedeAnular {...CLIENTE} />);
    expect(screen.getByRole("link", { name: /Ir a la entrega/ })).toHaveAttribute("href", "?tab=entrega");
    expect(screen.getByText("Falta el acta firmada")).toBeInTheDocument();
  });

  it("entregada o anulada no ofrece nada", () => {
    const { container, rerender } = render(<AvanceFase ordenId="o1" estado="ENTREGADA" puedeAnular {...CLIENTE} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    rerender(<AvanceFase ordenId="o1" estado="ANULADA" puedeAnular {...CLIENTE} />);
    expect(container.querySelector("button, a")).toBeNull();
  });

  it("anular pide confirmación antes de enviar", async () => {
    render(<AvanceFase ordenId="o1" estado="BORRADOR" puedeAnular {...CLIENTE} />);
    await userEvent.click(screen.getByRole("button", { name: "Más acciones" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Anular orden/ }));
    expect(mockEstado).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Sí, anular" }));
    expect(enviado()).toBe("ANULADA");
  });

  it("sin permiso de anular no ofrece el menú de anular", () => {
    render(<AvanceFase ordenId="o1" estado="BORRADOR" puedeAnular={false} {...CLIENTE} />);
    expect(screen.queryByRole("button", { name: "Más acciones" })).toBeNull();
  });

  it("muestra el error de la acción", async () => {
    mockEstado.mockResolvedValue({ error: "Transición inválida", advertencia: null });
    render(<AvanceFase ordenId="o1" estado="BORRADOR" puedeAnular {...CLIENTE} />);
    await userEvent.click(screen.getByRole("button", { name: /Pasar a En proceso/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Transición inválida");
  });

  it("tras pasar a En proceso pregunta si avisar al cliente y, si se acepta, envía el aviso", async () => {
    mockEstado.mockResolvedValue({ error: null, advertencia: null, estadoNuevo: "EN_PROCESO" });
    render(<AvanceFase ordenId="o1" estado="BORRADOR" puedeAnular {...CLIENTE} />);
    await userEvent.click(screen.getByRole("button", { name: /Pasar a En proceso/ }));

    expect(await screen.findByText("¿Avisar a Ana Pérez por correo que la orden está en proceso?")).toBeInTheDocument();
    expect(mockAvisar).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Enviar correo" }));

    expect(mockAvisar).toHaveBeenCalledWith("o1");
    expect(await screen.findByRole("status")).toHaveTextContent("Se está enviando el aviso a ana@cliente.test.");
    expect(screen.queryByRole("button", { name: "Enviar correo" })).toBeNull();
  });

  it("si se responde que no, no envía nada y deja de preguntar", async () => {
    mockEstado.mockResolvedValue({ error: null, advertencia: null, estadoNuevo: "TERMINADA" });
    render(<AvanceFase ordenId="o1" estado="EN_PROCESO" puedeAnular {...CLIENTE} />);
    await userEvent.click(screen.getByRole("button", { name: /Marcar como terminada/ }));

    expect(await screen.findByText(/que la orden está lista para entregar/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "No" }));

    expect(mockAvisar).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Enviar correo" })).toBeNull();
  });

  it("muestra por qué no se pudo avisar", async () => {
    mockEstado.mockResolvedValue({ error: null, advertencia: null, estadoNuevo: "EN_PROCESO" });
    mockAvisar.mockResolvedValue({ error: "El correo del taller no está configurado.", mensaje: null });
    render(<AvanceFase ordenId="o1" estado="BORRADOR" puedeAnular {...CLIENTE} />);
    await userEvent.click(screen.getByRole("button", { name: /Pasar a En proceso/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Enviar correo" }));

    expect(await screen.findByText("El correo del taller no está configurado.")).toBeInTheDocument();
  });

  it("sin correo del cliente no pregunta", async () => {
    mockEstado.mockResolvedValue({ error: null, advertencia: null, estadoNuevo: "EN_PROCESO" });
    render(<AvanceFase ordenId="o1" estado="BORRADOR" puedeAnular clienteNombre="Ana Pérez" clienteEmail={null} />);
    await userEvent.click(screen.getByRole("button", { name: /Pasar a En proceso/ }));

    await screen.findByRole("button", { name: /Pasar a En proceso/ });
    expect(screen.queryByRole("button", { name: "Enviar correo" })).toBeNull();
  });

  it("si el cambio falla no pregunta", async () => {
    mockEstado.mockResolvedValue({ error: "Transición inválida", advertencia: null });
    render(<AvanceFase ordenId="o1" estado="BORRADOR" puedeAnular {...CLIENTE} />);
    await userEvent.click(screen.getByRole("button", { name: /Pasar a En proceso/ }));

    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: "Enviar correo" })).toBeNull();
  });

  it("puedeAnular es obligatorio: si se olvida no compila, en vez de quedar abierto (M4)", () => {
    // @ts-expect-error -- sin puedeAnular el componente no debe compilar.
    const elemento = <AvanceFase ordenId="o1" estado="BORRADOR" {...CLIENTE} />;
    expect(elemento).toBeTruthy();
  });
});
