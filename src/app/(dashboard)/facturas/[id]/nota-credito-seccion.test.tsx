import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/app/actions/factura-electronica-actions", () => ({
  anularConNotaCreditoAction: vi.fn(),
  reenviarDocumentoAction: vi.fn(),
  reenviarAlClienteAction: vi.fn(),
}));

import { NotaCreditoSeccion } from "./nota-credito-seccion";

const props = { facturaId: "f1", correoCliente: "cliente@correo.test", puedeAnular: true, puedeFacturar: true, cobrado: 0, ahora: new Date("2026-11-21T15:00:00Z") };

describe("NotaCreditoSeccion", () => {
  it("sin nota crédito ofrece anular y pide confirmación con concepto y motivo", () => {
    render(<NotaCreditoSeccion {...props} notaCredito={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Anular con nota crédito" }));
    expect(screen.getByLabelText("Motivo")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Error en el valor" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByRole("group", { name: "¿Anular esta factura con nota crédito? No se puede deshacer." })).toBeInTheDocument();
  });

  it("avisa si la factura tiene pagos", () => {
    render(<NotaCreditoSeccion {...props} cobrado={150000} notaCredito={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Anular con nota crédito" }));
    expect(screen.getByText(/tiene pagos por \$\s?150\.000/)).toBeInTheDocument();
  });

  it("sin permiso no muestra el botón", () => {
    render(<NotaCreditoSeccion {...props} puedeAnular={false} notaCredito={null} />);
    expect(screen.queryByRole("button", { name: "Anular con nota crédito" })).toBeNull();
  });

  it("con nota crédito aceptada muestra número y descargas", () => {
    render(
      <NotaCreditoSeccion
        {...props}
        notaCredito={{
          id: "n1", estado: "ACEPTADO", prefijo: "NC", numero: 3, cufe: "cude-1", fechaValidacion: null, mensajes: [],
          xmlRuta: "/api/uploads/t/facturas-electronicas/n1/NCS-NC3.xml", pdfRuta: null, ambiente: "PRODUCCION", intentos: 1, ultimoIntentoAt: null,
        }}
      />,
    );
    expect(screen.getByText("NC-3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Descargar XML de la nota crédito" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reenviar al cliente" })).toBeInTheDocument();
  });
});
