import { describe, expect, it } from "vitest";
import { dviChecklistItemInputSchema } from "./dvi";

describe("dviChecklistItemInputSchema", () => {
  it("rejects a blank label and trims it", () => {
    expect(dviChecklistItemInputSchema.safeParse({ label: "   " }).success).toBe(false);
    expect(dviChecklistItemInputSchema.parse({ label: "  Frenos " }).label).toBe("Frenos");
  });
});
