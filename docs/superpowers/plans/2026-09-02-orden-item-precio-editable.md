# Ítem de orden: descripción condicional + precio editable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In "Agregar ítem" of an orden, hide the Descripción field when a repuesto is selected (it's discarded server-side today), and let the user override the repuesto's suggested `precioVenta` for that specific item — saved only on the item, never on the Repuesto record.

**Architecture:** Three sequential changes: (1) expose `precioVenta` on the existing `RepuestoOption` read model so the client can read the suggested price, (2) stop overriding the submitted `precioUnitario` in `addItemOrdenAction` once a repuesto is confirmed to exist, tightening the zod schema so the field is always required instead of conditionally required, (3) reorganize `AgregarItemForm`'s JSX into two rows (Repuesto+Cantidad always visible; Descripción only when no repuesto is selected, Precio unitario always visible and prefilled from the selected repuesto).

**Tech Stack:** Next.js Server Actions, Zod 4, react-hook-form + `@hookform/resolvers/zod`, Prisma (tenant client), Vitest + Testing Library.

## Global Constraints

- Strict TDD Mode is enabled for this repo: write/update the failing test before touching implementation code, for every step below.
- Commit format per this repo's `RULES.md`: one atomic commit per task, message prefixed `fase-orden-item-precio-task N: <breve descripción>`.
- Never add `Co-Authored-By` to these commits (per this repo's `CLAUDE.md`) — conventional commits only. This differs from the session-level attribution used for the design-doc commit; application code commits in this plan follow the repo's own rule.
- Spanish stays in domain identifiers, UI copy, and Zod error messages (matches the rest of the codebase); prose/comments in English.

---

### Task 1: Expose `precioVenta` on `RepuestoOption`

**Files:**
- Modify: `src/app/actions/repuesto-actions.ts:24-28` (interface), `:56-67` (`listRepuestoOptions`)
- Test: `src/app/actions/repuesto-actions.test.ts:254-272`

**Interfaces:**
- Produces: `RepuestoOption` gains `precioVenta: number`. `listRepuestoOptions(bodegaId?: string): Promise<RepuestoOption[]>` unchanged signature, new field in each returned row.

- [ ] **Step 1: Update the two `listRepuestoOptions` tests to expect `precioVenta` in the Prisma `select`**

Edit `src/app/actions/repuesto-actions.test.ts:254-272` (replace both `select` assertions):

```ts
  it("combines an explicit bodegaId with the sede filter in listRepuestoOptions", async () => {
    await listRepuestoOptions("b1");

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { bodegaId: "b1", bodega: { sedeId: "sede-1" } },
      select: { id: true, codigo: true, nombre: true, precioVenta: true },
      orderBy: { nombre: "asc" },
    });
  });

  it("still applies the sede filter when no bodegaId is given", async () => {
    await listRepuestoOptions();

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { bodega: { sedeId: "sede-1" } },
      select: { id: true, codigo: true, nombre: true, precioVenta: true },
      orderBy: { nombre: "asc" },
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/actions/repuesto-actions.test.ts`
Expected: FAIL — both `listRepuestoOptions` tests, actual `select` missing `precioVenta: true`.

- [ ] **Step 3: Add `precioVenta` to the interface and the Prisma select**

Edit `src/app/actions/repuesto-actions.ts:24-28`:

```ts
export interface RepuestoOption {
  id: string;
  codigo: string;
  nombre: string;
  precioVenta: number;
}
```

Edit `src/app/actions/repuesto-actions.ts:56-67` (the `select` inside `listRepuestoOptions`):

```ts
export async function listRepuestoOptions(bodegaId?: string): Promise<RepuestoOption[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.repuesto.findMany({
    where: {
      ...(bodegaId ? { bodegaId } : {}),
      ...scopeRepuesto(session.user.sedeActivaId),
    },
    select: { id: true, codigo: true, nombre: true, precioVenta: true },
    orderBy: { nombre: "asc" },
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/actions/repuesto-actions.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/app/actions/repuesto-actions.ts src/app/actions/repuesto-actions.test.ts
git commit -m "fase-orden-item-precio-task 1: exponer precioVenta en RepuestoOption"
```

---

### Task 2: Make `precioUnitario` an editable override in `addItemOrdenAction`

**Files:**
- Modify: `src/lib/validation/orden.ts:11-20` (`itemOrdenInputSchema`)
- Modify: `src/app/actions/item-orden-actions.ts:48-63` (`addItemOrdenAction`)
- Test: `src/app/actions/item-orden-actions.test.ts`

**Interfaces:**
- Consumes: none new (uses existing `tenantDb.repuesto.findFirst`, `scopeRepuesto`).
- Produces: `itemOrdenInputSchema` — `precioUnitario` is now always required (`number`, no longer `| undefined`); `.refine()` condition is now `Boolean(repuestoId) || Boolean(descripcion)` with message `"Selecciona un repuesto del inventario o completa la descripción manualmente"`. `addItemOrdenAction` now persists `precioUnitario` from the submitted form in both the catalog-linked and manual branches — it no longer reads `repuesto.precioVenta` for the saved value.

- [ ] **Step 1: Update the two affected existing tests and add two new ones in `item-orden-actions.test.ts`**

Replace the test at `item-orden-actions.test.ts:49-58` (neither repuestoId nor descripcion):

```ts
  it("returns a validation error when neither repuestoId nor descripcion are given", async () => {
    const formData = new FormData();
    formData.set("cantidad", "2");
    formData.set("precioUnitario", "10");

    const result = await addItemOrdenAction("o1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Selecciona un repuesto del inventario o completa la descripción manualmente");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns a validation error when precioUnitario is missing", async () => {
    const formData = new FormData();
    formData.set("descripcion", "Filtro de aceite");
    formData.set("cantidad", "2");

    const result = await addItemOrdenAction("o1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("El precio unitario es obligatorio");
    expect(mockCreate).not.toHaveBeenCalled();
  });
```

Replace the test at `item-orden-actions.test.ts:76-98` (catalog-linked item):

```ts
  it("creates a catalog-linked item, using descripcion from the Repuesto but the submitted precioUnitario (the suggested price is editable)", async () => {
    mockRepuestoFindFirst.mockResolvedValue({ id: "r1", nombre: "Filtro de aceite Bosch", precioVenta: 18.9 });
    mockCreate.mockResolvedValue({ id: "i1" });
    const formData = new FormData();
    formData.set("repuestoId", "r1");
    formData.set("cantidad", "3");
    formData.set("precioUnitario", "20");

    const result = await addItemOrdenAction("o1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockRepuestoFindFirst).toHaveBeenCalledWith({
      where: { id: "r1", bodega: { sedeId: "sede-1" } },
    });
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        ordenId: "o1",
        repuestoId: "r1",
        descripcion: "Filtro de aceite Bosch",
        cantidad: 3,
        precioUnitario: 20,
      },
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/actions/item-orden-actions.test.ts`
Expected: FAIL — the "neither repuestoId nor descripcion" test gets the old refine message or a different first issue; "precioUnitario is missing" fails because the field is still optional; the catalog-linked test gets `precioUnitario: 18.9` instead of `20`.

- [ ] **Step 3: Tighten `itemOrdenInputSchema`**

Edit `src/lib/validation/orden.ts:11-20`:

```ts
export const itemOrdenInputSchema = z
  .object({
    repuestoId: z.string().optional().or(z.literal("")),
    descripcion: z.string().optional().or(z.literal("")),
    cantidad: z.coerce.number().int().min(1, "La cantidad debe ser al menos 1"),
    precioUnitario: z.coerce
      .number({ error: "El precio unitario es obligatorio" })
      .min(0, "El precio no puede ser negativo"),
  })
  .refine((data) => Boolean(data.repuestoId) || Boolean(data.descripcion), {
    message: "Selecciona un repuesto del inventario o completa la descripción manualmente",
  });
```

- [ ] **Step 4: Stop overriding `precioUnitario` in `addItemOrdenAction`**

Edit `src/app/actions/item-orden-actions.ts:48-63` (replace the `let descripcion / let precioUnitario` block through the `else` branch):

```ts
  let descripcion: string;

  if (parsed.data.repuestoId) {
    const repuesto = await tenantDb.repuesto.findFirst({
      where: { id: parsed.data.repuestoId, ...scopeRepuesto(session.user.sedeActivaId) },
    });
    if (!repuesto) {
      return { error: "Repuesto no encontrado", success: false };
    }
    descripcion = repuesto.nombre;
  } else {
    descripcion = parsed.data.descripcion as string;
  }
  const precioUnitario = parsed.data.precioUnitario;
```

(The `create` call below this block already reads `descripcion` and `precioUnitario` by name — no change needed there.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/app/actions/item-orden-actions.test.ts`
Expected: PASS (all tests in the file, including the untouched ones — the manual-item, terminal-state, factura, and other-sede tests already set `precioUnitario` explicitly and are unaffected).

- [ ] **Step 6: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/lib/validation/orden.ts src/app/actions/item-orden-actions.ts src/app/actions/item-orden-actions.test.ts
git commit -m "fase-orden-item-precio-task 2: precio unitario editable al agregar item con repuesto"
```

---

### Task 3: Reorganize `AgregarItemForm` — conditional Descripción, prefilled editable Precio unitario

**Files:**
- Modify: `src/app/(dashboard)/ordenes/[id]/agregar-item-form.tsx`
- Test: `src/app/(dashboard)/ordenes/[id]/agregar-item-form.test.tsx`

**Interfaces:**
- Consumes: `RepuestoOption` from Task 1 (`{ id, codigo, nombre, precioVenta }`).
- Produces: no new exports — `AgregarItemForm`'s prop signature is unchanged (`repuestos: RepuestoOption[]` already existed; it now carries `precioVenta`).

- [ ] **Step 1: Update the fixture and the cross-field error message in the test file, and add two new tests**

Edit `agregar-item-form.test.tsx:22` (fixture gains `precioVenta`):

```ts
const repuestos = [{ id: "r1", codigo: "FRN-001", nombre: "Filtro de aceite", precioVenta: 12.5 }] as never;
```

Edit `agregar-item-form.test.tsx:56-65` (message text):

```tsx
  it("blocks submission and shows the cross-field error when neither a repuesto nor descripcion is given", async () => {
    render(<AgregarItemForm ordenId="o1" repuestos={repuestos} bodegas={bodegas} proveedores={proveedores} puedeCrearRepuesto={true} />);

    await userEvent.type(screen.getByLabelText("Precio unitario"), "10");
    await userEvent.click(screen.getByRole("button", { name: "Agregar ítem" }));

    expect(
      await screen.findByText("Selecciona un repuesto del inventario o completa la descripción manualmente"),
    ).toBeInTheDocument();
    expect(mockAddItemOrdenAction).not.toHaveBeenCalled();
  });
```

(Typing a Precio unitario value is now required to reach the cross-field error, since that field is no longer optional — otherwise the per-field "El precio unitario es obligatorio" error would be the one asserted instead.)

Add two new tests after the `"does not show '+ Crear repuesto nuevo'..."` test, before the closing `});` at line 117:

```tsx
  it("hides Descripción and prefills Precio unitario with the repuesto's suggested price when a repuesto is selected", async () => {
    render(<AgregarItemForm ordenId="o1" repuestos={repuestos} bodegas={bodegas} proveedores={proveedores} puedeCrearRepuesto={true} />);

    await userEvent.click(screen.getByLabelText("Repuesto del inventario (opcional)"));
    await userEvent.click(await screen.findByRole("option", { name: /Filtro de aceite/ }));

    expect(screen.queryByLabelText("Descripción")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Precio unitario")).toHaveValue(12.5);
  });

  it("submits the price the user typed after overriding the prefilled suggested price", async () => {
    render(<AgregarItemForm ordenId="o1" repuestos={repuestos} bodegas={bodegas} proveedores={proveedores} puedeCrearRepuesto={true} />);

    await userEvent.click(screen.getByLabelText("Repuesto del inventario (opcional)"));
    await userEvent.click(await screen.findByRole("option", { name: /Filtro de aceite/ }));
    await userEvent.type(screen.getByLabelText("Cantidad"), "2");
    const precioInput = screen.getByLabelText("Precio unitario");
    await userEvent.clear(precioInput);
    await userEvent.type(precioInput, "20");
    await userEvent.click(screen.getByRole("button", { name: "Agregar ítem" }));

    await screen.findByRole("status");
    const submittedFormData = mockAddItemOrdenAction.mock.calls[0][2] as FormData;
    expect(submittedFormData.get("precioUnitario")).toBe("20");
  });
```

- [ ] **Step 2: Run the tests to verify the new/changed ones fail**

Run: `npx vitest run "src/app/(dashboard)/ordenes/[id]/agregar-item-form.test.tsx"`
Expected: FAIL — cross-field message test (old text still shown), and the two new tests (Descripción still renders unconditionally; Precio unitario never prefills).

- [ ] **Step 3: Reorganize the form JSX and add the prefill effect**

Edit `agregar-item-form.tsx:3` (add `useEffect` to the React import):

```tsx
import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
```

Edit `agregar-item-form.tsx:67-90` (destructure `setValue`, and derive the selected repuesto + prefill effect):

```tsx
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<ItemFormInput>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: { repuestoId: "", descripcion: "", cantidad: "", precioUnitario: "" },
  });
  const { field: repuestoIdField } = useController({ name: "repuestoId", control });
  // The .refine() above has no field path, so zodResolver keys it under "" --
  // not a real field, hence the cast (FieldErrors<T> only types known field keys).
  const formError = (errors as Record<string, { message?: string } | undefined>)[""]?.message;

  const repuestoOptions: ComboboxOption[] = useMemo(
    () => {
      const options = repuestos.map((repuesto) => ({ value: repuesto.id, label: `${repuesto.codigo} — ${repuesto.nombre}` }));
      if (puedeCrearRepuesto) {
        options.push({ value: CREAR_NUEVO_VALUE, label: "+ Crear repuesto nuevo" });
      }
      return options;
    },
    [repuestos, puedeCrearRepuesto],
  );

  const repuestoSeleccionado = repuestos.find((repuesto) => repuesto.id === repuestoIdField.value) ?? null;

  // Only the initial pick prefills the field -- once it's set, further
  // renders (e.g. the user editing Cantidad) must not stomp on a value the
  // user may have already overridden by hand.
  useEffect(() => {
    if (repuestoSeleccionado) {
      setValue("precioUnitario", String(repuestoSeleccionado.precioVenta));
    }
  }, [repuestoSeleccionado, setValue]);
```

Edit `agregar-item-form.tsx:109-185` (the two `FormGroup`s — replace entirely):

```tsx
        <FormGroup label="Repuesto">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="repuestoId">Repuesto del inventario (opcional)</Label>
              <Combobox
                id="repuestoId"
                items={repuestoOptions}
                value={repuestoIdField.value ?? ""}
                onValueChange={(value) => {
                  if (value === CREAR_NUEVO_VALUE) {
                    setCrearDialogOpen(true);
                    return;
                  }
                  repuestoIdField.onChange(value);
                }}
                placeholder="Ítem manual (completa descripción y precio abajo)"
                emptyMessage="Ningún repuesto coincide"
                // "+ Crear repuesto nuevo" stays visible no matter what the
                // user typed -- it's always reachable, not just when nothing
                // else matches. Reimplements Combobox's own diacritic-
                // insensitive default filter for every other row.
                filter={(item, query) =>
                  item.value === CREAR_NUEVO_VALUE ||
                  normalizeForSearch(item.label).includes(normalizeForSearch(query))
                }
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="itemCantidad">Cantidad</Label>
              <Input
                id="itemCantidad"
                type="number"
                min="1"
                required
                className="font-mono"
                aria-invalid={errors.cantidad ? true : undefined}
                aria-describedby={errors.cantidad ? "itemCantidad-error" : undefined}
                {...register("cantidad")}
              />
              {errors.cantidad ? <p id="itemCantidad-error">{errors.cantidad.message}</p> : null}
            </div>
          </div>
        </FormGroup>

        <FormGroup label="Descripción y precio">
          <div className={repuestoSeleccionado ? "grid grid-cols-1 gap-4" : "grid grid-cols-1 gap-4 sm:grid-cols-2"}>
            {repuestoSeleccionado ? null : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="itemDescripcion">Descripción</Label>
                <Input
                  id="itemDescripcion"
                  aria-invalid={errors.descripcion ? true : undefined}
                  aria-describedby={errors.descripcion ? "itemDescripcion-error" : undefined}
                  {...register("descripcion")}
                />
                {errors.descripcion ? <p id="itemDescripcion-error">{errors.descripcion.message}</p> : null}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="itemPrecioUnitario">Precio unitario</Label>
              <Input
                id="itemPrecioUnitario"
                type="number"
                min="0"
                step="0.01"
                className="font-mono"
                aria-invalid={errors.precioUnitario ? true : undefined}
                aria-describedby={errors.precioUnitario ? "itemPrecioUnitario-error" : undefined}
                {...register("precioUnitario")}
              />
              {errors.precioUnitario ? <p id="itemPrecioUnitario-error">{errors.precioUnitario.message}</p> : null}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {repuestoSeleccionado
              ? "El precio se sugiere desde el inventario, pero puedes ajustarlo para este ítem."
              : "Completa la descripción y el precio para un ítem que no está en el inventario."}
          </p>
        </FormGroup>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "src/app/(dashboard)/ordenes/[id]/agregar-item-form.test.tsx"`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add "src/app/(dashboard)/ordenes/[id]/agregar-item-form.tsx" "src/app/(dashboard)/ordenes/[id]/agregar-item-form.test.tsx"
git commit -m "fase-orden-item-precio-task 3: reorganizar agregar-item-form con precio editable"
```

---

### Task 4: Manual browser verification

**Files:** none (manual QA only).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (only if not already running — per this repo's `RULES.md`, avoid starting it unless necessary for this verification).

- [ ] **Step 2: Verify the catalog-linked path**

Open an existing orden's detail page, open "Agregar ítem", select a repuesto from the combobox. Confirm: Descripción disappears, Precio unitario fills in with the repuesto's `precioVenta`. Change the price to a different value, set Cantidad, submit. Confirm the new item appears in the orden's item list with the price you typed (not the original suggested price).

- [ ] **Step 3: Verify the manual-item path**

Open "Agregar ítem" again without selecting a repuesto. Confirm Descripción, Cantidad, and Precio unitario are all visible and all required (submit with fields empty shows the appropriate errors). Fill all three and submit; confirm the item appears with `repuestoId` unset.

- [ ] **Step 4: Report result to the user**

No commit for this task — it's verification only. Report pass/fail for both paths.
