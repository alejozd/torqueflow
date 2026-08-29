"use client";

import { startTransition, useActionState, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useController, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { addItemOrdenAction, type ItemOrdenFormState } from "@/app/actions/item-orden-actions";
import { itemOrdenInputSchema } from "@/lib/validation/orden";
import type { RepuestoOption } from "@/app/actions/repuesto-actions";
import type { Bodega, Proveedor } from "@/generated/prisma-tenant";
// Relative, not the "@/app/(dashboard)/..." alias: no existing file in this
// codebase imports across (dashboard) route-group subfolders that way, and
// the alias is unverified for paths containing parentheses here -- relative
// avoids relying on an untested resolution edge case.
import { NuevoRepuestoDialog } from "../../repuestos/nuevo-repuesto-dialog";
import { normalizeForSearch } from "@/lib/search";
import { FormGroup } from "@/components/form-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ItemOrdenFormState = { error: null, success: false };

/**
 * Sentinel repuestoId value for the combo's fixed "+ Crear repuesto nuevo"
 * row -- intercepted in onValueChange before it ever reaches react-hook-form
 * state or the server, so it can never be submitted as a real repuestoId.
 */
const CREAR_NUEVO_VALUE = "__crear_nuevo__";

/**
 * itemOrdenInputSchema carries a cross-field .refine() (repuesto OR manual
 * descripcion+precio), so `.safeExtend()` -- not `.extend()` -- is required
 * in zod 4 to add a field override without dropping that refinement.
 * precioUnitario needs the same "" -> undefined preprocessing
 * addItemOrdenAction already applies before parsing
 * (`formData.get("precioUnitario") || undefined`) -- `.optional()` alone
 * does not treat "" as absent.
 */
const itemFormSchema = itemOrdenInputSchema.safeExtend({
  precioUnitario: z.preprocess((v) => (v === "" ? undefined : v), itemOrdenInputSchema.shape.precioUnitario),
});
type ItemFormInput = z.input<typeof itemFormSchema>;

export function AgregarItemForm({
  ordenId,
  repuestos,
  bodegas,
  proveedores,
  puedeCrearRepuesto,
}: {
  ordenId: string;
  repuestos: RepuestoOption[];
  bodegas: Bodega[];
  proveedores: Proveedor[];
  puedeCrearRepuesto: boolean;
}) {
  const router = useRouter();
  const addItem = addItemOrdenAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(addItem, initialState);
  const [crearDialogOpen, setCrearDialogOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    control,
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

  return (
    <>
      <form
        noValidate
        ref={formRef}
        onSubmit={handleSubmit((data) =>
          startTransition(() => {
            const formData = new FormData(formRef.current!);
            // repuestoId is a Combobox (react-hook-form-controlled, not a native
            // <select name="..."> register()) -- it doesn't populate FormData on
            // its own, so it must be set explicitly here before submitting.
            formData.set("repuestoId", data.repuestoId ?? "");
            formAction(formData);
          }),
        )}
        className="flex flex-col gap-4"
      >
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
              <Label htmlFor="itemDescripcion">Descripción</Label>
              <Input
                id="itemDescripcion"
                aria-invalid={errors.descripcion ? true : undefined}
                aria-describedby={errors.descripcion ? "itemDescripcion-error" : undefined}
                {...register("descripcion")}
              />
              {errors.descripcion ? <p id="itemDescripcion-error">{errors.descripcion.message}</p> : null}
            </div>
          </div>
        </FormGroup>

        <FormGroup label="Cantidad y precio">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            Si seleccionas un repuesto del inventario, la descripción y el precio se completan automáticamente.
          </p>
        </FormGroup>

        {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

        <Button type="submit" disabled={isPending} className="self-end">
          {isPending ? "Guardando..." : "Agregar ítem"}
        </Button>

        {state.error ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        {state.success ? <p role="status">Ítem agregado</p> : null}
      </form>

      <NuevoRepuestoDialog
        open={crearDialogOpen}
        onOpenChange={setCrearDialogOpen}
        bodegas={bodegas}
        proveedores={proveedores}
        onCreated={(repuestoId) => {
          repuestoIdField.onChange(repuestoId);
          setCrearDialogOpen(false);
          toast.success("Repuesto creado");
          // repuestos is a server-fetched prop (listRepuestoOptions() in
          // ordenes/[id]/page.tsx); createRepuestoAction only revalidates
          // "/repuestos", not this route, so this refresh is what makes the
          // just-created repuesto's label show up in the combo's options.
          router.refresh();
        }}
      />
    </>
  );
}
