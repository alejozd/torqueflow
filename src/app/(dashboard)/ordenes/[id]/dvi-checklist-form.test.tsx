import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUpdateDviChecklistAction = vi.fn();
vi.mock("@/app/actions/dvi-actions", () => ({
  updateDviChecklistAction: (...args: unknown[]) => mockUpdateDviChecklistAction(...args),
}));

import { DviChecklistForm } from "./dvi-checklist-form";

describe("DviChecklistForm", () => {
  beforeEach(() => {
    mockUpdateDviChecklistAction.mockReset();
    mockUpdateDviChecklistAction.mockResolvedValue({ error: null, success: true });
  });

  it("renders one select per checklist item, defaulting to the saved status", () => {
    render(<DviChecklistForm ordenId="o1" checklist={{ frenos: "CRITICO" }} />);

    // SelectField (Base UI) isn't a native <select>, so its value shows up as
    // the trigger's text content rather than an element .value.
    expect(screen.getByLabelText("Frenos")).toHaveTextContent("Crítico");
    expect(screen.getByLabelText("Luces (altas, bajas, direccionales)")).toHaveTextContent("OK");
  });

  it("submits the status the user actually picked for a given item, not just its default", async () => {
    render(<DviChecklistForm ordenId="o1" checklist={{ frenos: "OK" }} />);

    await userEvent.click(screen.getByLabelText("Frenos"));
    await userEvent.click(await screen.findByRole("option", { name: "Atención" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar checklist" }));

    expect(mockUpdateDviChecklistAction).toHaveBeenCalled();
    const formData = mockUpdateDviChecklistAction.mock.calls[0][2] as FormData;
    expect(formData.get("frenos")).toBe("ATENCION");
  });

  it("shows a success message after a successful submit", async () => {
    render(<DviChecklistForm ordenId="o1" checklist={null} />);

    await userEvent.click(screen.getByRole("button", { name: "Guardar checklist" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Checklist guardado");
  });
});
