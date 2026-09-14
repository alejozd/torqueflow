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

  it("keeps an inactive item with a saved status out of the active selects, not shown to a non-ADMIN at all", () => {
    const itemsConArchivado = [
      ...ITEMS,
      { id: "i3", key: "bateria", label: "Batería", activo: false, orden: 2, createdAt: new Date() },
    ];

    render(
      <DviChecklistForm ordenId="o1" checklist={{ frenos: "OK", bateria: "CRITICO" }} items={itemsConArchivado} />,
    );

    expect(screen.queryByText("Batería")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Batería")).not.toBeInTheDocument();
  });

  it("hides an inactive item that was never given a status from a non-ADMIN too", () => {
    const itemsConInactivoSinValor = [
      ...ITEMS,
      { id: "i3", key: "bateria", label: "Batería", activo: false, orden: 2, createdAt: new Date() },
    ];

    render(<DviChecklistForm ordenId="o1" checklist={{ frenos: "OK" }} items={itemsConInactivoSinValor} />);

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

  it("removes a deactivated item from the active rows after toggle succeeds", async () => {
    render(<DviChecklistForm ordenId="o1" checklist={null} items={ITEMS} esAdmin />);

    // Before deactivation, Frenos select is present and has the add button
    expect(screen.getByLabelText("Frenos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agregar ítem" })).toBeInTheDocument();

    // Click deactivate
    await userEvent.click(screen.getByRole("button", { name: "Desactivar Frenos" }));

    // After deactivation (with no saved value for Frenos), the Frenos select should no longer be in the document
    // because it's now inactive and has no saved status to render as archived
    expect(screen.queryByLabelText("Frenos")).not.toBeInTheDocument();
    // But other active items remain
    expect(screen.getByLabelText("Luces (altas, bajas, direccionales)")).toBeInTheDocument();
  });

  it("only shows the inactive-items toggle to an ADMIN, and only when one exists", () => {
    const itemsConInactivoSinValor = [
      ...ITEMS,
      { id: "i3", key: "bateria", label: "Batería", activo: false, orden: 2, createdAt: new Date() },
    ];

    const { unmount: unmountNonAdmin } = render(
      <DviChecklistForm ordenId="o1" checklist={null} items={itemsConInactivoSinValor} esAdmin={false} />,
    );
    expect(screen.queryByRole("button", { name: "Ver ítems desactivados (1)" })).not.toBeInTheDocument();
    unmountNonAdmin();

    const { unmount: unmountNoInactivos } = render(
      <DviChecklistForm ordenId="o1" checklist={null} items={ITEMS} esAdmin />,
    );
    expect(screen.queryByText(/Ver ítems desactivados/)).not.toBeInTheDocument();
    unmountNoInactivos();

    render(<DviChecklistForm ordenId="o1" checklist={null} items={itemsConInactivoSinValor} esAdmin />);
    expect(screen.getByRole("button", { name: "Ver ítems desactivados (1)" })).toBeInTheDocument();
  });

  it("expands the inactive-items list on toggle click, showing the item's label", async () => {
    const itemsConInactivoSinValor = [
      ...ITEMS,
      { id: "i3", key: "bateria", label: "Batería", activo: false, orden: 2, createdAt: new Date() },
    ];

    render(<DviChecklistForm ordenId="o1" checklist={null} items={itemsConInactivoSinValor} esAdmin />);

    expect(screen.queryByText("Batería")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Ver ítems desactivados (1)" }));

    expect(screen.getByText("Batería")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reactivar Batería" })).toBeInTheDocument();
  });

  it("counts an inactive item with a saved value toward the reactivation toggle too, showing it as Archivado when expanded", async () => {
    const itemsConAmbos = [
      ...ITEMS,
      { id: "i3", key: "bateria", label: "Batería", activo: false, orden: 2, createdAt: new Date() },
      { id: "i4", key: "aceite", label: "Aceite", activo: false, orden: 3, createdAt: new Date() },
    ];

    render(
      <DviChecklistForm ordenId="o1" checklist={{ aceite: "CRITICO" }} items={itemsConAmbos} esAdmin />,
    );

    expect(screen.getByRole("button", { name: "Ver ítems desactivados (2)" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Ver ítems desactivados (2)" }));

    expect(screen.getByText("Archivado")).toBeInTheDocument();
    expect(screen.getByText("Crítico")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reactivar Aceite" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reactivar Batería" })).toBeInTheDocument();
  });

  it("reactivates an item and refreshes the page when an ADMIN clicks its reactivate control", async () => {
    const itemsConInactivoSinValor = [
      ...ITEMS,
      { id: "i3", key: "bateria", label: "Batería", activo: false, orden: 2, createdAt: new Date() },
    ];

    render(<DviChecklistForm ordenId="o1" checklist={null} items={itemsConInactivoSinValor} esAdmin />);

    await userEvent.click(screen.getByRole("button", { name: "Ver ítems desactivados (1)" }));
    await userEvent.click(screen.getByRole("button", { name: "Reactivar Batería" }));

    expect(mockToggleDviChecklistItemActivoAction).toHaveBeenCalledWith("i3");
    expect(mockRefresh).toHaveBeenCalled();
    expect(screen.getByLabelText("Batería")).toBeInTheDocument();
  });

  it("reactivates an archived item and restores its previously saved value in the select", async () => {
    const itemsConArchivado = [
      ...ITEMS,
      { id: "i3", key: "bateria", label: "Batería", activo: false, orden: 2, createdAt: new Date() },
    ];

    render(
      <DviChecklistForm ordenId="o1" checklist={{ bateria: "CRITICO" }} items={itemsConArchivado} esAdmin />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Ver ítems desactivados (1)" }));
    await userEvent.click(screen.getByRole("button", { name: "Reactivar Batería" }));

    expect(screen.getByLabelText("Batería")).toHaveTextContent("Crítico");
  });
});
