# Select Styled Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 17 raw `<NativeSelect>` usages across the app with a new `SelectField` component (built on the already-existing, already-styled `src/components/ui/select.tsx` Base UI wrapper), so every dropdown's popup panel has rounded corners, a themed shadow, and a real hover/highlight state instead of OS-native chrome — while every test that currently drives the native `<select>` directly is rewritten to drive the new popup instead.

**Architecture:** `select.tsx` (Base UI `Select.Root`/`Trigger`/`Content`/`Item`, already styled, currently unused anywhere in the app) gets one new thin convenience wrapper, `SelectField` (`src/components/ui/select-field.tsx`), mirroring the existing `Combobox` component's API shape (`items`/`value`/`onValueChange`/`name`/`placeholder`) so the two stay consistent to read side by side. `SelectField` supports two wiring modes: **controlled** (`value`+`onValueChange`, for react-hook-form forms via `useController` — same pattern `agregar-item-form.tsx` already uses for `Combobox`) and **uncontrolled** (`name`+`defaultValue`, for forms that submit via a plain `<form action={serverAction}>` and rely on Base UI Select's hidden `<input name=...>` to participate in `FormData` automatically, the same way a native `<select name=...>` does today). `NativeSelect` and `native-select.tsx` are left in place and untouched — nothing in this plan requires removing them, and no other file references them once this plan's 17 target files are converted, so a later cleanup pass (out of scope here) can delete the now-dead file.

**Tech Stack:** Next.js, react-hook-form (`useController` for controlled fields), Zod, `@base-ui/react/select`, Vitest + Testing Library (`userEvent`), Tailwind.

## Global Constraints

