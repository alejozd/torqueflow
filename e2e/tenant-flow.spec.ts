import { test, expect } from "@playwright/test";
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from "./global-setup";

test.use({ baseURL: "http://taller-e2e-smoke.localhost:3000" });

// A minimal valid 1x1 transparent PNG, used to exercise the DVI foto upload
// without committing a binary fixture file to the repo.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test("login through Orden de trabajo terminada y entregada, end to end", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(E2E_ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(E2E_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();

  await expect(page).toHaveURL(/\/clientes$/);

  await page.getByLabel("Nombre").fill("Juan Pérez");
  await page.getByRole("button", { name: "Crear cliente" }).click();
  await expect(page.getByRole("status")).toHaveText("Cliente creado");

  await page.getByRole("link", { name: "Juan Pérez" }).click();
  await expect(page.getByRole("heading", { name: "Juan Pérez" })).toBeVisible();

  await page.getByLabel("Placa").fill("ABC123");
  await page.getByLabel("Marca").fill("Toyota");
  await page.getByLabel("Modelo").fill("Corolla");
  await page.getByRole("button", { name: "Agregar vehículo" }).click();
  await expect(page.getByRole("status")).toHaveText("Vehículo agregado");

  await page.getByRole("link", { name: /ABC123/ }).click();
  await expect(page.getByRole("heading", { name: /ABC123/ })).toBeVisible();

  await page.getByLabel("Descripción").fill("Cambio de aceite y filtro");
  await page.getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByRole("status")).toHaveText("Entrada registrada");
  await expect(page.getByText("Cambio de aceite y filtro")).toBeVisible();

  // --- Fase 2: Orden de trabajo + DVI ---

  await page.getByLabel("Kilometraje de ingreso").fill("45000");
  await page.getByLabel("Síntomas reportados").fill("Ruido al frenar");
  await page.getByRole("button", { name: "Crear orden" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Orden creada" })).toBeVisible();

  await page.getByRole("link", { name: /EN_PROCESO|BORRADOR/ }).first().click();
  await expect(page.getByRole("heading", { name: /Orden — ABC123/ })).toBeVisible();

  await page.getByLabel("Descripción").first().fill("Pastillas de freno");
  await page.getByLabel("Cantidad").fill("4");
  await page.getByLabel("Precio unitario").fill("15");
  await page.getByRole("button", { name: "Agregar ítem" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Ítem agregado" })).toBeVisible();
  await expect(page.getByText("Pastillas de freno")).toBeVisible();

  await page.getByLabel("Descripción").nth(1).fill("Cambio de pastillas de freno");
  await page.getByLabel("Horas").fill("1.5");
  await page.getByLabel("Precio por hora").fill("20");
  await page.getByRole("button", { name: "Agregar mano de obra" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Mano de obra agregada" })).toBeVisible();

  await page.getByLabel("Frenos", { exact: true }).selectOption("CRITICO");
  await page.getByRole("button", { name: "Guardar checklist" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Checklist guardado" })).toBeVisible();

  await page.getByLabel("Momento").selectOption("ANTES");
  await page.getByLabel("Foto").setInputFiles({
    name: "antes.png",
    mimeType: "image/png",
    buffer: Buffer.from(TINY_PNG_BASE64, "base64"),
  });
  await page.getByRole("button", { name: "Subir foto" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Foto subida" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Foto antes de la inspección" })).toBeVisible();

  await page.getByLabel("Cambiar estado a").selectOption("EN_PROCESO");
  await page.getByRole("button", { name: "Cambiar estado" }).click();
  await expect(page.getByRole("heading", { name: "Estado: EN_PROCESO" })).toBeVisible();

  await page.getByLabel("Cambiar estado a").selectOption("TERMINADA");
  await page.getByRole("button", { name: "Cambiar estado" }).click();
  await expect(page.getByRole("heading", { name: "Estado: TERMINADA" })).toBeVisible();

  await page.getByLabel("Cambiar estado a").selectOption("ENTREGADA");
  await page.getByRole("button", { name: "Cambiar estado" }).click();
  await expect(page.getByText(/Estado actual: Entregada/)).toBeVisible();
});
