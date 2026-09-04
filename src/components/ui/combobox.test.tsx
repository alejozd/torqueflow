import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Combobox, type ComboboxOption } from "./combobox";

const items: ComboboxOption[] = [
  { value: "a", label: "Ana Pérez" },
  { value: "b", label: "María Gómez" },
];

describe("Combobox", () => {
  it("renders each item's label by default", async () => {
    render(<Combobox items={items} value="" onValueChange={() => {}} />);

    await userEvent.click(screen.getByRole("combobox"));

    expect(await screen.findByRole("option", { name: "Ana Pérez" })).toBeInTheDocument();
  });

  it("renders custom per-item content via renderOption instead of the plain label", async () => {
    render(
      <Combobox
        items={items}
        value=""
        onValueChange={() => {}}
        renderOption={(item) => (
          <span>
            {item.label} <span>(extra)</span>
          </span>
        )}
      />,
    );

    await userEvent.click(screen.getByRole("combobox"));

    expect(await screen.findByRole("option", { name: "Ana Pérez (extra)" })).toBeInTheDocument();
  });
});