- Strict TDD Mode is active (CLAUDE.md): every test-rewrite step below must first be run against the *old* code to confirm it still passes there (sanity baseline), then the code is converted, then the *new* test assertions are run and confirmed passing. Do not skip the "run before" check — it's what proves the rewrite is testing real behavior, not a tautology.
- RULES.md commit format for this ledger: `fase-orden-item-precio-task N: <description>` (continuing this session's numbering — the native-select chevron work was tasks 9/9b, so this plan starts at task 10). Commit + push immediately after each task, one task per commit, max 1 correction attempt per task before stopping and reporting.
- Every commit message in this plan MUST end with (per the active session-level override, which supersedes any older no-attribution note in RULES.md):
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01AqhA2dYmy76UnFLnwStpgc
  ```
- Run `npx tsc --noEmit` and the task's own test file(s) at the end of every task (not the full suite each time — that's Task 11's job).
- Do not touch `src/components/ui/combobox.tsx`, `src/components/ui/native-select.tsx`, or any file not explicitly listed in this plan's 17 target files.

---

## The two conversion recipes (read this before any task)

Every task below applies ONE of these two recipes verbatim, substituting the specific field name/items/labels found in that task's actual files. Both recipes assume `SelectField` from Task 1 already exists.

### Recipe A — Uncontrolled (native `<form action>` submission, no react-hook-form)

**Before** (a `NativeSelect` reading a `name` attribute for `FormData`, `defaultValue` for the initial selection):
```tsx
<NativeSelect
  id="mecanicoId"
  name="mecanicoId"
  defaultValue={mecanico?.id ?? ""}
  className="h-7 min-w-0 flex-1 rounded-md px-1.5 pr-6 text-xs"
>
  <option value="">Sin asignar</option>
  {tecnicos.map((tecnico) => (
    <option key={tecnico.id} value={tecnico.id}>
      {tecnico.nombre}
    </option>
  ))}
</NativeSelect>
```

**After:**
```tsx
<SelectField
  id="mecanicoId"
  name="mecanicoId"
  defaultValue={mecanico?.id ?? ""}
  size="sm"
  className="h-7 min-w-0 flex-1 px-1.5 text-xs"
  items={[
    { value: "", label: "Sin asignar" },
    ...tecnicos.map((tecnico) => ({ value: tecnico.id, label: tecnico.nombre })),
  ]}
/>
```
Rules:
- Every `<option value={x}>{label}</option>` becomes one `{ value: x, label }` entry in the `items` array, in the same order.
- Drop `pr-6`/`pr-7`-style right-padding overrides from `className` — `SelectTrigger` already reserves space for its own chevron icon.
- `defaultValue`, `name`, `id`, `key` (if the original had a remount-key), `required`, `disabled`, `aria-invalid`, `aria-describedby` all pass straight through unchanged.
- If the original had `className="h-7 ..."` (the compact variant), keep that plus add `size="sm"` — `size="sm"` sets height/radius, the leftover `className` still carries `text-xs`/layout classes `select.tsx`'s `SelectTrigger` doesn't already set.
- If the original had no compact className at all (full-size), omit `size` (defaults to `"default"`, matching `NativeSelect`'s own default `h-8`).
- Import: `import { SelectField } from "@/components/ui/select-field";` replacing `import { NativeSelect } from "@/components/ui/native-select";`.

### Recipe B — Controlled (react-hook-form `handleSubmit` + `useController`)

**Before** (a `NativeSelect` bound via `register()`):
```tsx
<NativeSelect
  id="mecanicoId"
  aria-invalid={errors.mecanicoId ? true : undefined}
  aria-describedby={errors.mecanicoId ? "mecanicoId-error" : undefined}
  {...register("mecanicoId")}
>
  <option value="">Sin asignar</option>
  {tecnicos.map((tecnico) => (
    <option key={tecnico.id} value={tecnico.id}>
      {tecnico.nombre}
    </option>
  ))}
</NativeSelect>
```

**After** — first add a `useController` call next to the existing `useForm()` destructure (mirrors `agregar-item-form.tsx`'s `repuestoIdField` exactly):
```tsx
const {
  register,
  handleSubmit,
  control,
  formState: { errors },
} = useForm<...>({ ... }); // control must be destructured — add it if not already present

const { field: mecanicoIdField } = useController({ name: "mecanicoId", control });
```
Add `useController` to the existing `import { useForm } from "react-hook-form";` line, making it `import { useController, useForm } from "react-hook-form";`.

Then the JSX:
```tsx
<SelectField
  id="mecanicoId"
  aria-invalid={errors.mecanicoId ? true : undefined}
  aria-describedby={errors.mecanicoId ? "mecanicoId-error" : undefined}
  value={mecanicoIdField.value ?? ""}
  onValueChange={mecanicoIdField.onChange}
  items={[
    { value: "", label: "Sin asignar" },
    ...tecnicos.map((tecnico) => ({ value: tecnico.id, label: tecnico.nombre })),
  ]}
/>
```

Because `SelectField` (like `Combobox`) is react-hook-form-controlled and NOT a native `<select name=...>`, it does not auto-populate `FormData` the way `register()` does. Find this form's submit handler:
```tsx
onSubmit={handleSubmit((data) =>
  startTransition(() => {
    const formData = new FormData(formRef.current!);
    formAction(formData);
  }),
)}
```
and add one `formData.set(...)` line per converted field, matching `agregar-item-form.tsx`'s existing comment style:
```tsx
onSubmit={handleSubmit((data) =>
  startTransition(() => {
    const formData = new FormData(formRef.current!);
    // mecanicoId is a SelectField (react-hook-form-controlled, not a native
    // <select name="..."> register()) -- it doesn't populate FormData on
    // its own, so it must be set explicitly here before submitting.
    formData.set("mecanicoId", data.mecanicoId ?? "");
    formAction(formData);
  }),
)}
```
If the form doesn't yet build `FormData` from a `formRef` this way (i.e. it currently submits purely via native `<form action={formAction}>` despite using RHF for validation), that's Recipe A territory instead — check the actual submit wiring before choosing a recipe; don't assume from the presence of `register()` alone.

### Test rewrite recipe (applies after either Recipe A or B)

**Before** (native-select test patterns — several equivalent shapes exist across the 17 test files):
```tsx
const select = screen.getByLabelText<HTMLSelectElement>("Mecánico");
expect(select.value).toBe("");
expect(screen.getByRole("option", { name: "Sin asignar" })).toBeInTheDocument();
await userEvent.selectOptions(select, "t2");
expect(select.value).toBe("t2");
```

**After:**
```tsx
const trigger = screen.getByRole("combobox", { name: "Mecánico" });
expect(trigger).toHaveTextContent("Sin asignar");
await userEvent.click(trigger);
expect(await screen.findByRole("option", { name: "Sin asignar" })).toBeInTheDocument();
await userEvent.click(screen.getByRole("option", { name: "Diego Salas" }));
expect(trigger).toHaveTextContent("Diego Salas");
```
Rules:
- `getByLabelText<HTMLSelectElement>("Label")` → `getByRole("combobox", { name: "Label" })` (no type parameter — it's a button now, not a select element).
- `select.value` assertions → `trigger` text-content assertions (`toHaveTextContent`), since there's no `.value` property on a trigger button; the value is only observable via what it displays or via the `onValueChange`/submitted-`FormData` mock, whichever the specific test is actually asserting.
- `getByRole("option", ...)` assertions that previously worked with the popup *closed* (native `<option>`s are always in the DOM) now require the popup to be open first — add `await userEvent.click(trigger)` before them. A `queryByRole("option", { name: "X" })).not.toBeInTheDocument()` negative assertion (e.g. `cambiar-estado-form.test.tsx`'s excluded-transition check) must also open the trigger first, then assert the excluded option truly isn't rendered among the open popup's items.
- `userEvent.selectOptions(select, "value")` → `await userEvent.click(trigger)` then `await userEvent.click(await screen.findByRole("option", { name: "<label matching that value>" }))`. Use `findByRole` (not `getByRole`) for the first item queried right after opening, since Base UI mounts the popup content on the open-state transition.

---

## Task 1: SelectField shared component

**Files:**
- Create: `src/components/ui/select-field.tsx`
- Test: `src/components/ui/select-field.test.tsx`

**Interfaces:**
- Consumes: `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` from `src/components/ui/select.tsx` (all already exist, unchanged).
- Produces: `SelectField` component and `SelectFieldOption` type, both exported from `@/components/ui/select-field`, consumed by every later task in this plan. Prop surface: `items: SelectFieldOption[]`, `value?: string`, `onValueChange?: (value: string) => void`, `defaultValue?: string`, `name?: string`, `placeholder?: string`, `disabled?: boolean`, `required?: boolean`, `className?: string`, `id?: string`, `size?: "sm" | "default"`, `"aria-invalid"?: boolean`, `"aria-describedby"?: string`.

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/select-field.test.tsx`:
```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SelectField } from "./select-field";

const ITEMS = [
  { value: "a", label: "Opción A" },
  { value: "b", label: "Opción B" },
];

describe("SelectField", () => {
  it("shows the placeholder when the controlled value matches no item", () => {
    render(<SelectField items={ITEMS} value="" onValueChange={vi.fn()} placeholder="Elige una opción" />);
    expect(screen.getByText("Elige una opción")).toBeInTheDocument();
  });

  it("shows the selected item's label in the trigger", () => {
    render(<SelectField items={ITEMS} value="b" onValueChange={vi.fn()} />);
    expect(screen.getByText("Opción B")).toBeInTheDocument();
  });

  it("opens the popup and lists every item as an option", async () => {
    const user = userEvent.setup();
    render(<SelectField items={ITEMS} value="" onValueChange={vi.fn()} id="campo" />);
    await user.click(screen.getByRole("combobox"));
    expect(await screen.findByRole("option", { name: "Opción A" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Opción B" })).toBeInTheDocument();
  });

  it("calls onValueChange with the selected item's value", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<SelectField items={ITEMS} value="" onValueChange={onValueChange} />);
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Opción B" }));
    expect(onValueChange).toHaveBeenCalledWith("b");
  });

  it("supports uncontrolled usage via name + defaultValue for native form submission", () => {
    render(<SelectField items={ITEMS} name="campo" defaultValue="a" />);
    expect(screen.getByText("Opción A")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ui/select-field.test.tsx`
Expected: FAIL — `Cannot find module './select-field'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/components/ui/select-field.tsx`:
```tsx
"use client"

import * as React from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export interface SelectFieldOption {
  value: string
  label: string
  disabled?: boolean
}

/**
 * Styled replacement for a plain <select> (native-select.tsx) when the
 * OS-native popup chrome is undesirable. Speaks in plain string values like
 * every other form field here, mirroring combobox.tsx's API shape
 * (items/value/onValueChange/name) so the two stay consistent to use
 * side by side.
 *
 * Two wiring modes:
 * - Controlled (react-hook-form via useController): pass value + onValueChange.
 * - Uncontrolled (native <form action> submission): pass name + defaultValue,
 *   omit value/onValueChange. Base UI's Select.Root renders a hidden
 *   <input name=...> kept in sync with the selection, so it participates in
 *   FormData the same way a native <select name=...> would.
 */
function SelectField({
  items,
  value,
  onValueChange,
  defaultValue,
  name,
  placeholder = "Selecciona...",
  disabled,
  required,
  className,
  id,
  size,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: {
  items: SelectFieldOption[]
  value?: string
  onValueChange?: (value: string) => void
  defaultValue?: string
  name?: string
  placeholder?: string
  disabled?: boolean
  required?: boolean
  className?: string
  id?: string
  size?: "sm" | "default"
  "aria-invalid"?: boolean | undefined
  "aria-describedby"?: string | undefined
}) {
  const isControlled = value !== undefined
  // Mirrors combobox.tsx: a value with no matching item (e.g. "" used as an
  // unset placeholder rather than a real "Sin asignar"-style choice) shows
  // the placeholder instead of a blank trigger.
  const hasMatch = isControlled ? items.some((item) => item.value === value) : true
  const selectValue = isControlled ? (hasMatch ? value : null) : undefined

  return (
    <Select
      items={items}
      value={isControlled ? selectValue : undefined}
      defaultValue={!isControlled ? defaultValue : undefined}
      onValueChange={
        onValueChange ? (nextValue) => onValueChange((nextValue as string | null) ?? "") : undefined
      }
      name={name}
      disabled={disabled}
      required={required}
    >
      <SelectTrigger
        id={id}
        size={size}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        className={className}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value} disabled={item.disabled}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export { SelectField }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/ui/select-field.test.tsx`
