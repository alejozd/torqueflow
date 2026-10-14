import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { resumirFacturacion } from "@/lib/dashboard/facturacion-semana";
import { FacturacionSemanaCard } from "./facturacion-semana-card";

const DIAS = Array.from({ length: 14 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);
const factura = (dia: string, total: number, saldoPendiente = 0) => ({
  createdAt: new Date(`${dia}T10:00:00-05:00`),
  total,
  saldoPendiente,
});

const RESUMEN = resumirFacturacion(
  [factura("2026-10-13", 1_000_000, 400_000), factura("2026-10-14", 300_000), factura("2026-10-02", 1_000_000)],
  DIAS,
);

describe("FacturacionSemanaCard", () => {
  it("muestra la leyenda y las cifras de la semana con la comparación", () => {
    render(<FacturacionSemanaCard resumen={RESUMEN} />);

    const leyenda = screen.getByRole("list", { name: "Leyenda" });
    expect(leyenda).toHaveTextContent("Cobrado");
    expect(leyenda).toHaveTextContent("Pendiente");
    expect(leyenda).toHaveTextContent("Promedio diario");
    expect(screen.getByText("+30 % vs. 7 días anteriores", { exact: false })).toBeInTheDocument();
  });

  it("explica la semana en la lectura", () => {
    render(<FacturacionSemanaCard resumen={RESUMEN} />);

    const lectura = screen.getByRole("region", { name: "Lectura de la semana" });
    expect(within(lectura).getAllByRole("listitem")).toHaveLength(3);
    expect(lectura).toHaveTextContent("30 % más que los 7 días anteriores");
  });

  it("cada día se puede consultar con el teclado y el último se rotula como hoy", () => {
    render(<FacturacionSemanaCard resumen={RESUMEN} />);

    const martes = screen.getByLabelText(/^martes 13: \$\s?1\.000\.000 en 1 factura/);
    expect(martes).toHaveAttribute("tabindex", "0");
    expect(within(martes).getByRole("tooltip", { hidden: true })).toHaveTextContent("Pendiente");
    expect(screen.getByText("hoy")).toBeInTheDocument();
  });

  it("trae los mismos datos en una tabla", () => {
    render(<FacturacionSemanaCard resumen={RESUMEN} />);

    const filas = within(screen.getByRole("table", { hidden: true })).getAllByRole("row", { hidden: true });
    expect(filas).toHaveLength(8); // encabezado + 7 días
  });
});
