import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/app/actions/factura-electronica-actions", () => ({
  enviarFacturaDianAction: vi.fn(),
  reenviarDocumentoAction: vi.fn(),
  anularConNotaCreditoAction: vi.fn(),
  reenviarAlClienteAction: vi.fn(),
}));

import { FacturaElectronicaCard } from "./factura-electronica-card";
import type { DocumentoFeVista, FacturaFeVista } from "@/app/actions/factura-electronica-actions";

const doc: DocumentoFeVista = {
  id: "d1",
  estado: "ACEPTADO",
  prefijo: "SETP",
  numero: 7,
  cufe: "cufe-123",
  fechaValidacion: new Date("2026-11-20T15:00:00Z"),
  mensajes: [],
  xmlRuta: "/api/uploads/t/facturas-electronicas/d1/FES-SETP7.xml",
  pdfRuta: "/api/uploads/t/facturas-electronicas/d1/FES-SETP7.pdf",
  ambiente: "PRODUCCION",
  intentos: 1,
  ultimoIntentoAt: null,
};
const vista = (documento: DocumentoFeVista | null, extra: Partial<FacturaFeVista> = {}): FacturaFeVista => ({
  activa: true,
  envio: "MANUAL",
  ambiente: "PRODUCCION",
  cuenta: true,
  documento,
  notaCredito: null,
  ...extra,
});
const AHORA = new Date("2026-11-21T12:00:00.000Z");
const props = { facturaId: "f1", clienteId: "c1", correoCliente: "cliente@correo.test", puedeFacturar: true, puedeConfigurar: false, puedeAnular: true, cobrado: 0, ahora: AHORA };

describe("FacturaElectronicaCard", () => {
  it("sin documento ofrece enviar a la DIAN", () => {
    render(<FacturaElectronicaCard {...props} vista={vista(null)} />);
    expect(screen.getByText("Sin enviar a la DIAN")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar a la DIAN" })).toBeInTheDocument();
  });

  it("sin permiso de facturar no muestra botones", () => {
    render(<FacturaElectronicaCard {...props} puedeFacturar={false} vista={vista(null)} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("aceptada: número, código único y descargas", () => {
    render(<FacturaElectronicaCard {...props} vista={vista(doc)} />);
    expect(screen.getByText("Aceptada por la DIAN")).toBeInTheDocument();
    expect(screen.getByText("SETP-7")).toBeInTheDocument();
    expect(screen.getByText("cufe-123")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Descargar PDF" })).toHaveAttribute("href", doc.pdfRuta);
    expect(screen.getByRole("link", { name: "Descargar XML" })).toHaveAttribute("href", doc.xmlRuta);
    expect(screen.queryByRole("button", { name: "Reenviar a la DIAN" })).toBeNull();
  });

  it("aceptada: ofrece reenviar al cliente si tiene correo", () => {
    render(<FacturaElectronicaCard {...props} vista={vista(doc)} />);
    expect(screen.getByRole("button", { name: "Reenviar al cliente" })).toBeInTheDocument();
  });

  it("aceptada: sin correo del cliente lo dice en lugar del botón", () => {
    render(<FacturaElectronicaCard {...props} correoCliente={null} vista={vista(doc)} />);
    expect(screen.getByText("El cliente no tiene correo registrado.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reenviar al cliente" })).toBeNull();
  });

  it("aceptada en simulado o pruebas no se presenta como válida", () => {
    render(<FacturaElectronicaCard {...props} vista={vista({ ...doc, ambiente: "SIMULADO" })} />);
    expect(screen.getByText("Aceptada en Simulado")).toBeInTheDocument();
    expect(screen.getByText("Se aceptó en el ambiente de Simulado: no tiene validez ante la DIAN.")).toBeInTheDocument();
    expect(screen.queryByText("Aceptada por la DIAN")).toBeNull();
    expect(screen.queryByText(/Ya es una factura electrónica válida/)).toBeNull();
  });

  it("un envío interrumpido se muestra por confirmar y deja reenviar", () => {
    const interrumpido: DocumentoFeVista = {
      ...doc,
      estado: "ENVIANDO",
      cufe: null,
      ultimoIntentoAt: new Date(AHORA.getTime() - 5 * 60_000),
    };
    render(<FacturaElectronicaCard {...props} vista={vista(interrumpido)} />);
    expect(screen.getByText("Por confirmar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reenviar a la DIAN" })).toBeInTheDocument();
  });

  it("un envío reciente sigue como enviando", () => {
    const enviando: DocumentoFeVista = { ...doc, estado: "ENVIANDO", cufe: null, ultimoIntentoAt: new Date(AHORA.getTime() - 30_000) };
    render(<FacturaElectronicaCard {...props} vista={vista(enviando)} />);
    expect(screen.getByText("Enviando")).toBeInTheDocument();
  });

  it("rechazada: muestra qué pasó, cómo corregir y deja reenviar", () => {
    const rechazado: DocumentoFeVista = {
      ...doc,
      estado: "RECHAZADO",
      cufe: null,
      mensajes: [
        { codigo: "FAJ43b", tipo: "RECHAZO", textoDian: "x", explicacion: "El NIT del cliente no es válido.", comoCorregir: "Revisa el documento del cliente." },
      ],
    };
    render(<FacturaElectronicaCard {...props} vista={vista(rechazado)} />);
    expect(screen.getByText("Rechazada por la DIAN")).toBeInTheDocument();
    expect(screen.getByText("El NIT del cliente no es válido.")).toBeInTheDocument();
    expect(screen.getByText("Revisa el documento del cliente.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reenviar a la DIAN" })).toBeInTheDocument();
  });

  it("una factura anterior a la activación lo dice y aún deja enviarla", () => {
    render(<FacturaElectronicaCard {...props} vista={vista(null, { cuenta: false })} />);
    expect(screen.getByText("Se creó antes de activar la facturación electrónica.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar a la DIAN" })).toBeInTheDocument();
  });

  it("aceptada: ofrece anular con nota crédito a quien tiene el permiso", () => {
    render(<FacturaElectronicaCard {...props} vista={vista(doc)} />);
    expect(screen.getByRole("button", { name: "Anular con nota crédito" })).toBeInTheDocument();
  });

  it("sin el permiso de anular no ofrece la nota crédito", () => {
    render(<FacturaElectronicaCard {...props} puedeAnular={false} vista={vista(doc)} />);
    expect(screen.queryByRole("button", { name: "Anular con nota crédito" })).toBeNull();
  });

  it("anulada: muestra la nota crédito", () => {
    const nota: DocumentoFeVista = { ...doc, id: "n1", prefijo: "NC", numero: 3, cufe: "cude-9", pdfRuta: null };
    render(<FacturaElectronicaCard {...props} vista={vista({ ...doc, estado: "ANULADO" }, { notaCredito: nota })} />);
    expect(screen.getByText("NC-3")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Anular con nota crédito" })).toBeNull();
  });

  it("rechazada: no ofrece la nota crédito", () => {
    render(<FacturaElectronicaCard {...props} vista={vista({ ...doc, estado: "RECHAZADO", cufe: null })} />);
    expect(screen.queryByRole("button", { name: "Anular con nota crédito" })).toBeNull();
  });
});