Expected: PASS, 5/5.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/select-field.tsx src/components/ui/select-field.test.tsx
git commit -m "$(cat <<'EOF'
fase-orden-item-precio-task 10: crear SelectField (Select con estilo sobre Base UI)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AqhA2dYmy76UnFLnwStpgc
EOF
)"
git push origin main
```

---

## Task 2: Convert asignar-mecanico-form.tsx (Recipe A, with remount-key)

**Files:**
- Modify: `src/app/(dashboard)/ordenes/[id]/asignar-mecanico-form.tsx`
- Test: `src/app/(dashboard)/ordenes/[id]/asignar-mecanico-form.test.tsx`

**Interfaces:**
- Consumes: `SelectField`/`SelectFieldOption` from `@/components/ui/select-field` (Task 1).

**Current state (read the file to confirm nothing has drifted, then apply this exact transform):**
```tsx
import { NativeSelect } from "@/components/ui/native-select";
// ...
<NativeSelect
  // defaultValue only applies on mount -- if ADMIN corrects an
  // already-assigned mecánico, this component stays mounted across
  // the revalidatePath re-render, so a plain defaultValue would
  // silently ignore the new value. Keying on it forces a remount.
  key={mecanico?.id ?? "sin-asignar"}
  id="mecanicoId"
  name="mecanicoId"
  defaultValue={mecanico?.id ?? ""}
  className="h-7 min-w-0 flex-1 rounded-md px-1.5 pr-6 text-xs"
>
  <option value="">Sin asignar</option>
  {tecnicos.map((tecnico) => (
    <option key={tecnico.id} value={tecnico.id}>
      {tecnico.nombre}
    </option>
  ))}
</NativeSelect>
```

- [ ] **Step 1: Run the existing test to confirm the baseline passes on the OLD code**

Run: `npx vitest run "src/app/(dashboard)/ordenes/[id]/asignar-mecanico-form.test.tsx"`
Expected: PASS (this is the pre-change baseline).

- [ ] **Step 2: Apply Recipe A** (see "The two conversion recipes" above)

Replace the import and the JSX block:
```tsx
import { SelectField } from "@/components/ui/select-field";
// ...
<SelectField
  key={mecanico?.id ?? "sin-asignar"}
  id="mecanicoId"
  name="mecanicoId"
  defaultValue={mecanico?.id ?? ""}
  size="sm"
  className="h-7 min-w-0 flex-1 px-1.5 text-xs"
  items={[
    { value: "", label: "Sin asignar" },
    ...tecnicos.map((tecnico) => ({ value: tecnico.id, label: tecnico.nombre })),
  ]}
/>
```
Keep the remount-key comment above it (still applies verbatim to `SelectField`'s own `defaultValue`-on-mount behavior).

- [ ] **Step 3: Rewrite the test's select interactions**

Read the current test file in full first (it has other assertions unrelated to the select — keep those untouched). Apply the "Test rewrite recipe" above to every line matching `getByRole<HTMLSelectElement>("combobox")`, `.value`, and `userEvent.selectOptions(...)`. Based on the known interaction lines from the survey (verify against the live file, which may have more context around them):
```tsx
// before:
const select = screen.getByRole<HTMLSelectElement>("combobox");
expect(select.value).toBe("");
expect(screen.getByRole("option", { name: "Sin asignar" })).toBeInTheDocument();
expect(screen.getByRole("option", { name: "Diego Salas" })).toBeInTheDocument();
// ...
await userEvent.selectOptions(screen.getByRole("combobox"), "t2");
// ...
await userEvent.selectOptions(select, "t2");

// after:
const trigger = screen.getByRole("combobox");
expect(trigger).toHaveTextContent("Sin asignar");
await userEvent.click(trigger);
expect(await screen.findByRole("option", { name: "Sin asignar" })).toBeInTheDocument();
expect(screen.getByRole("option", { name: "Diego Salas" })).toBeInTheDocument();
await userEvent.click(screen.getByRole("option", { name: "Diego Salas" })); // or whichever tecnico that test case needs
```
Adapt option names to whichever técnico id ("t2" etc.) each specific test case actually targets — read the fixture's técnico list in the test file to map ids to names correctly.

- [ ] **Step 4: Run the test to verify it passes against the new code**

Run: `npx vitest run "src/app/(dashboard)/ordenes/[id]/asignar-mecanico-form.test.tsx"`
Expected: PASS, same test count as Step 1.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/ordenes/[id]/asignar-mecanico-form.tsx" "src/app/(dashboard)/ordenes/[id]/asignar-mecanico-form.test.tsx"
git commit -m "$(cat <<'EOF'
fase-orden-item-precio-task 11: convertir asignar-mecanico-form a SelectField

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AqhA2dYmy76UnFLnwStpgc
EOF
)"
git push origin main
```

---

## Task 3: Convert dvi-checklist-form.tsx, dvi-foto-form.tsx, reportes/page.tsx (Recipe A, plain)

