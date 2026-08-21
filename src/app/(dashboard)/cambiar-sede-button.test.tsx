import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockSignOut = vi.fn();
vi.mock("next-auth/react", () => ({ signOut: (...args: unknown[]) => mockSignOut(...args) }));

import { CambiarSedeButton } from "./cambiar-sede-button";

describe("CambiarSedeButton", () => {
  beforeEach(() => {
    mockSignOut.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("sends the user back to the login page of the current tenant subdomain", async () => {
    render(<CambiarSedeButton />);

    await userEvent.click(screen.getByRole("button", { name: "Cambiar de sede" }));

    expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: `${window.location.origin}/login` });
  });
});
