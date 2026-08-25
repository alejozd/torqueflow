import { test, expect } from "@playwright/test";
import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_RECEPCION_EMAIL,
  E2E_RECEPCION_PASSWORD,
  E2E_TECNICO_EMAIL,
  E2E_TECNICO_PASSWORD,
  E2E_TECNICO_NOMBRE,
} from "./global-setup";
import { login } from "./login-helper";

// A minimal valid 1x1 transparent PNG, used to exercise the DVI foto upload
// without committing a binary fixture file to the repo.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test("login through Inventario, Orden de trabajo, and DVI, end to end", async ({ page }) => {
  await page.goto("/login");
  await login(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, "Sede principal");

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
  // Captured here (Sede principal) for Fase 6's direct-URL cross-sede check.
  const ordenAbc123Url = page.url();

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

  // SMTP is not configured yet at this point in the flow, so the estado
  // change must still succeed and surface a non-blocking advertencia.
  await expect(
    page.getByRole("status").filter({ hasText: "no se notificó al cliente" }),
  ).toBeVisible();

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

  // --- Fase 5: Dashboard y reportes básicos ---

  // The ADMIN sees the nav entry; the default range is the current month to
  // date, which covers everything this spec just created.
  await expect(page.getByRole("link", { name: "Reportes" })).toBeVisible();
  await page.getByRole("link", { name: "Reportes" }).click();
  await expect(page.getByRole("heading", { name: "Reportes" })).toBeVisible();

  await expect(page.getByText("Facturas emitidas: 1")).toBeVisible();
  await expect(page.getByText("Total facturado: 140.18")).toBeVisible();
  await expect(page.getByText("Costo de repuestos: 16")).toBeVisible();
  await expect(page.getByText("Margen bruto: 101.8")).toBeVisible();
  await expect(page.getByText("Mano de obra facturada: 30")).toBeVisible();

  const filaTecnico = page.getByRole("row").filter({ hasText: "Tec E2E" });
  // Cell-scoped: "1" alone would ambiguously match inside "1.5", so this
  // targets the "Órdenes entregadas" <td> (column index 1) directly.
  await expect(filaTecnico.locator("td").nth(1)).toHaveText("1");
  await expect(filaTecnico).toContainText("1.5");
  await expect(filaTecnico).toContainText("30");

  // An explicit range that still contains today's fixtures must produce the
  // same numbers — proves the GET form actually round-trips through searchParams.
  const hoy = new Date();
  const aIso = (fecha: Date) => fecha.toISOString().slice(0, 10);
  const primerDiaDelMes = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));

  await page.getByLabel("Desde").fill(aIso(primerDiaDelMes));
  await page.getByLabel("Hasta").fill(aIso(hoy));
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect(page).toHaveURL(/\/reportes\?desde=/);
  await expect(page.getByText("Total facturado: 140.18")).toBeVisible();

  // A range that excludes today's fixtures must zero out — proves the date
  // filter really filters instead of always returning every row.
  await page.getByLabel("Desde").fill("2020-01-01");
  await page.getByLabel("Hasta").fill("2020-01-31");
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect(page.getByText("Facturas emitidas: 0")).toBeVisible();
  await expect(page.getByText("Total facturado: 0")).toBeVisible();
  await expect(page.getByText("No hay órdenes entregadas en este rango.")).toBeVisible();

  // An inverted range is rejected by the schema, not silently swapped.
  await page.getByLabel("Desde").fill("2026-08-22");
  await page.getByLabel("Hasta").fill("2026-08-21");
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect(page.getByRole("alert")).toHaveText("La fecha inicial no puede ser posterior a la final");

  // --- Fase 5: role gate — reportes son solo para ADMIN ---

  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login/);

  await login(page, E2E_TECNICO_EMAIL, E2E_TECNICO_PASSWORD, "Sede principal");

  await expect(page.getByRole("link", { name: "Reportes" })).toHaveCount(0);

  await page.goto("/reportes");
  await expect(page).toHaveURL(/\/login\?error=forbidden/);
  // Two role="alert" elements exist on this page after a client-side
  // navigation: the app's own <p role="alert"> (src/app/login/page.tsx) and
  // Next.js's __next-route-announcer__, which also gets populated for a11y.
  // Scope to the app's element by its known text, same pattern as the
  // getByRole("status") ambiguity fixed in Fase 2 Task 14.
  await expect(page.getByRole("alert").filter({ hasText: "No tienes permiso" })).toHaveText(
    "No tienes permiso para acceder a esa sección.",
  );

  // --- Fase 6: gestión de sedes y aislamiento por sede activa ---

  // Already on /login (the previous forbidden-role redirect landed here) --
  // no explicit sign-out needed, signIn() overwrites the TECNICO session.
  // Back in as ADMIN, in Sede principal, to create a second sede.
  await login(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, "Sede principal");

  // The header states which sede scopes everything below it.
  await expect(page.getByText("Sede: Sede principal")).toBeVisible();

  await page.getByRole("link", { name: "Sedes" }).click();
  await expect(page.getByRole("heading", { name: "Sedes", level: 1 })).toBeVisible();

  await page.getByLabel("Nombre", { exact: true }).fill("Sede norte");
  await page.getByLabel("Dirección", { exact: true }).fill("Calle 80 #10-20");
  await page.getByRole("button", { name: "Crear sede" }).click();
  await expect(page.getByRole("status")).toHaveText("Sede creada");
  await expect(page.getByRole("heading", { name: "Sede norte", level: 2 })).toBeVisible();

  // A sede with órdenes and bodegas cannot be deleted -- the RESTRICT guard.
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Eliminar Sede principal" }).click();
  await expect(page.getByRole("heading", { name: "Sede principal", level: 2 })).toBeVisible();

  // Assign the técnico to the new sede as well as the original one.
  await page.getByRole("link", { name: "Usuarios" }).click();
  await expect(page.getByRole("heading", { name: "Usuarios", level: 1 })).toBeVisible();

  await page.getByLabel(`Sede norte para ${E2E_TECNICO_NOMBRE}`).check();
  await page.getByRole("button", { name: `Guardar sedes de ${E2E_TECNICO_NOMBRE}` }).click();
  await expect(page.getByRole("status")).toHaveText("Sedes actualizadas");

  // --- Módulo 10: usuario create/edit/delete, ADMIN-only ---

  await page.getByRole("link", { name: "Crear usuario" }).click();
  await page.getByLabel("Nombre").fill("Usuario E2E");
  await page.getByLabel("Correo").fill("usuario-e2e@e2e-smoke.test");
  await page.getByLabel("Contraseña").fill("SmokeTest123!");
  await page.getByLabel("Rol").selectOption("RECEPCION");
  await page.getByRole("button", { name: "Crear usuario" }).click();
  await expect(page.getByRole("status")).toHaveText("Usuario creado");

  await page.getByRole("link", { name: "Usuarios" }).click();
  await expect(page.getByRole("heading", { name: "Usuario E2E", level: 2 })).toBeVisible();

  await page
    .getByRole("row")
    .filter({ hasText: "Usuario E2E" })
    .getByRole("link", { name: "Editar" })
    .click();
  await expect(page.getByRole("heading", { name: "Editar usuario", level: 1 })).toBeVisible();
  await page.getByLabel("Rol").selectOption("TECNICO");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByRole("status")).toHaveText("Usuario actualizado");

  // deleteUsuarioAction is a plain form action (no useActionState, no
  // visible success signal) -- click() only waits for the click event
  // itself, not the underlying server-action fetch. waitForLoadState("networkidle")
  // is not reliable here either: under this test's concurrent 2-worker load
  // (racing super-admin-flow.spec.ts on the same dev server), it can resolve
  // during a brief lull before the delete's own fetch has even started.
  // Wait for that specific request's response instead -- deterministic
  // regardless of load, matching this file's own established pattern for the
  // DVI photo upload above.
  const editarUsuarioUrl = page.url();
  const [deleteResponse] = await Promise.all([
    page.waitForResponse((resp) => resp.url() === editarUsuarioUrl && resp.request().method() === "POST"),
    page.getByRole("button", { name: "Eliminar usuario" }).click(),
  ]);
  expect(deleteResponse.status()).toBe(200);

  await page.goto("/usuarios");
  await expect(page.getByRole("heading", { name: "Usuario E2E", level: 2 })).toHaveCount(0);

  // --- The isolation proof: the same técnico, in the other sede, sees nothing ---

  await page.getByRole("button", { name: "Cambiar de sede" }).click();
  await expect(page).toHaveURL(/\/login/);

  await login(page, E2E_TECNICO_EMAIL, E2E_TECNICO_PASSWORD, "Sede norte");
  await expect(page.getByText("Sede: Sede norte")).toBeVisible();

  // Clientes stay tenant-wide by design -- Juan Pérez is still here.
  await expect(page.getByRole("link", { name: "Juan Pérez" })).toBeVisible();

  // Everything sede-scoped is empty: the ABC123 orden, its factura, the
  // bodegas and FRN-001 all live in Sede principal.
  await page.goto("/ordenes");
  await expect(page.getByRole("link", { name: /ABC123/ })).toHaveCount(0);

  // The IDOR boundary itself: pasting Sede principal's own orden URL while
  // logged into Sede norte must 404, not resolve -- getOrden's findFirst (not
  // findUnique) is what this proves, not just that the list hides the link.
  const directUrlResponse = await page.goto(ordenAbc123Url);
  expect(directUrlResponse?.status()).toBe(404);

  await page.goto("/bodegas");
  await expect(page.getByText("Bodega principal")).toHaveCount(0);
  await expect(page.getByText("Bodega norte")).toHaveCount(0);

  await page.goto("/repuestos");
  await expect(page.getByText(/FRN-001/)).toHaveCount(0);

  await page.goto("/facturas");
  await expect(page.getByText(/Factura #1/)).toHaveCount(0);

  // Back in Sede principal, the same técnico sees all of it again -- proof the
  // rows were filtered by sede, not deleted or hidden by some other accident.
  await page.getByRole("button", { name: "Cambiar de sede" }).click();
  await login(page, E2E_TECNICO_EMAIL, E2E_TECNICO_PASSWORD, "Sede principal");

  await page.goto("/ordenes");
  await expect(page.getByRole("link", { name: /ABC123/ })).toBeVisible();

  await page.goto("/repuestos");
  await expect(page.getByText(/FRN-001.*stock: 18/)).toBeVisible();

  // --- ADMIN: bypasses UsuarioSede, y compara sedes en /reportes ---

  await page.getByRole("button", { name: "Cambiar de sede" }).click();
  // The ADMIN was never assigned to Sede norte on /usuarios, and gets in anyway.
  await login(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, "Sede norte");
  await expect(page.getByText("Sede: Sede norte")).toBeVisible();

  await page.getByRole("link", { name: "Reportes" }).click();
  await expect(page.getByText("Facturas emitidas: 0")).toBeVisible();
  await expect(page.getByText("Total facturado: 0")).toBeVisible();

  // Switching the report's sede selector reaches the other sede's numbers --
  // read-only cross-sede comparison, without changing the sede activa.
  await page.getByLabel("Sede").selectOption({ label: "Sede principal" });
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect(page.getByText("Facturas emitidas: 1")).toBeVisible();
  await expect(page.getByText("Total facturado: 140.18")).toBeVisible();
  await expect(page.getByText("Sede: Sede norte")).toBeVisible();

  // --- A técnico still cannot reach the sede admin surfaces ---

  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await login(page, E2E_TECNICO_EMAIL, E2E_TECNICO_PASSWORD, "Sede principal");

  await expect(page.getByRole("link", { name: "Sedes" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Usuarios" })).toHaveCount(0);

  await page.goto("/sedes");
  await expect(page).toHaveURL(/\/login\?error=forbidden/);
  await expect(page.getByRole("alert").filter({ hasText: "No tienes permiso" })).toHaveText(
    "No tienes permiso para acceder a esa sección.",
  );

  // --- Fase 7: agendamiento de citas y aislamiento por sede ---

  // A RECEPCION user books on behalf of a customer who called. This user was
  // seeded into Sede principal only, which is where vehículo ABC123's orden y
  // factura already live.
  // Already on /login (the previous forbidden-role redirect landed here) --
  // no explicit sign-out needed, signIn() overwrites the TECNICO session.
  await login(page, E2E_RECEPCION_EMAIL, E2E_RECEPCION_PASSWORD, "Sede principal");

  await page.getByRole("link", { name: "Citas" }).click();
  await expect(page.getByRole("heading", { name: "Citas", level: 1 })).toBeVisible();
  await expect(page.getByText("No hay citas agendadas en esta sede.")).toBeVisible();

  // selectOption's `label` matcher is typed as string, not RegExp -- the exact
  // label is deterministic from this spec's own fixtures (ABC123 / Toyota
  // Corolla / Juan Pérez, seeded earlier in this same test).
  await page.getByLabel("Vehículo").selectOption({ label: "ABC123 — Toyota Corolla (Juan Pérez)" });
  await page.getByLabel("Fecha y hora").fill("2026-09-01T10:30");
  await page.getByLabel("Motivo").fill("Mantenimiento preventivo");
  await page.getByLabel("Notas").fill("El cliente llamó para agendar");
  await page.getByRole("button", { name: "Agendar cita" }).click();
  await expect(page.getByRole("status")).toHaveText("Cita agendada");

  const enlaceCita = page.getByRole("link", { name: /ABC123 — Mantenimiento preventivo/ });
  await expect(enlaceCita).toBeVisible();
  await enlaceCita.click();
  await expect(page.getByRole("heading", { name: "Cita ABC123", level: 1 })).toBeVisible();
  await expect(page.getByText("Estado actual: PROGRAMADA")).toBeVisible();

  // Capture the detail URL while it legitimately resolves -- this exact URL is
  // the IDOR probe below.
  const citaUrl = page.url();
  expect(citaUrl).toMatch(/\/citas\/[a-z0-9]+$/);

  // RECEPCION may confirm the appointment.
  await page.getByLabel("Estado").selectOption("CONFIRMADA");
  await page.getByRole("button", { name: "Actualizar estado" }).click();
  await expect(page.getByRole("status")).toHaveText("Estado actualizado");
  await expect(page.getByText("Estado actual: CONFIRMADA")).toBeVisible();

  // --- The isolation proof: the same cita is unreachable from the other sede ---

  // ADMIN in Sede norte. ADMIN bypasses the UsuarioSede assignment check, but
  // NOT the sede scoping -- which is exactly what makes this a real boundary
  // test rather than a permissions test.
  await page.getByRole("button", { name: "Cambiar de sede" }).click();
  await login(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, "Sede norte");
  await expect(page.getByText("Sede: Sede norte")).toBeVisible();

  await page.goto("/citas");
  await expect(page.getByText("No hay citas agendadas en esta sede.")).toBeVisible();
  await expect(page.getByText(/Mantenimiento preventivo/)).toHaveCount(0);

  // Not just hidden from the list: pasting Sede principal's own cita URL while
  // logged into Sede norte must 404. That is getCita's findFirst + scopeCita,
  // and nothing else on this route can produce a 404.
  const citaDirectaResponse = await page.goto(citaUrl);
  expect(citaDirectaResponse?.status()).toBe(404);

  // Back in Sede principal the same ADMIN sees it again -- proof the row was
  // filtered by sede, not deleted or hidden by some other accident.
  await page.getByRole("button", { name: "Cambiar de sede" }).click();
  await login(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, "Sede principal");
  await page.goto("/citas");
  await expect(page.getByRole("link", { name: /ABC123 — Mantenimiento preventivo/ })).toBeVisible();

  // --- The SMTP settings page is ADMIN-only ---

  await page.getByRole("link", { name: "SMTP" }).click();
  await expect(page.getByRole("heading", { name: "Configuración SMTP", level: 1 })).toBeVisible();
  // Nothing stored yet, so the password is required and the test button is absent.
  await expect(page.getByLabel("Contraseña")).toHaveAttribute("required", "");
  await expect(page.getByRole("button", { name: "Enviar correo de prueba" })).toHaveCount(0);

  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  // This sign-out fires from an authenticated ADMIN page, so it triggers a
  // real navigation -- wait for it to settle before filling the login form,
  // same pattern as the "Cambiar de sede" transition at line ~311.
  await expect(page).toHaveURL(/\/login/);
  await login(page, E2E_RECEPCION_EMAIL, E2E_RECEPCION_PASSWORD, "Sede principal");

  // The nav link is not even rendered for a non-ADMIN...
  await expect(page.getByRole("link", { name: "SMTP" })).toHaveCount(0);
  // ...and the URL itself is refused, not merely hidden.
  await page.goto("/configuracion-smtp");
  await expect(page).toHaveURL(/\/login\?error=forbidden$/);
});