**Files:**
- Modify: `src/app/(dashboard)/ordenes/[id]/dvi-checklist-form.tsx`
- Modify: `src/app/(dashboard)/ordenes/[id]/dvi-foto-form.tsx`
- Modify: `src/app/(dashboard)/reportes/page.tsx`
- Test: `src/app/(dashboard)/ordenes/[id]/dvi-checklist-form.test.tsx`
- Test: `src/app/(dashboard)/ordenes/[id]/dvi-foto-form.test.tsx`
- (`reportes/page.tsx` has no dedicated test file — skip test rewrite for it, verify manually in Task 11's browser pass instead.)

**Interfaces:**
- Consumes: `SelectField`/`SelectFieldOption` from `@/components/ui/select-field` (Task 1).

**Known current state for `dvi-checklist-form.tsx` (verify against live file):**
```tsx
<NativeSelect
  id={item.key}
  name={item.key}
  defaultValue={valor}
  className="h-7 w-[90px] shrink-0 rounded-md px-1.5 pr-6 text-xs"
>
  {DVI_CHECKLIST_STATUSES.map((estado) => (
    <option key={estado} value={estado}>
      {ESTADO_LABELS[estado]}
    </option>
  ))}
</NativeSelect>
```

- [ ] **Step 1: Run existing tests to confirm the baseline passes on OLD code**

Run: `npx vitest run "src/app/(dashboard)/ordenes/[id]/dvi-checklist-form.test.tsx" "src/app/(dashboard)/ordenes/[id]/dvi-foto-form.test.tsx"`
Expected: PASS.

- [ ] **Step 2: Apply Recipe A to all three files**

For `dvi-checklist-form.tsx`:
```tsx
import { SelectField } from "@/components/ui/select-field";
// ...
<SelectField
  id={item.key}
  name={item.key}
  defaultValue={valor}
  size="sm"
  className="h-7 w-[90px] shrink-0 px-1.5 text-xs"
  items={DVI_CHECKLIST_STATUSES.map((estado) => ({
    value: estado,
    label: ESTADO_LABELS[estado],
  }))}
/>
```
For `dvi-foto-form.tsx` and `reportes/page.tsx`: read each file, find its `<NativeSelect>...</NativeSelect>` block(s), apply the same Recipe A transform using that file's own field name/options/defaultValue/className. Import swap is identical in both: `NativeSelect` → `SelectField`.

- [ ] **Step 3: Rewrite dvi-checklist-form.test.tsx / dvi-foto-form.test.tsx if they assert on select internals**

Per the research survey neither test file currently has `selectOptions`/`getByRole("option")` matches — read both files to confirm this is still true. If so, no test rewrite is needed for either (the DVI tests apparently don't exercise the select's value directly). If a live read finds interactions this plan's survey missed, apply the "Test rewrite recipe" above to them.

- [ ] **Step 4: Run the tests to verify they still pass against the new code**

Run: `npx vitest run "src/app/(dashboard)/ordenes/[id]/dvi-checklist-form.test.tsx" "src/app/(dashboard)/ordenes/[id]/dvi-foto-form.test.tsx"`
Expected: PASS, same test count as Step 1.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/ordenes/[id]/dvi-checklist-form.tsx" "src/app/(dashboard)/ordenes/[id]/dvi-foto-form.tsx" "src/app/(dashboard)/reportes/page.tsx" "src/app/(dashboard)/ordenes/[id]/dvi-checklist-form.test.tsx" "src/app/(dashboard)/ordenes/[id]/dvi-foto-form.test.tsx"
git commit -m "$(cat <<'EOF'
fase-orden-item-precio-task 12: convertir dvi-checklist/dvi-foto/reportes a SelectField

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AqhA2dYmy76UnFLnwStpgc
EOF
)"
git push origin main
```

---

## Task 4: Convert tenant-row-actions.tsx, cambiar-estado-form.tsx (Recipe A, includes a negative-option test)

**Files:**
- Modify: `src/app/superadmin/tenant-row-actions.tsx`
- Modify: `src/app/(dashboard)/ordenes/[id]/cambiar-estado-form.tsx`
- Test: `src/app/superadmin/tenant-row-actions.test.tsx`
- Test: `src/app/(dashboard)/ordenes/[id]/cambiar-estado-form.test.tsx`

**Interfaces:**
- Consumes: `SelectField`/`SelectFieldOption` from `@/components/ui/select-field` (Task 1).

- [ ] **Step 1: Run existing tests to confirm the baseline passes on OLD code**

Run: `npx vitest run "src/app/superadmin/tenant-row-actions.test.tsx" "src/app/(dashboard)/ordenes/[id]/cambiar-estado-form.test.tsx"`
Expected: PASS.

- [ ] **Step 2: Apply Recipe A to both files**

Read each file, find its `<NativeSelect>...</NativeSelect>` block, apply the transform from "The two conversion recipes" → Recipe A using that file's own field name/options/defaultValue/className/required.

- [ ] **Step 3: Rewrite tenant-row-actions.test.tsx**

Known interaction (verify against the live file for surrounding context):
```tsx
// before:
await userEvent.selectOptions(screen.getByLabelText("Plan"), "plan_estandar");

// after:
const trigger = screen.getByRole("combobox", { name: "Plan" });
await userEvent.click(trigger);
await userEvent.click(await screen.findByRole("option", { name: /est.ndar/i })); // match the actual visible label for plan_estandar
```
Use the exact visible label text found in the live file's items array (read it to get the precise Spanish label, e.g. "Estándar") instead of guessing.

- [ ] **Step 4: Rewrite cambiar-estado-form.test.tsx, including the negative assertion**

Known interactions (verify against the live file):
```tsx
// before:
expect(screen.getByRole("option", { name: "En proceso" })).toBeInTheDocument();
expect(screen.getByRole("option", { name: "Anulada" })).toBeInTheDocument();
expect(screen.queryByRole("option", { name: "Terminada" })).not.toBeInTheDocument();

// after:
const trigger = screen.getByRole("combobox", { name: /estado/i }); // match this form's actual accessible name
await userEvent.click(trigger);
expect(await screen.findByRole("option", { name: "En proceso" })).toBeInTheDocument();
expect(screen.getByRole("option", { name: "Anulada" })).toBeInTheDocument();
expect(screen.queryByRole("option", { name: "Terminada" })).not.toBeInTheDocument();
```
The negative assertion still works unchanged in spirit — `Terminada` must be genuinely absent from the `items` array passed to `SelectField` (not just visually hidden), which Recipe A already guarantees since `items` is built directly from the same filtered transition list the old `<option>` map used.

- [ ] **Step 5: Run the tests to verify they pass against the new code**

Run: `npx vitest run "src/app/superadmin/tenant-row-actions.test.tsx" "src/app/(dashboard)/ordenes/[id]/cambiar-estado-form.test.tsx"`
Expected: PASS, same test count as Step 1.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add "src/app/superadmin/tenant-row-actions.tsx" "src/app/(dashboard)/ordenes/[id]/cambiar-estado-form.tsx" "src/app/superadmin/tenant-row-actions.test.tsx" "src/app/(dashboard)/ordenes/[id]/cambiar-estado-form.test.tsx"
git commit -m "$(cat <<'EOF'
fase-orden-item-precio-task 13: convertir tenant-row-actions y cambiar-estado-form a SelectField

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AqhA2dYmy76UnFLnwStpgc
EOF
)"
git push origin main
```

---

## Task 5: Convert nueva-orden-form.tsx, registrar-pago-form.tsx (Recipe B)

**Files:**
- Modify: `src/app/(dashboard)/vehiculos/[id]/nueva-orden-form.tsx`
- Modify: `src/app/(dashboard)/facturas/[id]/registrar-pago-form.tsx`
- Test: `src/app/(dashboard)/vehiculos/[id]/nueva-orden-form.test.tsx`
- (`registrar-pago-form.tsx` has no dedicated test file — skip test rewrite, verify manually in Task 11.)

