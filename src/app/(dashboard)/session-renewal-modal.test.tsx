import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";

const mockSignOut = vi.fn();
const mockUpdate = vi.fn();

let mockSessionState: {
  data: { user: { email: string }; expires: string } | null;
  status: "authenticated" | "unauthenticated" | "loading";
  update: typeof mockUpdate;
};

vi.mock("next-auth/react", () => ({
  useSession: () => mockSessionState,
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

import { SessionRenewalModal } from "./session-renewal-modal";
import {
  EXPIRY_WARNING_LEAD_MS,
  EXPIRY_WARNING_RESPONSE_MS,
  INACTIVITY_TIMEOUT_MS,
  SESSION_EXPIRY_CHECK_INTERVAL_MS,
} from "@/lib/auth/session-timing";

function authenticated(expiresInMs: number) {
  mockSessionState = {
    data: { user: { email: "a@a.com" }, expires: new Date(Date.now() + expiresInMs).toISOString() },
    status: "authenticated",
    update: mockUpdate,
  };
}

describe("SessionRenewalModal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSignOut.mockReset();
    mockUpdate.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders nothing while the session is far from expiring", () => {
    authenticated(EXPIRY_WARNING_LEAD_MS * 10);
    render(<SessionRenewalModal />);

    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("shows the warning once inside the expiry lead window", () => {
    authenticated(EXPIRY_WARNING_LEAD_MS - 1000);
    render(<SessionRenewalModal />);

    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText("Tu sesión está a punto de expirar. ¿Deseas continuar?")).toBeTruthy();
  });

  it("renews the session and hides the warning when the user accepts", async () => {
    authenticated(EXPIRY_WARNING_LEAD_MS - 1000);
    render(<SessionRenewalModal />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
      await Promise.resolve();
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("signs out immediately when the user declines", () => {
    authenticated(EXPIRY_WARNING_LEAD_MS - 1000);
    render(<SessionRenewalModal />);

    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: `${window.location.origin}/login` });
  });

  it("signs out automatically when the warning gets no response in time", () => {
    authenticated(EXPIRY_WARNING_LEAD_MS - 1000);
    render(<SessionRenewalModal />);

    act(() => {
      vi.advanceTimersByTime(EXPIRY_WARNING_RESPONSE_MS);
    });

    expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: `${window.location.origin}/login` });
  });

  it("signs out once the JWT itself expires, even without a warning render", () => {
    authenticated(1000);
    render(<SessionRenewalModal />);

    act(() => {
      vi.advanceTimersByTime(SESSION_EXPIRY_CHECK_INTERVAL_MS);
    });

    expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: `${window.location.origin}/login` });
  });

  it("signs out after 15 minutes with no user activity", () => {
    authenticated(EXPIRY_WARNING_LEAD_MS * 10);
    render(<SessionRenewalModal />);

    act(() => {
      vi.advanceTimersByTime(INACTIVITY_TIMEOUT_MS);
    });

    expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: `${window.location.origin}/login` });
  });

  it("resets the inactivity timer when the user is active", () => {
    authenticated(EXPIRY_WARNING_LEAD_MS * 10);
    render(<SessionRenewalModal />);

    act(() => {
      vi.advanceTimersByTime(INACTIVITY_TIMEOUT_MS - 1000);
    });
    act(() => {
      window.dispatchEvent(new Event("mousemove"));
    });
    act(() => {
      vi.advanceTimersByTime(INACTIVITY_TIMEOUT_MS - 1000);
    });

    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("renders nothing when there is no authenticated session", () => {
    mockSessionState = { data: null, status: "unauthenticated", update: mockUpdate };
    render(<SessionRenewalModal />);

    act(() => {
      vi.advanceTimersByTime(INACTIVITY_TIMEOUT_MS);
    });

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
