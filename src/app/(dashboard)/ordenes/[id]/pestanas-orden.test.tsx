import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PestanasOrden, type Pestana } from "./pestanas-orden";

const PESTANAS: Pestana[] = [
  { id: "recepcion", titulo: "Recepción", resumen: "3 daños", color: "red", panel: <p>Panel de recepción</p> },
  {
    id: "trabajo",
    titulo: "Trabajo",
    resumen: "$ 399.401",
    color: "orange",
    panel: <input aria-label="A medio llenar" />,
  },
  { id: "inspeccion", titulo: "Inspección", resumen: "1 de 8 revisados", color: "green", panel: <p>Panel DVI</p> },
  { id: "entrega", titulo: "Entrega", resumen: "Pendiente", color: "gray", panel: <p>Panel acta</p> },
];

describe("PestanasOrden", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("abre la pestaña inicial con su resumen y deja las otras ocultas", () => {
    render(<PestanasOrden pestanas={PESTANAS} inicial="trabajo" />);
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    expect(screen.getByRole("tab", { name: /Trabajo/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Recepción/ })).toHaveTextContent("3 daños");
    expect(screen.getByText("Panel de recepción")).not.toBeVisible();
  });

  it("al cambiar de pestaña no pierde lo escrito y deja la pestaña en la URL", async () => {
    render(<PestanasOrden pestanas={PESTANAS} inicial="trabajo" />);
    await userEvent.type(screen.getByLabelText("A medio llenar"), "bomba");
    await userEvent.click(screen.getByRole("tab", { name: /Inspección/ }));
    expect(screen.getByText("Panel DVI")).toBeVisible();
    expect(new URL(window.location.href).searchParams.get("tab")).toBe("inspeccion");
    await userEvent.click(screen.getByRole("tab", { name: /Trabajo/ }));
    expect(screen.getByLabelText("A medio llenar")).toHaveValue("bomba");
  });

  it("una pestaña ya gestionada lleva un visto verde", () => {
    render(
      <PestanasOrden
        pestanas={PESTANAS.map((pestana) => ({ ...pestana, gestionada: pestana.id === "trabajo" }))}
        inicial="trabajo"
      />,
    );
    expect(screen.getByRole("tab", { name: /Trabajo/ })).toHaveAccessibleName(/gestionada/);
    expect(screen.getByRole("tab", { name: /Recepción/ })).not.toHaveAccessibleName(/gestionada/);
  });

  it("con las flechas se pasa a la pestaña de al lado", async () => {
    render(<PestanasOrden pestanas={PESTANAS} inicial="entrega" />);
    screen.getByRole("tab", { name: /Entrega/ }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: /Recepción/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Recepción/ })).toHaveFocus();
  });
});