**Interfaces:**
- Consumes: `SelectField`/`SelectFieldOption` from `@/components/ui/select-field` (Task 1), `useController` from `react-hook-form`.

**Known current state for `nueva-orden-form.tsx` (verify against live file):**
```tsx
<NativeSelect
  id="mecanicoId"
  aria-invalid={errors.mecanicoId ? true : undefined}
  aria-describedby={errors.mecanicoId ? "mecanicoId-error" : undefined}
  {...register("mecanicoId")}
>
  <option value="">Sin asignar</option>
  {tecnicos.map((tecnico) => (
    <option key={tecnico.id} value={tecnico.id}>
      {tecnico.nombre}
    </option>
  ))}
</NativeSelect>
```

- [ ] **Step 1: Run existing test to confirm the baseline passes on OLD code**

Run: `npx vitest run "src/app/(dashboard)/vehiculos/[id]/nueva-orden-form.test.tsx"`
Expected: PASS.

- [ ] **Step 2: Apply Recipe B to nueva-orden-form.tsx**

```tsx
import { useController, useForm } from "react-hook-form";
import { SelectField } from "@/components/ui/select-field";
// ...
const {
  register,
  handleSubmit,
  control,
  formState: { errors },
} = useForm<...>({ ... }); // add `control` to the existing destructure if missing

const { field: mecanicoIdField } = useController({ name: "mecanicoId", control });
// ...
<SelectField
  id="mecanicoId"
  aria-invalid={errors.mecanicoId ? true : undefined}
  aria-describedby={errors.mecanicoId ? "mecanicoId-error" : undefined}
  value={mecanicoIdField.value ?? ""}
  onValueChange={mecanicoIdField.onChange}
  items={[
    { value: "", label: "Sin asignar" },
    ...tecnicos.map((tecnico) => ({ value: tecnico.id, label: tecnico.nombre })),
  ]}
/>
```
Find this form's submit handler and add the `formData.set("mecanicoId", data.mecanicoId ?? "")` line as shown in Recipe B, immediately before the call that submits `formData`. If the form doesn't already build a `formRef`-based `FormData` object (check first — some RHF forms in this codebase submit purely by relying on native input `name` attributes without ever touching `FormData` directly), add the `formRef` + manual `FormData` construction following `agregar-item-form.tsx`'s exact pattern (read that file for the full `onSubmit`/`formRef` wiring to copy).

- [ ] **Step 3: Apply Recipe A or B to registrar-pago-form.tsx**

Read the file first to determine which recipe actually applies (check for `handleSubmit` vs plain `<form action=...>`, per the "two conversion recipes" note about not assuming from `register()` alone) — the earlier research pass classified it as RHF `handleSubmit`, so default to Recipe B unless the live file shows otherwise.

- [ ] **Step 4: Rewrite nueva-orden-form.test.tsx**

Known interaction (verify against the live file):
```tsx
// before:
expect(screen.getByLabelText("Mecánico asignado")).toBeInTheDocument();
expect(screen.getByRole("option", { name: "Carlos Ruiz" })).toBeInTheDocument();

// after:
const trigger = screen.getByRole("combobox", { name: "Mecánico asignado" });
expect(trigger).toBeInTheDocument();
await userEvent.click(trigger);
expect(await screen.findByRole("option", { name: "Carlos Ruiz" })).toBeInTheDocument();
```

- [ ] **Step 5: Run the test to verify it passes against the new code**

Run: `npx vitest run "src/app/(dashboard)/vehiculos/[id]/nueva-orden-form.test.tsx"`
Expected: PASS, same test count as Step 1.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/vehiculos/[id]/nueva-orden-form.tsx" "src/app/(dashboard)/facturas/[id]/registrar-pago-form.tsx" "src/app/(dashboard)/vehiculos/[id]/nueva-orden-form.test.tsx"
git commit -m "$(cat <<'EOF'
fase-orden-item-precio-task 14: convertir nueva-orden-form y registrar-pago-form a SelectField

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AqhA2dYmy76UnFLnwStpgc
EOF
)"
git push origin main
```

---

## Task 6: Convert nuevo-usuario-form.tsx, agregar-mano-obra-form.tsx (Recipe B)

**Files:**
- Modify: `src/app/(dashboard)/usuarios/nuevo/nuevo-usuario-form.tsx`
- Modify: `src/app/(dashboard)/ordenes/[id]/agregar-mano-obra-form.tsx`
- Test: `src/app/(dashboard)/usuarios/nuevo/nuevo-usuario-form.test.tsx`
- Test: `src/app/(dashboard)/ordenes/[id]/agregar-mano-obra-form.test.tsx`

**Interfaces:**
- Consumes: `SelectField`/`SelectFieldOption` from `@/components/ui/select-field` (Task 1), `useController` from `react-hook-form`.

**Known current state for `agregar-mano-obra-form.tsx` (verify against live file):**
```tsx
<NativeSelect
  id="manoObraMecanico"
  aria-invalid={errors.mecanicoId ? true : undefined}
  aria-describedby={errors.mecanicoId ? "manoObraMecanico-error" : undefined}
  {...register("mecanicoId")}
>
  <option value="">Sin asignar</option>
  {tecnicos.map((tecnico) => (
    <option key={tecnico.id} value={tecnico.id}>
      {tecnico.nombre}
    </option>
  ))}
</NativeSelect>
```

- [ ] **Step 1: Run existing tests to confirm the baseline passes on OLD code**

Run: `npx vitest run "src/app/(dashboard)/usuarios/nuevo/nuevo-usuario-form.test.tsx" "src/app/(dashboard)/ordenes/[id]/agregar-mano-obra-form.test.tsx"`
Expected: PASS.

- [ ] **Step 2: Apply Recipe B to both files**

For `agregar-mano-obra-form.tsx`:
```tsx
import { useController, useForm } from "react-hook-form";
import { SelectField } from "@/components/ui/select-field";
// ...
const { field: mecanicoIdField } = useController({ name: "mecanicoId", control });
// ...
<SelectField
  id="manoObraMecanico"
  aria-invalid={errors.mecanicoId ? true : undefined}
  aria-describedby={errors.mecanicoId ? "manoObraMecanico-error" : undefined}
  value={mecanicoIdField.value ?? ""}
  onValueChange={mecanicoIdField.onChange}
  items={[
    { value: "", label: "Sin asignar" },
    ...tecnicos.map((tecnico) => ({ value: tecnico.id, label: tecnico.nombre })),
  ]}
