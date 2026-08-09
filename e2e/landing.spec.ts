import { test, expect } from "@playwright/test";

test("landing page renders the TorqueFlow heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "TorqueFlow" })).toBeVisible();
});
