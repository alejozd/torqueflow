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
