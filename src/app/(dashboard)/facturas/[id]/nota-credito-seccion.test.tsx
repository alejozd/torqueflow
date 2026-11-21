import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/app/actions/factura-electronica-actions", () => ({
  anularConNotaCreditoAction: vi.fn(),
  completarAnulacionAction: vi.fn(),
  reenviarDocumentoAction: vi.fn(),
  reenviarAlClienteAction: vi.fn(),
}));

// Un <select> nativo para poder revisar las opciones del concepto.
vi.mock("@/components/ui/select-field", () => ({
  SelectField: ({ id, name, defaultValue, items }: { id: string; name: string; defaultValue: string; items: { value: string; label: string }[] }) => (
    <select id={id} name={name} defaultValue={defaultValue}>
      {items.map((i) => (
        <option key={i.value} value={i.value}>
          {i.label}
        </option>
      ))}
    </select>
  ),
}));

import { NotaCreditoSeccion } from "./nota-credito-seccion";
import type { DocumentoFeVista } from "@/app/actions/factura-electronica-actions";

const props = { estadoFactura: "ACEPTADO" as const, facturaId: "f1", correoCliente: "cliente@correo.test", puedeAnular: true, puedeFacturar: true, cobrado: 0, ahora: new Date("2026-11-21T15:00:00Z") };

const NOTA_ACEPTADA: DocumentoFeVista = {
  id: "n1", estado: "ACEPTADO", prefijo: "NC", numero: 3, cufe: "cude-1", fechaValidacion: null, mensajes: [],
  xmlRuta: null, pdfRuta: null, ambiente: "PRODUCCION", intentos: 1, ultimoIntentoAt: null,
};

describe("NotaCreditoSeccion", () => {
  it("sin nota crédito ofrece anular y pide confirmación con concepto y motivo", () => {
    render(<NotaCreditoSeccion {...props} notaCredito={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Anular con nota crédito" }));
    expect(screen.getByLabelText("Motivo")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Error en el valor" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByRole("group", { name: "¿Anular esta factura con nota crédito? No se puede deshacer." })).toBeInTheDocument();
  });

  it("el concepto solo ofrece anulación (por defecto) u otros", () => {
    render(<NotaCreditoSeccion {...props} notaCredito={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Anular con nota crédito" }));
    const opciones = screen.getAllByRole("option").map((o) => (o as HTMLOptionElement).value);
    expect(opciones).toEqual(["2", "5"]);
    expect((screen.getByLabelText("Concepto") as HTMLSelectElement).value).toBe("2");
  });

  it("nota aceptada con la factura aún sin anular: ofrece completar la anulación", () => {
    render(<NotaCreditoSeccion {...props} notaCredito={NOTA_ACEPTADA} />);
    expect(screen.getByRole("button", { name: "Completar anulación" })).toBeInTheDocument();
  });

  it("completar la anulación exige el permiso de anular", () => {
    render(<NotaCreditoSeccion {...props} puedeAnular={false} notaCredito={NOTA_ACEPTADA} />);
    expect(screen.queryByRole("button", { name: "Completar anulación" })).toBeNull();
  });

  it("con la factura ya anulada no ofrece completar la anulación", () => {
    render(<NotaCreditoSeccion {...props} estadoFactura="ANULADO" notaCredito={NOTA_ACEPTADA} />);
    expect(screen.queryByRole("button", { name: "Completar anulación" })).toBeNull();
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
