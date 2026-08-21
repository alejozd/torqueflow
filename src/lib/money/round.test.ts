import { describe, expect, it } from "vitest";
import { roundMoney } from "./round";

describe("roundMoney", () => {
  it("rounds to two decimals", () => {
    expect(roundMoney(22.382)).toBe(22.38);
    expect(roundMoney(22.385)).toBe(22.39);
  });

  it("leaves values that already have at most two decimals untouched", () => {
    expect(roundMoney(127.8)).toBe(127.8);
    expect(roundMoney(30)).toBe(30);
    expect(roundMoney(0)).toBe(0);
  });

  it("rounds negative values away from zero at the .5 boundary", () => {
    expect(roundMoney(-124.185)).toBe(-124.18);
  });
});
