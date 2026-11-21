import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AvisoFacturasDian } from "./aviso-facturas-dian";

describe("AvisoFacturasDian", () => {
  it("no muestra nada con 0", () => {
    const { container } = render(<AvisoFacturasDian cantidad={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("singular y plural, con enlace a la lista filtrada", () => {
    const { rerender } = render(<AvisoFacturasDian cantidad={1} />);
    expect(screen.getByRole("link", { name: /1 factura sin enviar a la DIAN/ })).toHaveAttribute("href", "/facturas?dian=pendientes");
    rerender(<AvisoFacturasDian cantidad={4} />);
    expect(screen.getByRole("link", { name: /4 facturas sin enviar a la DIAN/ })).toBeInTheDocument();
  });
});
