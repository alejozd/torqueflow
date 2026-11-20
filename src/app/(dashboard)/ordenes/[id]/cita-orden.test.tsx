import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => "/ordenes/o1",
}));
vi.mock("@/app/(dashboard)/cotizaciones/[id]/agendar-cita-dialog", () => ({
  AgendarCitaDialog: ({ motivo }: { motivo: string }) => <p>Formulario: {motivo}</p>,
}));

import { CitaOrden } from "./cita-orden";

const AGENDAR = {
  cotizacionId: "cot-46",
  vehiculo: { id: "v1", placa: "KHW843", marca: "Fiat", modelo: "UNO", clienteNombre: "Daniela" },
  motivo: "Cotización #46: Amortiguador",
  ocupacion: [],
};

describe("CitaOrden", () => {
  it("con cita muestra su fecha y enlaza a ella", () => {
    render(<CitaOrden cita={{ id: "c1", texto: "viernes, 21 nov · programada" }} preguntar agendar={AGENDAR} />);

    expect(screen.getByRole("link")).toHaveAttribute("href", "/citas/c1");
    expect(screen.queryByText(/¿Agendar la cita/)).not.toBeInTheDocument();
  });

  it("recién aprobada pregunta, y al aceptar abre el formulario prellenado", async () => {
    render(<CitaOrden cita={null} preguntar agendar={AGENDAR} />);

    await userEvent.click(screen.getByRole("button", { name: "Agendar cita" }));
    expect(screen.getByText("Formulario: Cotización #46: Amortiguador")).toBeInTheDocument();
  });

  it("'Ahora no' cierra la pregunta y quita el parámetro de la dirección", async () => {
    render(<CitaOrden cita={null} preguntar agendar={AGENDAR} />);

    await userEvent.click(screen.getByRole("button", { name: "Ahora no" }));
    expect(screen.queryByText(/¿Agendar la cita/)).not.toBeInTheDocument();
    expect(mockReplace).toHaveBeenCalledWith("/ordenes/o1?tab=recepcion", { scroll: false });
  });

  it("sin pregunta ni cita no muestra nada", () => {
    const { container } = render(<CitaOrden cita={null} preguntar={false} agendar={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
