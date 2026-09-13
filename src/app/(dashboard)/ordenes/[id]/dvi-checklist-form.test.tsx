import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUpdateDviChecklistAction = vi.fn();
vi.mock("@/app/actions/dvi-actions", () => ({
  updateDviChecklistAction: (...args: unknown[]) => mockUpdateDviChecklistAction(...args),
}));

const mockToggleDviChecklistItemActivoAction = vi.fn();
vi.mock("@/app/actions/dvi-checklist-item-actions", () => ({
  toggleDviChecklistItemActivoAction: (...args: unknown[]) => mockToggleDviChecklistItemActivoAction(...args),
  crearDviChecklistItemAction: vi.fn(),
}));

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { DviChecklistForm } from "./dvi-checklist-form";

const ITEMS = [
  { id: "i1", key: "frenos", label: "Frenos", activo: true, orden: 0, createdAt: new Date() },
  {
    id: "i2",
    key: "luces",
    label: "Luces (altas, bajas, direccionales)",
    activo: true,
    orden: 1,
    createdAt: new Date(),
  },
];

describe("DviChecklistForm", () => {
  beforeEach(() => {
    mockUpdateDviChecklistAction.mockReset().mockResolvedValue({ error: null, success: true });
    mockToggleDviChecklistItemActivoAction.mockReset().mockResolvedValue(undefined);
    mockRefresh.mockReset();
  });

  it("renders one select per active checklist item, defaulting to the saved status", () => {
    render(<DviChecklistForm ordenId="o1" checklist={{ frenos: "CRITICO" }} items={ITEMS} />);

    expect(screen.getByLabelText("Frenos")).toHaveTextContent("Crítico");
    expect(screen.getByLabelText("Luces (altas, bajas, direccionales)")).toHaveTextContent("OK");
  });

  it("submits the status the user actually picked for a given item, not just its default", async () => {
    render(<DviChecklistForm ordenId="o1" checklist={{ frenos: "OK" }} items={ITEMS} />);

    await userEvent.click(screen.getByLabelText("Frenos"));
    await userEvent.click(await screen.findByRole("option", { name: "Atención" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar checklist" }));

    expect(mockUpdateDviChecklistAction).toHaveBeenCalled();
    const formData = mockUpdateDviChecklistAction.mock.calls[0][2] as FormData;
    expect(formData.get("frenos")).toBe("ATENCION");
  });

  it("shows a success message after a successful submit", async () => {
    render(<DviChecklistForm ordenId="o1" checklist={null} items={ITEMS} />);

    await userEvent.click(screen.getByRole("button", { name: "Guardar checklist" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Checklist guardado");
  });

  it("shows an inactive item with a saved status as a read-only 'Archivado' row instead of a select", () => {
    const itemsConArchivado = [
      ...ITEMS,
      { id: "i3", key: "bateria", label: "Batería", activo: false, orden: 2, createdAt: new Date() },
    ];

    render(
      <DviChecklistForm ordenId="o1" checklist={{ frenos: "OK", bateria: "CRITICO" }} items={itemsConArchivado} />,
    );

    expect(screen.getByText("Archivado")).toBeInTheDocument();
    expect(screen.getByText("Batería")).toBeInTheDocument();
    expect(screen.queryByLabelText("Batería")).not.toBeInTheDocument();
  });

  it("hides the archived row for an inactive item that was never given a status", () => {
    const itemsConArchivadoSinValor = [
      ...ITEMS,
      { id: "i3", key: "bateria", label: "Batería", activo: false, orden: 2, createdAt: new Date() },
    ];

    render(<DviChecklistForm ordenId="o1" checklist={{ frenos: "OK" }} items={itemsConArchivadoSinValor} />);

    expect(screen.queryByText("Batería")).not.toBeInTheDocument();
  });

  it("only shows the add-item button and the per-item deactivate control to an ADMIN", () => {
    const { rerender } = render(
      <DviChecklistForm ordenId="o1" checklist={null} items={ITEMS} esAdmin={false} />,
    );

    expect(screen.queryByRole("button", { name: "Agregar ítem" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Desactivar Frenos" })).not.toBeInTheDocument();

    rerender(<DviChecklistForm ordenId="o1" checklist={null} items={ITEMS} esAdmin />);

    expect(screen.getByRole("button", { name: "Agregar ítem" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Desactivar Frenos" })).toBeInTheDocument();
  });

  it("deactivates an item and refreshes the page when an ADMIN clicks its deactivate control", async () => {
    render(<DviChecklistForm ordenId="o1" checklist={null} items={ITEMS} esAdmin />);

    await userEvent.click(screen.getByRole("button", { name: "Desactivar Frenos" }));

    expect(mockToggleDviChecklistItemActivoAction).toHaveBeenCalledWith("i1");
    expect(mockRefresh).toHaveBeenCalled();
  });
});