/>
```
Add `formData.set("mecanicoId", data.mecanicoId ?? "")` to its submit handler per Recipe B.

For `nuevo-usuario-form.tsx`: read the file, find its `<NativeSelect>` (the "Rol" field seen in this session's earlier browser verification), apply the same Recipe B pattern with `rolField`/`"rol"` in place of `mecanicoIdField`/`"mecanicoId"`, using that file's actual role options.

- [ ] **Step 3: Rewrite nuevo-usuario-form.test.tsx**

Known interactions (verify against the live file):
```tsx
// before:
expect(screen.getByRole("option", { name: "ADMIN" })).toBeInTheDocument();
expect(screen.getByRole("option", { name: "TECNICO" })).toBeInTheDocument();
expect(screen.getByRole("option", { name: "RECEPCION" })).toBeInTheDocument();

// after:
const trigger = screen.getByRole("combobox", { name: /rol/i });
await userEvent.click(trigger);
expect(await screen.findByRole("option", { name: "ADMIN" })).toBeInTheDocument();
expect(screen.getByRole("option", { name: "TECNICO" })).toBeInTheDocument();
expect(screen.getByRole("option", { name: "RECEPCION" })).toBeInTheDocument();
```

- [ ] **Step 4: Rewrite agregar-mano-obra-form.test.tsx**

Known interaction (verify against the live file):
```tsx
// before:
const select = screen.getByLabelText<HTMLSelectElement>("Mecánico");
expect(select.value).toBe("");
await userEvent.selectOptions(select, "t2");
expect(select.value).toBe("t2");

// after:
const trigger = screen.getByRole("combobox", { name: "Mecánico" });
expect(trigger).toHaveTextContent("Sin asignar");
await userEvent.click(trigger);
await userEvent.click(await screen.findByRole("option", { name: "<the t2 técnico's actual name from the fixture>" }));
expect(trigger).toHaveTextContent("<that same name>");
```
Read the test fixture's técnico list to substitute the real name for id "t2".

- [ ] **Step 5: Run the tests to verify they pass against the new code**

Run: `npx vitest run "src/app/(dashboard)/usuarios/nuevo/nuevo-usuario-form.test.tsx" "src/app/(dashboard)/ordenes/[id]/agregar-mano-obra-form.test.tsx"`
Expected: PASS, same test count as Step 1.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/usuarios/nuevo/nuevo-usuario-form.tsx" "src/app/(dashboard)/ordenes/[id]/agregar-mano-obra-form.tsx" "src/app/(dashboard)/usuarios/nuevo/nuevo-usuario-form.test.tsx" "src/app/(dashboard)/ordenes/[id]/agregar-mano-obra-form.test.tsx"
git commit -m "$(cat <<'EOF'
fase-orden-item-precio-task 15: convertir nuevo-usuario-form y agregar-mano-obra-form a SelectField

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AqhA2dYmy76UnFLnwStpgc
EOF
)"
git push origin main
```

---

## Task 7: Convert nueva-orden-desde-cero-form.tsx, seleccionar-sede-form.tsx (Recipe B)

**Files:**
- Modify: `src/app/(dashboard)/ordenes/nueva-orden-desde-cero-form.tsx`
- Modify: `src/app/seleccionar-sede/seleccionar-sede-form.tsx`
- Test: `src/app/(dashboard)/ordenes/nueva-orden-desde-cero-form.test.tsx`
- Test: `src/app/seleccionar-sede/seleccionar-sede-form.test.tsx`

**Interfaces:**
- Consumes: `SelectField`/`SelectFieldOption` from `@/components/ui/select-field` (Task 1), `useController` from `react-hook-form`.

- [ ] **Step 1: Run existing tests to confirm the baseline passes on OLD code**

Run: `npx vitest run "src/app/(dashboard)/ordenes/nueva-orden-desde-cero-form.test.tsx" "src/app/seleccionar-sede/seleccionar-sede-form.test.tsx"`
Expected: PASS.

- [ ] **Step 2: Apply Recipe B to both files**

Read each file in full, find its `<NativeSelect>` usage(s) (`nueva-orden-desde-cero-form.tsx` likely has a mecánico select alongside its `Combobox` fields for vehículo/cliente; `seleccionar-sede-form.tsx` has a sede select), apply the Recipe B transform from "The two conversion recipes" with that file's own field name/items/`useController` wiring. Add the corresponding `formData.set(...)` line to each form's submit handler.

- [ ] **Step 3: Rewrite seleccionar-sede-form.test.tsx**

Known interaction (verify against the live file):
```tsx
// before:
await userEvent.selectOptions(screen.getByLabelText("Sede"), "sede-2");
// (then clicks "Continuar")

// after:
const trigger = screen.getByRole("combobox", { name: "Sede" });
await userEvent.click(trigger);
await userEvent.click(await screen.findByRole("option", { name: /* the actual label for sede-2 from the fixture */ }));
// (then clicks "Continuar", unchanged)
```

- [ ] **Step 4: Rewrite nueva-orden-desde-cero-form.test.tsx if it asserts on select internals**

Per the research survey this test file currently has no `selectOptions`/`getByRole("option")` matches — read it to confirm this is still true after Recipe B is applied (a select that's merely rendered with no test interaction needs no test change). If a live read finds interactions the survey missed, apply the "Test rewrite recipe".

- [ ] **Step 5: Run the tests to verify they pass against the new code**

Run: `npx vitest run "src/app/(dashboard)/ordenes/nueva-orden-desde-cero-form.test.tsx" "src/app/seleccionar-sede/seleccionar-sede-form.test.tsx"`
Expected: PASS, same test count as Step 1.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/ordenes/nueva-orden-desde-cero-form.tsx" "src/app/seleccionar-sede/seleccionar-sede-form.tsx" "src/app/(dashboard)/ordenes/nueva-orden-desde-cero-form.test.tsx" "src/app/seleccionar-sede/seleccionar-sede-form.test.tsx"
git commit -m "$(cat <<'EOF'
fase-orden-item-precio-task 16: convertir nueva-orden-desde-cero-form y seleccionar-sede-form a SelectField

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AqhA2dYmy76UnFLnwStpgc
EOF
)"
git push origin main
```

---

## Task 8: Convert nuevo-repuesto-form.tsx, nueva-entrada-mercancia-form.tsx (Recipe B, `required` + mixed with Combobox)

**Files:**
- Modify: `src/app/(dashboard)/repuestos/nuevo-repuesto-form.tsx`
- Modify: `src/app/(dashboard)/entradas-mercancia/nueva-entrada-mercancia-form.tsx`
- Test: `src/app/(dashboard)/repuestos/nuevo-repuesto-form.test.tsx`
- Test: `src/app/(dashboard)/entradas-mercancia/nueva-entrada-mercancia-form.test.tsx`

**Interfaces:**
- Consumes: `SelectField`/`SelectFieldOption` from `@/components/ui/select-field` (Task 1), `useController` from `react-hook-form`.

**Known current state for `nueva-entrada-mercancia-form.tsx`'s "Bodega" field (verify against live file — this file also has a `Combobox` for "Proveedor" that stays completely untouched):**
```tsx
<NativeSelect
  id="bodegaId"
  required
  aria-invalid={errors.bodegaId ? true : undefined}
  aria-describedby={errors.bodegaId ? "bodegaId-error" : undefined}
  {...register("bodegaId")}
