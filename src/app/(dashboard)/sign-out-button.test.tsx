import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockSignOut = vi.fn();

vi.mock("next-auth/react", () => ({ signOut: (...args: unknown[]) => mockSignOut(...args) }));

import { SignOutButton } from "./sign-out-button";

describe("SignOutButton", () => {
  beforeEach(() => {
    mockSignOut.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("calls signOut with an absolute redirect to /login on the current origin when clicked", async () => {
    render(<SignOutButton />);

    await userEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    expect(mockSignOut).toHaveBeenCalledWith({
      callbackUrl: `${window.location.origin}/login`,
    });
  });
});
