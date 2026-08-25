import { test, expect } from "@playwright/test";

test("root redirects to the login page (Fase 10: single URL, no subdomain landing)", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Ingresar a TorqueFlow" })).toBeVisible();
});