>
  <option value="" disabled>
    Selecciona una bodega
  </option>
  {bodegas.map((bodega) => (
    <option key={bodega.id} value={bodega.id}>
      {bodega.nombre}
    </option>
  ))}
</NativeSelect>
```
This one is a real placeholder pattern (the empty option is `disabled`, not a real selectable "Sin asignar"-style choice) — don't include it as an `items` entry at all; let `SelectField`'s own `placeholder` prop show the text instead:
```tsx
<SelectField
  id="bodegaId"
  required
  aria-invalid={errors.bodegaId ? true : undefined}
  aria-describedby={errors.bodegaId ? "bodegaId-error" : undefined}
  value={bodegaIdField.value ?? ""}
  onValueChange={bodegaIdField.onChange}
  placeholder="Selecciona una bodega"
  items={bodegas.map((bodega) => ({ value: bodega.id, label: bodega.nombre }))}
/>
```
with `const { field: bodegaIdField } = useController({ name: "bodegaId", control });` added next to the existing `useForm()` destructure, and `formData.set("bodegaId", data.bodegaId ?? "")` added to the submit handler. Leave every `Combobox` usage in this file (the "Proveedor" field) completely untouched.

- [ ] **Step 1: Run existing tests to confirm the baseline passes on OLD code**

Run: `npx vitest run "src/app/(dashboard)/repuestos/nuevo-repuesto-form.test.tsx" "src/app/(dashboard)/entradas-mercancia/nueva-entrada-mercancia-form.test.tsx"`
Expected: PASS.

- [ ] **Step 2: Apply Recipe B to both files' `NativeSelect` usages (not their `Combobox` usages)**

Apply the transform shown above to `nueva-entrada-mercancia-form.tsx`. For `nuevo-repuesto-form.tsx`, read the file to find its `NativeSelect` field(s) (a "Bodega" select, per the earlier survey pattern), apply the same placeholder-aware Recipe B variant if its empty option is `disabled` (real placeholder) or the plain Recipe B form if it's a real selectable "Sin asignar"-equivalent — check the live JSX to tell which.

- [ ] **Step 3: Rewrite nuevo-repuesto-form.test.tsx**

Known interactions — FOUR separate test cases each do this before submitting (verify exact line numbers against the live file, they may have shifted):
```tsx
// before (repeated 4x across different test cases):
await userEvent.selectOptions(screen.getByLabelText("Bodega"), "b1");

// after (same 4x):
const trigger = screen.getByRole("combobox", { name: "Bodega" });
await userEvent.click(trigger);
await userEvent.click(await screen.findByRole("option", { name: "Bodega principal" })); // match "b1"'s actual label from the fixture
```
Also update the earlier standalone assertion:
```tsx
// before:
expect(screen.getByRole("option", { name: "Bodega principal" })).toBeInTheDocument();

// after: only valid once the trigger is open — fold it into the click sequence above instead of asserting it standalone with the popup closed, unless that specific test case already opens the trigger for another reason.
```

- [ ] **Step 4: Rewrite nueva-entrada-mercancia-form.test.tsx**

This file already has an established `selectCombobox` test helper for the "Proveedor" field (read it to see its exact shape, it's a working precedent already in this file) — leave every call to it untouched. Only the "Bodega" `NativeSelect` interactions change:
```tsx
// before (appears in 2 test cases, immediately after a selectCombobox("Proveedor", ...) call):
await userEvent.selectOptions(screen.getByLabelText("Bodega"), "b1");

// after (same 2 places):
const bodegaTrigger = screen.getByRole("combobox", { name: "Bodega" });
await userEvent.click(bodegaTrigger);
await userEvent.click(await screen.findByRole("option", { name: "Bodega principal" }));
```
Also update the standalone `expect(screen.getByRole("option", { name: "Bodega principal" })).toBeInTheDocument();` assertion the same way as Task 8 Step 3 (fold into an open-popup sequence, or remove if redundant with the interaction assertion above).

- [ ] **Step 5: Run the tests to verify they pass against the new code**

Run: `npx vitest run "src/app/(dashboard)/repuestos/nuevo-repuesto-form.test.tsx" "src/app/(dashboard)/entradas-mercancia/nueva-entrada-mercancia-form.test.tsx"`
Expected: PASS, same test count as Step 1.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/repuestos/nuevo-repuesto-form.tsx" "src/app/(dashboard)/entradas-mercancia/nueva-entrada-mercancia-form.tsx" "src/app/(dashboard)/repuestos/nuevo-repuesto-form.test.tsx" "src/app/(dashboard)/entradas-mercancia/nueva-entrada-mercancia-form.test.tsx"
git commit -m "$(cat <<'EOF'
fase-orden-item-precio-task 17: convertir nuevo-repuesto-form y nueva-entrada-mercancia-form a SelectField

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AqhA2dYmy76UnFLnwStpgc
EOF
)"
git push origin main
```

---

## Task 9: Convert editar-usuario-form.tsx, editar-repuesto-form.tsx (Recipe B, dual-form files)

**Files:**
- Modify: `src/app/(dashboard)/usuarios/[id]/editar-usuario-form.tsx`
- Modify: `src/app/(dashboard)/repuestos/editar-repuesto-form.tsx`
- Test: `src/app/(dashboard)/usuarios/[id]/editar-usuario-form.test.tsx`
- (`editar-repuesto-form.tsx` has no dedicated test file — skip test rewrite, verify manually in Task 11.)

**Interfaces:**
- Consumes: `SelectField`/`SelectFieldOption` from `@/components/ui/select-field` (Task 1), `useController` from `react-hook-form`.

Both files have TWO `<form>`s: a main RHF-driven edit form and a separate native `<form action={deleteAction}>` for a delete button. The `NativeSelect` in question belongs to the main edit form in both files — the delete forms have no select and are completely unaffected; do not touch them.

- [ ] **Step 1: Run existing test to confirm the baseline passes on OLD code**

Run: `npx vitest run "src/app/(dashboard)/usuarios/[id]/editar-usuario-form.test.tsx"`
Expected: PASS.

- [ ] **Step 2: Apply Recipe B to both files' main edit form only**

