import { describe, expect, it } from "vitest";
import { DEFAULT_DVI_CHECKLIST_ITEMS } from "./checklist-items";

describe("DEFAULT_DVI_CHECKLIST_ITEMS", () => {
  it("has a unique, non-empty key and label for every item", () => {
    expect(DEFAULT_DVI_CHECKLIST_ITEMS.length).toBeGreaterThan(0);

    const keys = DEFAULT_DVI_CHECKLIST_ITEMS.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);

    for (const item of DEFAULT_DVI_CHECKLIST_ITEMS) {
      expect(item.key.length).toBeGreaterThan(0);
      expect(item.label.length).toBeGreaterThan(0);
    }
  });

  it("includes the frenos (brakes) checklist item, a legally required inspection point", () => {
    expect(DEFAULT_DVI_CHECKLIST_ITEMS.some((item) => item.key === "frenos")).toBe(true);
  });
});
