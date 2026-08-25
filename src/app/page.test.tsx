import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRedirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (url: string) => mockRedirect(url) }));

import Home from "./page";

describe("Home", () => {
  beforeEach(() => {
    mockRedirect.mockClear();
  });

  it("redirects to /login (Fase 10: single URL, no subdomain landing page)", () => {
    expect(() => Home()).toThrow("REDIRECT:/login");
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });
});
