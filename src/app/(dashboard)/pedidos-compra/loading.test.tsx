import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import PedidosCompraLoading from "./loading";

describe("Pedidos de compra Loading Skeleton", () => {
  it("displays the page title, the KPI titles and the Listado card", () => {
    const { getByText } = render(<PedidosCompraLoading />);
    expect(getByText("Pedidos de compra")).toBeInTheDocument();
    for (const titulo of ["Borradores", "En camino", "Valor en camino", "Recibidos este mes", "Listado"]) {
      expect(getByText(titulo)).toBeInTheDocument();
    }
  });
});
