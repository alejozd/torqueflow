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
 * Styled replacement for a plain <select> when the OS-native popup chrome
 * is undesirable. Speaks in plain string values like
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
  align,
  alignItemWithTrigger,
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
  /**
   * Overrides SelectContent's default "center" alignment. Only takes effect
   * with alignItemWithTrigger={false} -- Base UI's default alignItemWithTrigger
   * behavior positions the popup to overlap the selected item under the
   * trigger and ignores `align` entirely.
   */
  align?: "start" | "center" | "end"
  /**
   * Set to false when the trigger sits flush against a container's right
   * edge (e.g. the last column of a wide grid row): the default true
   * behavior overlaps the selected item with the trigger regardless of
   * `align`, and the popup's min-w-36 can end up wider than the trigger,
   * pushing past that edge. false switches to plain edge alignment, where
   * `align="end"` keeps the popup growing only leftward.
   */
  alignItemWithTrigger?: boolean
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
      <SelectContent align={align} alignItemWithTrigger={alignItemWithTrigger}>
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
