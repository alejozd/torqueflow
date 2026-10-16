import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ClienteCarteraVista } from "@/app/actions/cartera-actions";
import { CONSUMIDOR_FINAL_ID } from "@/lib/cartera/antiguedad";
import { CarteraTable } from "./cartera-table";

function cliente(id: string, nombre: string, url: string | null, docs: { id: string; numero: number; origen: "FACTURA" | "MOSTRADOR" }[]): ClienteCarteraVista {
  return {
    clienteId: id,
    clienteNombre: nombre,
    clienteTelefono: url ? "3105550142" : null,
    urlWhatsapp: url,
    saldoTotal: 1000,
    diasMasAntigua: 3,
    porRango: { "0-30": 1000, "31-60": 0, "61-90": 0, "90+": 0 },
    facturas: docs.map((d) => ({
      facturaId: d.id,
      origen: d.origen,
      numero: d.numero,
      clienteId: id,
      clienteNombre: nombre,
      clienteTelefono: null,
      emitidaAt: new Date("2026-10-10T15:00:00Z"),
      total: 1000,
      saldo: 1000,
      dias: 3,
      rango: "0-30" as const,
    })),
  };
}

describe("CarteraTable", () => {
  it("muestra el origen y enlaza Cobrar de las ventas de mostrador a Mostrador → Ventas", () => {
    render(
      <CarteraTable
        clientes={[cliente("c1", "Ana", "https://wa.me/573105550142", [
          { id: "f1", numero: 10, origen: "FACTURA" },
          { id: "v1", numero: 5, origen: "MOSTRADOR" },
        ])]}
      />,
    );
    expect(screen.getByText(/Factura · #10/)).toBeInTheDocument();
    expect(screen.getByText(/Mostrador · M-5/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cobrar M-5" })).toHaveAttribute("href", "/mostrador?tab=ventas&venta=v1");
    expect(screen.getByRole("button", { name: /Cobrar por WhatsApp/ })).toBeEnabled();
  });

  it("con otra sede seleccionada muestra M-N sin enlace de cobro", () => {
    render(
      <CarteraTable
        puedeCobrarMostrador={false}
        clientes={[cliente("c1", "Ana", null, [{ id: "v1", numero: 5, origen: "MOSTRADOR" }])]}
      />,
    );
    expect(screen.queryByRole("link", { name: "Cobrar M-5" })).not.toBeInTheDocument();
    expect(screen.getByText("M-5")).toBeInTheDocument();
  });

  it("Consumidor final no tiene WhatsApp pero sí enlace de cobro", () => {
    render(<CarteraTable clientes={[cliente(CONSUMIDOR_FINAL_ID, "Consumidor final", null, [{ id: "v2", numero: 6, origen: "MOSTRADOR" }])]} />);
    expect(screen.getByText("Consumidor final")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /WhatsApp/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Cobrar M-6" })).toBeInTheDocument();
  });
});
