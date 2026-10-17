import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockImportar = vi.fn();
vi.mock("@/app/actions/importacion-actions", () => ({
  importarAction: (...args: unknown[]) => mockImportar(...args),
}));

import { resultadoVacio } from "@/lib/importacion/resultado";
import { ImportarForm } from "./importar-form";

const BODEGAS = [
  { value: "b1", label: "Bodega principal" },
  { value: "b2", label: "Bodega norte" },
];
const PROVEEDORES = [{ value: "p1", label: "Repuestos del Norte" }];

function renderForm(puedeGestionarServicios = true) {
  return render(<ImportarForm bodegas={BODEGAS} proveedores={PROVEEDORES} puedeGestionarServicios={puedeGestionarServicios} />);
}

describe("ImportarForm", () => {
  beforeEach(() => {
    mockImportar.mockReset();
    mockImportar.mockResolvedValue(resultadoVacio());
  });

  it("ofrece el archivo, la bodega y el proveedor", () => {
    renderForm();

    expect(screen.getByLabelText("Archivo de Excel (.xlsx)")).toHaveAttribute("accept", ".xlsx");
    expect(screen.getByLabelText("Bodega de los repuestos")).toBeInTheDocument();
    expect(screen.getByLabelText("Proveedor del stock inicial")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Importar" })).toBeInTheDocument();
  });

  it("envía el archivo y los dos selectores a la acción", async () => {
    renderForm();

    const archivo = new File(["x"], "clientes.xlsx");
    const entrada = screen.getByLabelText("Archivo de Excel (.xlsx)") as HTMLInputElement;
    await userEvent.upload(entrada, archivo);
    // jsdom no mete los archivos en el FormData de una acción de React (los
    // inputs de archivo son de solo lectura ahí), así que el archivo se
    // comprueba en el propio input y los selectores en lo que recibe la acción.
    expect(entrada.files?.[0]?.name).toBe("clientes.xlsx");

    await userEvent.click(screen.getByLabelText("Bodega de los repuestos"));
    await userEvent.click(await screen.findByRole("option", { name: "Bodega norte" }));
    await userEvent.click(screen.getByRole("button", { name: "Importar" }));

    expect(mockImportar).toHaveBeenCalledTimes(1);
    const formData = mockImportar.mock.calls[0]![1] as FormData;
    expect(formData.get("bodegaId")).toBe("b2");
    expect(formData.get("proveedorId")).toBe("");
  });

  it("muestra el error global de la acción", async () => {
    mockImportar.mockResolvedValue(resultadoVacio("El archivo debe ser un libro de Excel con extensión .xlsx"));
    renderForm();

    await userEvent.upload(screen.getByLabelText("Archivo de Excel (.xlsx)"), new File(["x"], "datos.xlsx"));
    await userEvent.click(screen.getByRole("button", { name: "Importar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El archivo debe ser un libro de Excel");
  });

  it("pinta el reporte cuando la acción devuelve resumen", async () => {
    mockImportar.mockResolvedValue({
      error: null,
      resumen: [{ hoja: "Clientes", leidas: 2, creadas: 2, existentes: 0, rechazadas: 0, estado: "ok", motivo: null }],
      filas: [],
      filasOcultas: 0,
    });
    renderForm();

    await userEvent.upload(screen.getByLabelText("Archivo de Excel (.xlsx)"), new File(["x"], "clientes.xlsx"));
    await userEvent.click(screen.getByRole("button", { name: "Importar" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Se crearon 2 registros.");
  });

  it("avisa a recepción de que la hoja de servicios se omitirá", () => {
    renderForm(false);

    expect(screen.getByText(/La hoja de Servicios solo la puede importar un administrador/)).toBeInTheDocument();
  });

  it("no le dice nada de eso a un administrador", () => {
    renderForm(true);

    expect(screen.queryByText(/La hoja de Servicios solo la puede importar un administrador/)).not.toBeInTheDocument();
  });
});