Read each file in full first to correctly identify the boundary between the main edit form and the secondary delete form (they're both in the same file/component tree) — apply Recipe B only inside the main form's JSX and its own `handleSubmit`/`formRef`-based submit handler, exactly as in Task 6. Leave the delete `<form action=...>` byte-for-byte unchanged.

- [ ] **Step 3: Rewrite editar-usuario-form.test.tsx if needed**

Per the research survey this file currently has no `selectOptions`/`getByRole("option")` matches — read it to confirm this is still true. If confirmed, no test rewrite is needed (the "Rol" select is apparently exercised at most via presence, not value interaction). If a live read finds interactions the survey missed, apply the "Test rewrite recipe".

- [ ] **Step 4: Run the test to verify it passes against the new code**

Run: `npx vitest run "src/app/(dashboard)/usuarios/[id]/editar-usuario-form.test.tsx"`
Expected: PASS, same test count as Step 1.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/usuarios/[id]/editar-usuario-form.tsx" "src/app/(dashboard)/repuestos/editar-repuesto-form.tsx" "src/app/(dashboard)/usuarios/[id]/editar-usuario-form.test.tsx"
git commit -m "$(cat <<'EOF'
fase-orden-item-precio-task 18: convertir editar-usuario-form y editar-repuesto-form a SelectField

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AqhA2dYmy76UnFLnwStpgc
EOF
)"
git push origin main
```

---

## Task 10: Convert vehiculo-form-fields.tsx (subcomponent, parent form supplies the `<form>`)

**Files:**
- Modify: `src/app/(dashboard)/clientes/[id]/vehiculo-form-fields.tsx`
- Test: any test file(s) that exercise it (per the research survey, `src/app/(dashboard)/clientes/[id]/nuevo-vehiculo-form.test.tsx` — confirm this is still the right file, and grep for every other consumer/import of `VehiculoFormFields` first, in case a second parent form also renders it).

**Interfaces:**
- Consumes: `SelectField`/`SelectFieldOption` from `@/components/ui/select-field` (Task 1).

`vehiculo-form-fields.tsx` is a fields-only subcomponent — it has no `<form>` or submit handler of its own; the parent component supplies both. Its `register`/`control` (if RHF-controlled) or `name`/`defaultValue` (if not) are passed down as props from the parent. Read the file in full to determine which wiring shape it actually uses before choosing Recipe A or B — don't assume.

- [ ] **Step 1: Find every consumer of this component**

Run: `grep -rn "VehiculoFormFields" src/ --include=*.tsx`
Read every file that imports it (expect at least `nuevo-vehiculo-form.tsx`; there may be an edit variant too) so Step 4's test rewrite covers every affected test file, not just the one the earlier survey found.

- [ ] **Step 2: Run existing test(s) to confirm the baseline passes on OLD code**

Run: `npx vitest run "src/app/(dashboard)/clientes/[id]/nuevo-vehiculo-form.test.tsx"` (plus any other test file found in Step 1)
Expected: PASS.

- [ ] **Step 3: Apply the appropriate recipe**

Convert both selects this file is known to contain ("Combustible" and "Transmisión", per the earlier survey's test-line evidence) following whichever of Recipe A/B matches how this subcomponent receives its field bindings from its parent (props shaped like `register`-spread pass-throughs point to Recipe B via a `control` prop passed down from the parent; props shaped like plain `name`/`defaultValue` point to Recipe A).

- [ ] **Step 4: Rewrite the test(s)**

Known interactions (verify against the live file):
```tsx
// before:
await userEvent.selectOptions(screen.getByLabelText("Combustible"), "GASOLINA");
await userEvent.selectOptions(screen.getByLabelText("Transmisión"), "AUTOMATICA");

// after:
const combustibleTrigger = screen.getByRole("combobox", { name: "Combustible" });
await userEvent.click(combustibleTrigger);
await userEvent.click(await screen.findByRole("option", { name: /* GASOLINA's actual visible label */ }));

const transmisionTrigger = screen.getByRole("combobox", { name: "Transmisión" });
await userEvent.click(transmisionTrigger);
await userEvent.click(await screen.findByRole("option", { name: /* AUTOMATICA's actual visible label */ }));
```

- [ ] **Step 5: Run the test(s) to verify they pass against the new code**

Run the same command(s) from Step 2.
Expected: PASS, same test count as Step 2.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/clientes/[id]/vehiculo-form-fields.tsx" "src/app/(dashboard)/clientes/[id]/nuevo-vehiculo-form.test.tsx"
git commit -m "$(cat <<'EOF'
fase-orden-item-precio-task 19: convertir vehiculo-form-fields a SelectField

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AqhA2dYmy76UnFLnwStpgc
EOF
)"
git push origin main
```
(If Step 1 found extra test files, `git add` those too.)

---

## Task 11: Full-suite verification, browser check, and ledger update

**Files:**
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: everything from Tasks 1-10.

- [ ] **Step 1: Confirm no `<select` and no `NativeSelect` usages remain outside `native-select.tsx` itself**

Run: `grep -rn "NativeSelect" src/ --include=*.tsx | grep -v "src/components/ui/native-select.tsx"`
Expected: no output (every one of the 17 files has been converted).

- [ ] **Step 2: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass except the already-documented pre-existing DB-provisioning-contention flake (5 test files failing on `beforeAll` Postgres schema races, unrelated to this change — same class noted throughout `.superpowers/sdd/progress.md`). If any *other* test fails, stop and report — do not proceed to Step 4.

- [ ] **Step 4: Start the dev server and browser-verify live against `taller-dev`**

```bash
npm run dev
```
Using claude-in-chrome (or equivalent browser automation), log in as `admin@dev.test` against `http://localhost:3025` and visually confirm, for at least one representative page from each converted group:
- `/ordenes/[id]` — "Mecánico" (compact) and "Cambiar estado a" selects open a rounded, shadowed popup with a visible hover highlight when the pointer moves over an item (not flat OS-native rows).
- `/usuarios/nuevo` — "Rol" select shows the same styled popup.
- `/repuestos/nuevo` — "Bodega" select shows the placeholder text before any selection, and the styled popup on open.
- `/reportes` (or `/seleccionar-sede`) — confirm the remaining converted select also renders the styled popup.

Stop the dev server when done.

- [ ] **Step 5: Update the progress ledger**

Read `.superpowers/sdd/progress.md`, find the most recent "chevron combobox repuesto" entry (task 9b), and append a new section directly after it summarizing: SelectField created (Task 10 in this session's numbering — task "fase-orden-item-precio-task 10" through "19"), all 17 `NativeSelect` usages converted to the styled Base UI `Select` popup, every consuming test file rewritten to drive the popup instead of the raw `<select>`, full suite passing (same pre-existing DB flake as before, note the exact pass count from Step 3), browser-verified live. Note explicitly that `native-select.tsx`/`NativeSelect` are now dead code (zero remaining references) and were deliberately left in place rather than deleted, as a follow-up cleanup item.

- [ ] **Step 6: Commit and push the ledger update**

```bash
git add .superpowers/sdd/progress.md
git commit -m "$(cat <<'EOF'
chore: actualizar ledger de progreso (SelectField, popup con estilo)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AqhA2dYmy76UnFLnwStpgc
EOF
)"
git push origin main
```
