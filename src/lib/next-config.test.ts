import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("next.config", () => {
  it("no anuncia el framework con X-Powered-By", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
