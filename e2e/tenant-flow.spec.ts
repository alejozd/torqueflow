import { test, expect } from "@playwright/test";
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from "./global-setup";

test.use({ baseURL: "http://taller-e2e-smoke.localhost:3000" });

// A minimal valid 1x1 transparent PNG, used to exercise the DVI foto upload
// without committing a binary fixture file to the repo.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test("login through Inventario, Orden de trabajo, and DVI, end to end", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(E2E_ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(E2E_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();

  await expect(page).toHaveURL(/\/clientes$/);

  // --- Fase 3: Inventario, repuestos y proveedores ---

  await page.goto("/bodegas");
  await expect(page.getByText("Bodega principal")).toBeVisible();
  await page.getByLabel("Nombre").fill("Bodega norte");
  await page.getByRole("button", { name: "Crear bodega" }).click();
  await expect(page.getByRole("status")).toHaveText("Bodega creada");
  await expect(page.getByText("Bodega norte")).toBeVisible();

  await page.goto("/proveedores");
  await page.getByLabel("Nombre").fill("Repuestos El Motor");
  await page.getByRole("button", { name: "Crear proveedor" }).click();
  await expect(page.getByRole("status")).toHaveText("Proveedor creado");

  await page.goto("/repuestos");
  await page.getByLabel("Código").fill("FRN-001");
  await page.getByLabel("Nombre").fill("Filtro de aceite");
  await page.getByLabel("Precio de compra").fill("8");
  await page.getByLabel("Precio de venta").fill("18.9");
  await page.getByLabel("Stock inicial").fill("0");
  await page.getByLabel("Stock mínimo").fill("5");
  await page.getByLabel("Bodega").selectOption({ label: "Bodega principal" });
  await page.getByLabel("Proveedor").selectOption({ label: "Repuestos El Motor" });
  await page.getByRole("button", { name: "Crear repuesto" }).click();
  await expect(page.getByRole("status")).toHaveText("Repuesto creado");

  await page.goto("/entradas-mercancia");
  await page.getByLabel("Proveedor").selectOption({ label: "Repuestos El Motor" });
  await page.getByLabel("Bodega").selectOption({ label: "Bodega principal" });
  await page.getByRole("button", { name: "Crear entrada" }).click();
  await expect(page.getByRole("status")).toHaveText("Entrada creada");

  await page.getByRole("link", { name: /Repuestos El Motor/ }).click();
  await expect(page.getByRole("heading", { name: /Entrada de mercancía/ })).toBeVisible();

  await page.getByLabel("Repuesto").selectOption({ label: "FRN-001 — Filtro de aceite" });
  await page.getByLabel("Cantidad").fill("20");
  await page.getByLabel("Precio de compra unitario").fill("8");
  await page.getByRole("button", { name: "Registrar ítem" }).click();
  await expect(page.getByRole("status")).toHaveText("Ítem registrado, stock actualizado");

  await page.goto("/repuestos");
  await expect(page.getByText(/FRN-001.*stock: 20/)).toBeVisible();

  // --- Fase 1: Clientes, Vehículos, Historial ---

  await page.goto("/clientes");
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
  await page.getByLabel("Mecánico asignado").selectOption({ label: "Tec E2E" });
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

  // --- Fase 3: link a catalog Repuesto to this same order — trusted server-side pricing, no stock deduction ---

  await page.getByLabel("Repuesto del inventario (opcional)").selectOption({ label: "FRN-001 — Filtro de aceite" });
  await page.getByLabel("Cantidad").fill("2");
  await page.getByRole("button", { name: "Agregar ítem" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Ítem agregado" })).toBeVisible();
  await expect(page.getByText(/Filtro de aceite — 2 x 18.9/)).toBeVisible();

  await page.goto("/repuestos");
  await expect(page.getByText(/FRN-001.*stock: 20/)).toBeVisible();

  await page.goto(`/ordenes`);
  await page.getByRole("link", { name: /ABC123/ }).click();

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
  const [uploadsResponse] = await Promise.all([
    page.waitForResponse(
      (resp) => resp.url().includes("/api/uploads/") && resp.request().resourceType() === "image",
    ),
    page.getByRole("button", { name: "Subir foto" }).click(),
  ]);
  expect(uploadsResponse.status()).toBe(200);
  await expect(page.getByRole("status").filter({ hasText: "Foto subida" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Foto antes de la inspección" })).toBeVisible();

  await page.getByLabel("Cambiar estado a").selectOption("EN_PROCESO");
  await page.getByRole("button", { name: "Cambiar estado" }).click();
  await expect(page.getByRole("heading", { name: "Estado: EN_PROCESO" })).toBeVisible();

  await page.getByLabel("Cambiar estado a").selectOption("TERMINADA");
  await page.getByRole("button", { name: "Cambiar estado" }).click();
  await expect(page.getByRole("heading", { name: "Estado: TERMINADA" })).toBeVisible();

  // --- Fase 4: Facturación y pagos ---

  await page.getByLabel("Descuento").fill("10");
  await page.getByRole("button", { name: "Generar factura" }).click();
  await expect(page.getByRole("heading", { name: /Factura #1/ })).toBeVisible();
  await expect(page.getByText("Subtotal: 127.8")).toBeVisible();
  await expect(page.getByText("IVA (19%): 22.38")).toBeVisible();
  await expect(page.getByText("Total: 140.18")).toBeVisible();
  await expect(page.getByText("Saldo pendiente: 140.18")).toBeVisible();

  await page.getByLabel("Monto").fill("100");
  await page.getByLabel("Método de pago").selectOption("EFECTIVO");
  await page.getByRole("button", { name: "Registrar pago" }).click();
  await expect(page.getByRole("status")).toHaveText("Pago registrado");
  await expect(page.getByText("Saldo pendiente: 40.18")).toBeVisible();
  await expect(page.getByText("Estado: Pendiente")).toBeVisible();

  await page.getByLabel("Monto").fill("40.18");
  await page.getByLabel("Método de pago").selectOption("TRANSFERENCIA");
  await page.getByRole("button", { name: "Registrar pago" }).click();
  await expect(page.getByRole("status")).toHaveText("Factura pagada");
  await expect(page.getByText("Estado: Pagada")).toBeVisible();
  await expect(page.getByText("Saldo pendiente: 0")).toBeVisible();

  await page.goto("/repuestos");
  await expect(page.getByText(/FRN-001.*stock: 18/)).toBeVisible();

  await page.goto("/ordenes");
  await page.getByRole("link", { name: /ABC123/ }).click();
  await expect(page.getByRole("link", { name: /Ver factura #1/ })).toBeVisible();

  await page.getByLabel("Cambiar estado a").selectOption("ENTREGADA");
  await page.getByRole("button", { name: "Cambiar estado" }).click();
  await expect(page.getByText(/Estado actual: Entregada/)).toBeVisible();

  await page.goto("/repuestos");
  await expect(page.getByText(/FRN-001.*stock: 18/)).toBeVisible();
});
