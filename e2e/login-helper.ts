import { expect, type Page } from "@playwright/test";

/**
 * Fase 10: the login form is email+password only. A sede is auto-resolved at
 * login when there is exactly one unambiguous candidate; otherwise the
 * session lands on /seleccionar-sede to complete it. This helper handles
 * both outcomes transparently -- pass `sedeNombre` whenever the test cares
 * which sede ends up active; it is only used if /seleccionar-sede is
 * actually reached.
 */
export async function login(page: Page, email: string, password: string, sedeNombre?: string) {
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();

  // Not page.waitForURL(): Next.js's client router sets the URL to
  // "/clientes" optimistically (router.push) BEFORE the server's
  // requireSession() redirect to /seleccionar-sede is actually applied --
  // checking page.url() right after a URL-based wait can race that
  // transient state and wrongly conclude no sede selection was needed.
  // "Cambiar de sede" only renders once the dashboard layout has actually
  // mounted with a resolved session, so racing it against the
  // /seleccionar-sede heading is a stable signal either way.
  const seleccionarSedeHeading = page.getByRole("heading", { name: "Selecciona tu sede" });
  const cambiarSedeButton = page.getByRole("button", { name: "Cambiar de sede" });

  await Promise.race([
    seleccionarSedeHeading.waitFor({ state: "visible" }),
    cambiarSedeButton.waitFor({ state: "visible" }),
  ]);

  if (await seleccionarSedeHeading.isVisible()) {
    if (!sedeNombre) {
      throw new Error(`login(${email}): landed on /seleccionar-sede but no sedeNombre was given`);
    }
    await page.getByLabel("Sede").selectOption({ label: sedeNombre });
    await page.getByRole("button", { name: "Continuar" }).click();
    await cambiarSedeButton.waitFor({ state: "visible" });
  }

  await expect(page).toHaveURL(/\/clientes$/);
}
