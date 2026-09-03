import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAddDviFotoAction = vi.fn();
vi.mock("@/app/actions/dvi-actions", () => ({
  addDviFotoAction: (...args: unknown[]) => mockAddDviFotoAction(...args),
}));

import { DviFotoForm } from "./dvi-foto-form";

describe("DviFotoForm", () => {
  beforeEach(() => {
    mockAddDviFotoAction.mockReset();
    mockAddDviFotoAction.mockResolvedValue({ error: null, success: true });
  });

  it("renders the momento select and file input", () => {
    render(<DviFotoForm ordenId="o1" fotos={[]} />);

    expect(screen.getByLabelText("Momento")).toBeInTheDocument();
    expect(screen.getByLabelText("Foto")).toBeInTheDocument();
  });

  it("submits the momento the user actually picked, not just the default", async () => {
    render(<DviFotoForm ordenId="o1" fotos={[]} />);

    await userEvent.click(screen.getByLabelText("Momento"));
    await userEvent.click(await screen.findByRole("option", { name: "Después" }));

    const file = new File(["x"], "foto.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByLabelText("Foto"), file);
    await userEvent.click(screen.getByRole("button", { name: "Subir foto" }));

    expect(mockAddDviFotoAction).toHaveBeenCalled();
    const formData = mockAddDviFotoAction.mock.calls[0][2] as FormData;
    expect(formData.get("momento")).toBe("DESPUES");
  });

  it("shows the error message when the action returns one", async () => {
    mockAddDviFotoAction.mockResolvedValue({ error: "Primero guarda el checklist de inspección", success: false });
    render(<DviFotoForm ordenId="o1" fotos={[]} />);

    const file = new File(["x"], "foto.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByLabelText("Foto"), file);
    await userEvent.click(screen.getByRole("button", { name: "Subir foto" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Primero guarda el checklist de inspección");
  });

  it("shows the empty-state message when there are no fotos yet", () => {
    render(<DviFotoForm ordenId="o1" fotos={[]} />);

    expect(screen.getByText("Esta orden no tiene fotos de inspección.")).toBeInTheDocument();
  });

  it("renders one bordered image per foto, captioned by momento", () => {
    render(
      <DviFotoForm
        ordenId="o1"
        fotos={[
          { id: "f1", url: "https://example.com/f1.jpg", momento: "ANTES" } as never,
          { id: "f2", url: "https://example.com/f2.jpg", momento: "DESPUES" } as never,
        ]}
      />,
    );

    const antesFigure = screen.getByAltText("Foto antes de la inspección").closest("figure") as HTMLElement;
    const despuesFigure = screen.getByAltText("Foto después de la inspección").closest("figure") as HTMLElement;
    expect(antesFigure).toHaveClass("border");
    expect(despuesFigure).toHaveClass("border");
    expect(within(antesFigure).getByText("Antes")).toBeInTheDocument();
    expect(within(despuesFigure).getByText("Después")).toBeInTheDocument();
  });
});
