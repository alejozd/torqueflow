import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";

vi.mock("@/app/actions/cuenta-por-pagar-actions", () => ({ abonarCuentaPorPagarAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children: ReactNode }) => (
    <a href={href} {...resto}>
      {children}
    </a>
  ),
}));

import type { CuentaConAntiguedad, ProveedorCuentas } from "@/lib/proveedores/cuentas-por-pagar";
import { ProveedorCuentasLista } from "./proveedor-cuentas";

function cuenta(cambios: Partial<CuentaConAntiguedad> = {}): CuentaConAntiguedad {
  return {
    cuentaId: "c1",
    proveedorId: "p1",
    proveedorNombre: "Pirelli",
    entradaId: "e1",
    fecha: new Date("2026-09-04T00:00:00.000Z"),
    total: 5073557,
    saldo: 4873557,
    pagado: 200000,
    entrada: { id: "e1", referencias: 3, resumen: "Batería NGK ×20, Aceite 5W-30 ×6 y 1 más" },
    pagos: [],
    dias: 42,
    rango: "31-60",
    ...cambios,
  };
}

function proveedor(cuentas: CuentaConAntiguedad[]): ProveedorCuentas {
  return {
    proveedorId: "p1",
    proveedorNombre: "Pirelli",
    saldoTotal: cuentas.reduce((suma, c) => suma + c.saldo, 0),
    porRango: { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 },
    cuentas,
    diasMasAntigua: Math.max(...cuentas.map((c) => c.dias)),
  };
}

describe("ProveedorCuentasLista", () => {
  it("cada entrada enlaza a su ficha, dice qué trajo, su antigüedad, lo pagado y tiene «Abonar»", () => {
    render(<ProveedorCuentasLista proveedores={[proveedor([cuenta()])]} />);

    const fila = screen.getByRole("listitem");
    expect(within(fila).getByRole("link", { name: /Entrada del/ })).toHaveAttribute("href", "/entradas-mercancia/e1");
    expect(within(fila).getByText(/3 referencias · Batería NGK ×20/)).toBeInTheDocument();
    expect(within(fila).getByText("42 días")).toBeInTheDocument();
    expect(within(fila).getByText(/Pagado/)).toHaveTextContent("Pagado $ 200.000 de $ 5.073.557");
    expect(within(fila).getByRole("button", { name: /Abonar a la entrada del .* de Pirelli/ })).toBeInTheDocument();
    expect(screen.getByText("1 entrada por pagar · la más vieja hace 42 días")).toBeInTheDocument();
  });

  it("una cuenta recién saldada sigue en la lista resaltada, con «✓ Pagada» y sin botón", () => {
    render(
      <ProveedorCuentasLista proveedores={[proveedor([cuenta({ saldo: 0, pagado: 5073557 })])]} abonadas={["c1"]} />,
    );

    const fila = screen.getByRole("listitem");
    expect(within(fila).getByText("✓ Pagada")).toBeInTheDocument();
    expect(within(fila).getByText("✓ Abono registrado hace un momento")).toBeInTheDocument();
    expect(within(fila).queryByRole("button", { name: /Abonar/ })).not.toBeInTheDocument();
  });
});
