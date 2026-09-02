"use client"

import * as React from "react"
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox"
import { cn } from "@/lib/utils"
import { normalizeForSearch } from "@/lib/search"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

export interface ComboboxOption {
  value: string
  label: string
}

function isSameOption(a: ComboboxOption, b: ComboboxOption) {
  return a.value === b.value
}

// Diacritic-insensitive by default -- "Maria" (typed without an accent) must
// still find "María" in the visible label. See src/lib/search.ts.
function defaultFilter(item: ComboboxOption, query: string) {
  return normalizeForSearch(item.label).includes(normalizeForSearch(query))
}

/**
 * Searchable replacement for a plain <select> when the option list is long
 * and dynamic (Cliente, Vehículo, Repuesto...). Speaks in plain string ids
 * like every other form field here (react-hook-form register()/FormData),
 * not Base UI's {value,label} item objects -- consumers never see those.
 */
function Combobox({
  items,
  value,
  onValueChange,
  name,
  placeholder = "Buscar...",
  emptyMessage = "Sin resultados",
  disabled,
  required,
  className,
  id,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  /**
   * Overrides the default (substring match on the visible label). Use when a
   * field must also match on something not shown in the label, e.g. cédula
   * alongside nombre/placa.
   */
  filter,
}: {
  items: ComboboxOption[]
  value: string
  onValueChange: (value: string) => void
  name?: string
  placeholder?: string
  emptyMessage?: string
  disabled?: boolean
  required?: boolean
  className?: string
  id?: string
  "aria-invalid"?: boolean | undefined
  "aria-describedby"?: string | undefined
  filter?: (item: ComboboxOption, query: string) => boolean
}) {
  const selected = React.useMemo(() => items.find((item) => item.value === value) ?? null, [items, value])

  return (
    <ComboboxPrimitive.Root
      items={items}
      value={selected}
      onValueChange={(item) => onValueChange(item ? (item as ComboboxOption).value : "")}
      isItemEqualToValue={isSameOption}
      itemToStringLabel={(item) => (item as ComboboxOption).label}
      filter={(item, query) => (filter ?? defaultFilter)(item as ComboboxOption, query)}
      name={name}
      disabled={disabled}
      required={required}
    >
      <ComboboxPrimitive.InputGroup className="relative">
        <ComboboxPrimitive.Input
          id={id}
          placeholder={placeholder}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          className={cn(
            "flex h-8 w-full items-center justify-between rounded-lg border border-input bg-transparent px-2.5 py-1 pr-7 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
            className,
          )}
        />
        <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground" />
      </ComboboxPrimitive.InputGroup>
      <ComboboxPrimitive.Portal>
        <ComboboxPrimitive.Positioner className="isolate z-50" sideOffset={4}>
          <ComboboxPrimitive.Popup className="relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10">
            <ComboboxPrimitive.Empty className="p-2 text-xs text-muted-foreground">
              {emptyMessage}
            </ComboboxPrimitive.Empty>
            <ComboboxPrimitive.List className="p-1">
              {(item: ComboboxOption) => (
                <ComboboxPrimitive.Item
                  key={item.value}
                  value={item}
                  className="relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  {item.label}
                  <ComboboxPrimitive.ItemIndicator className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
                    <CheckIcon className="size-4" />
                  </ComboboxPrimitive.ItemIndicator>
                </ComboboxPrimitive.Item>
              )}
            </ComboboxPrimitive.List>
          </ComboboxPrimitive.Popup>
        </ComboboxPrimitive.Positioner>
      </ComboboxPrimitive.Portal>
    </ComboboxPrimitive.Root>
  )
}

export { Combobox }
