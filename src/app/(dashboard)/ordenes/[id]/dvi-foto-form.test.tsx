import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
    render(<DviFotoForm ordenId="o1" />);

    expect(screen.getByLabelText("Momento")).toBeInTheDocument();
    expect(screen.getByLabelText("Foto")).toBeInTheDocument();
  });

  it("shows the error message when the action returns one", async () => {
    mockAddDviFotoAction.mockResolvedValue({ error: "Primero guarda el checklist de inspección", success: false });
    render(<DviFotoForm ordenId="o1" />);

    const file = new File(["x"], "foto.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByLabelText("Foto"), file);
    await userEvent.click(screen.getByRole("button", { name: "Subir foto" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Primero guarda el checklist de inspección");
  });
});
