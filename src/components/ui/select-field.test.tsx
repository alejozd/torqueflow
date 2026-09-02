import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SelectField } from "./select-field";

const ITEMS = [
  { value: "a", label: "Opción A" },
  { value: "b", label: "Opción B" },
];

describe("SelectField", () => {
  it("shows the placeholder when the controlled value matches no item", () => {
    render(<SelectField items={ITEMS} value="" onValueChange={vi.fn()} placeholder="Elige una opción" />);
    expect(screen.getByText("Elige una opción")).toBeInTheDocument();
  });

  it("shows the selected item's label in the trigger", () => {
    render(<SelectField items={ITEMS} value="b" onValueChange={vi.fn()} />);
    expect(screen.getByText("Opción B")).toBeInTheDocument();
  });

  it("opens the popup and lists every item as an option", async () => {
    const user = userEvent.setup();
    render(<SelectField items={ITEMS} value="" onValueChange={vi.fn()} id="campo" />);
    await user.click(screen.getByRole("combobox"));
    expect(await screen.findByRole("option", { name: "Opción A" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Opción B" })).toBeInTheDocument();
  });

  it("calls onValueChange with the selected item's value", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<SelectField items={ITEMS} value="" onValueChange={onValueChange} />);
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Opción B" }));
    expect(onValueChange).toHaveBeenCalledWith("b");
  });

  it("supports uncontrolled usage via name + defaultValue for native form submission", () => {
    render(<SelectField items={ITEMS} name="campo" defaultValue="a" />);
    expect(screen.getByText("Opción A")).toBeInTheDocument();
  });
});
