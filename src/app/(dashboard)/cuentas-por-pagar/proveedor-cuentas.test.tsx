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
    // Con una sola entrada no hace falta repartir: no aparece «Abonar al proveedor».
    expect(screen.queryByRole("button", { name: "Abonar al proveedor" })).not.toBeInTheDocument();
  });

  it("con dos o más entradas por pagar aparece «Abonar al proveedor»", () => {
    render(<ProveedorCuentasLista proveedores={[proveedor([cuenta(), cuenta({ cuentaId: "c2" })])]} />);

    expect(screen.getByRole("button", { name: "Abonar al proveedor" })).toBeInTheDocument();
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

  it("Pagadas: chip con la fecha del pago, historial abierto, sin «Le debes» ni «Abonar»", () => {
    const pago = (id: string, createdAt: Date) => ({
      id,
      monto: 5073557,
      metodoPago: "TRANSFERENCIA",
      referencia: null,
      registradoPor: "Admin Dev",
      createdAt,
    });
    render(
      <ProveedorCuentasLista
        modo="pagadas"
        proveedores={[
          proveedor([
            cuenta({ saldo: 0, pagado: 5073557, pagos: [pago("pg1", new Date())] }),
            cuenta({
              cuentaId: "c2",
              saldo: 0,
              pagado: 5073557,
              pagos: [pago("pg2", new Date(Date.now() - 5 * 24 * 60 * 60 * 1000))],
            }),
          ]),
        ]}
      />,
    );

    const [hoy, antes] = screen
      .getAllByRole("listitem")
      .filter((li) => li.parentElement?.tagName === "UL" && li.querySelector("a"));
    expect(within(hoy!).getByText("Pagada hoy")).toBeInTheDocument();
    expect(within(antes!).getByText(/^Pagada el /)).toBeInTheDocument();
    // En Pagadas el historial viene abierto aunque el pago no sea de hoy.
    expect(within(antes!).getByRole("button", { name: "1 abono registrado" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("2 entradas pagadas en los últimos 30 días")).toBeInTheDocument();
    expect(screen.queryByText("Le debes")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Abonar/ })).not.toBeInTheDocument();
  });
});
