import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockEntregar = vi.fn();
const mockGuardar = vi.fn();
const mockFirmar = vi.fn();
const mockBorrarActa = vi.fn();
vi.mock("@/app/actions/recepcion-actions", () => ({
  entregarOrdenAction: (...args: unknown[]) => mockEntregar(...args),
  guardarActaAction: (...args: unknown[]) => mockGuardar(...args),
  firmarActaAction: (...args: unknown[]) => mockFirmar(...args),
  borrarActaAction: (...args: unknown[]) => mockBorrarActa(...args),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ActaEntregaForm } from "./acta-entrega-form";

const OK = { error: null, success: true };

function renderForm(props: Partial<Parameters<typeof ActaEntregaForm>[0]> = {}) {
  return render(<ActaEntregaForm ordenId="o1" estado="TERMINADA" acta={null} editable {...props} />);
}

describe("ActaEntregaForm", () => {
  beforeEach(() => {
    mockEntregar.mockReset().mockResolvedValue(OK);
    mockGuardar.mockReset().mockResolvedValue(OK);
    mockFirmar.mockReset().mockResolvedValue(OK);
    mockBorrarActa.mockReset().mockResolvedValue(OK);
  });

  it("ofrece firmar en pantalla o subir la foto del papel", () => {
    renderForm();

    expect(screen.getByLabelText("Recibe (nombre)")).toBeInTheDocument();
    expect(screen.getByLabelText("Cómo firma el cliente")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Firma de quien recibe" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Foto o escaneo del acta firmada")).not.toBeInTheDocument();
  });

  it("permite cambiar a la foto del acta firmada", async () => {
    renderForm();

    await userEvent.click(screen.getByLabelText("Cómo firma el cliente"));
    await userEvent.click(await screen.findByRole("option", { name: "Subir foto del acta firmada" }));

    expect(screen.getByLabelText("Foto o escaneo del acta firmada")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Firma de quien recibe" })).not.toBeInTheDocument();
  });

  it("guardar sin firmar no entrega la orden", async () => {
    renderForm();

    await userEvent.type(screen.getByLabelText("Recibe (nombre)"), "María");
    await userEvent.click(screen.getByRole("button", { name: "Guardar sin firmar" }));

    expect(mockGuardar).toHaveBeenCalledTimes(1);
    expect(mockEntregar).not.toHaveBeenCalled();
    const formData = mockGuardar.mock.calls[0]![2] as FormData;
    expect(formData.get("accion")).toBe("borrador");
    expect(formData.get("recibidoPor")).toBe("María");
  });

  it("entregar pide confirmación porque es irreversible", async () => {
    renderForm({ exigirFirma: true });

    await userEvent.type(screen.getByLabelText("Recibe (nombre)"), "María");
    await userEvent.click(screen.getByRole("button", { name: "Entregar y firmar" }));

    expect(mockEntregar).not.toHaveBeenCalled();
    expect(screen.getByText(/La orden ya no se podrá editar/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Sí, entregar" }));

    expect(mockEntregar).toHaveBeenCalledTimes(1);
    const formData = mockEntregar.mock.calls[0]![2] as FormData;
    expect(formData.get("accion")).toBe("entregar");
  });

  it("si el taller no exige firma, entregar es un botón y la confirmación lo explica", async () => {
    renderForm({ exigirFirma: false });

    expect(screen.queryByRole("button", { name: "Entregar y firmar" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Entregar" }));

    expect(screen.getByText(/el acta queda sin firma y se puede firmar después/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sí, entregar" }));
    expect(mockEntregar).toHaveBeenCalledTimes(1);
  });

  it("si el taller exige firma, lo dice junto al botón", () => {
    renderForm({ exigirFirma: true });

    expect(screen.getByRole("button", { name: "Entregar y firmar" })).toBeInTheDocument();
    expect(screen.getByText("Este taller exige la firma de quien recibe para entregar.")).toBeInTheDocument();
  });

  it("una orden que no está terminada no ofrece entregar y explica por qué", () => {
    renderForm({ estado: "EN_PROCESO" });

    expect(screen.queryByRole("button", { name: /^Entregar/ })).not.toBeInTheDocument();
    expect(screen.getByText(/se entrega cuando esté Terminada/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar sin firmar" })).toBeInTheDocument();
  });

  it("una orden entregada sin firma solo se firma", () => {
    renderForm({ estado: "ENTREGADA" });

    expect(screen.getByRole("button", { name: "Firmar el acta" })).toBeInTheDocument();
    expect(screen.getByText(/se entregó sin firma/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Entregar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar sin firmar" })).not.toBeInTheDocument();
  });

  it("con el acta firmada muestra los datos y la firma, sin formulario", () => {
    renderForm({
      estado: "ENTREGADA",
      acta: {
        recibidoPor: "María Pérez",
        documentoRecibe: "1.020",
        observaciones: "Sin novedad",
        firmaUrl: "/api/uploads/taller/ordenes/o1/firma/f.png",
        firmaFotoUrl: null,
        firmadaAt: new Date("2026-10-12T15:00:00.000Z"),
      },
    });

    expect(screen.getByText("María Pérez")).toBeInTheDocument();
    expect(screen.getByText("Sin novedad")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Firma de María Pérez" })).toHaveAttribute(
      "src",
      "/api/uploads/taller/ordenes/o1/firma/f.png",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Acta firmada el");
    expect(screen.queryByRole("button", { name: "Firmar el acta" })).not.toBeInTheDocument();
  });

  it("muestra el error de la action (por ejemplo, si falta la firma)", async () => {
    mockEntregar.mockResolvedValue({ error: "Falta la firma de quien recibe", success: false });
    renderForm({ exigirFirma: true });

    await userEvent.click(screen.getByRole("button", { name: "Entregar y firmar" }));
    await userEvent.click(screen.getByRole("button", { name: "Sí, entregar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Falta la firma de quien recibe");
  });

  it("una orden anulada deja el acta en solo lectura", () => {
    renderForm({ estado: "ANULADA", editable: false });

    expect(screen.getByText(/La orden está anulada/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Entregar y firmar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar sin firmar" })).not.toBeInTheDocument();
  });

  it("deja borrar el borrador del acta solo a quien puede", async () => {
    const acta = {
      recibidoPor: "Ana",
      documentoRecibe: null,
      observaciones: null,
      firmaUrl: null,
      firmaFotoUrl: null,
      firmadaAt: null,
    };
    mockBorrarActa.mockResolvedValue({ error: null, success: true });
    const { unmount } = renderForm({ acta, puedeBorrar: false });
    expect(screen.queryByRole("button", { name: "Borrar acta" })).not.toBeInTheDocument();
    unmount();

    renderForm({ acta, puedeBorrar: true });
    await userEvent.click(screen.getByRole("button", { name: "Borrar acta" }));
    await userEvent.click(screen.getByRole("button", { name: "Sí, quitar" }));

    expect(mockBorrarActa).toHaveBeenCalledWith("o1");
  });
});
