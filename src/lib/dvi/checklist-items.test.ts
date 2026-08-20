import { describe, expect, it } from "vitest";
import { DVI_CHECKLIST_ITEMS } from "./checklist-items";

describe("DVI_CHECKLIST_ITEMS", () => {
  it("has a unique, non-empty key and label for every item", () => {
    expect(DVI_CHECKLIST_ITEMS.length).toBeGreaterThan(0);

    const keys = DVI_CHECKLIST_ITEMS.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);

    for (const item of DVI_CHECKLIST_ITEMS) {
      expect(item.key.length).toBeGreaterThan(0);
      expect(item.label.length).toBeGreaterThan(0);
    }
  });

  it("includes the frenos (brakes) checklist item, a legally required inspection point", () => {
    expect(DVI_CHECKLIST_ITEMS.some((item) => item.key === "frenos")).toBe(true);
  });
});
