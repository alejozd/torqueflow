import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/vencimiento-actions", () => ({
  registrarAvisoWhatsappAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import type { FilaVencimiento } from "@/app/actions/vencimiento-actions";
import { VencimientosTable } from "./vencimientos-table";

const base = {
  vehiculoId: "v1",
  tipoVehiculo: "CARRO" as const,
  marca: "Mazda",
  modelo: "3",
  anio: 2020,
  clienteNombre: "Andrea Valencia",
  clienteTelefono: "3148892341",
  fechaVencimiento: new Date("2026-10-17T00:00:00Z"),
  urlWhatsapp: "https://wa.me/573148892341?text=x",
};
const filas: FilaVencimiento[] = [
  { ...base, id: "1", placa: "YOR558", tipo: "SOAT", estado: "VENCIDO", diasRestantes: -14, ultimoAviso: null },
  {
    ...base,
    id: "2",
    placa: "MRW615",
    tipo: "TECNOMECANICA",
    estado: "PROXIMO",
    diasRestantes: 2,
    ultimoAviso: { canal: "WHATSAPP", enviadoAt: new Date("2026-10-13T00:00:00Z") },
  },
];
const ahora = new Date("2026-10-15T12:00:00Z");

describe("VencimientosTable", () => {
  it("muestra vehículo, teléfono y días", () => {
    render(<VencimientosTable filas={filas} puedeAvisar ahora={ahora} />);
    expect(screen.getByText("YOR558")).toBeInTheDocument();
    expect(screen.getAllByText("Mazda 3")).toHaveLength(2);
    expect(screen.getAllByText("3148892341").length).toBeGreaterThan(0);
    expect(screen.getByText("Hace 14 días")).toBeInTheDocument();
  });

  it("los chips muestran conteo y filtran", async () => {
    render(<VencimientosTable filas={filas} puedeAvisar ahora={ahora} />);
    await userEvent.click(screen.getByRole("button", { name: "Vencidos (1)" }));
    expect(screen.getByText("YOR558")).toBeInTheDocument();
    expect(screen.queryByText("MRW615")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vencidos (1)" })).toHaveAttribute("aria-pressed", "true");
  });

  it("técnico ve el último aviso pero no el botón", () => {
    render(<VencimientosTable filas={filas} puedeAvisar={false} ahora={ahora} />);
    expect(screen.queryByRole("button", { name: /avisar por whatsapp/i })).not.toBeInTheDocument();
    expect(screen.getByText(/WhatsApp ·/)).toBeInTheDocument();
  });
});
