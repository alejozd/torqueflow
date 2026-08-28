"use client";

import { startTransition, useActionState, useMemo, useRef } from "react";
import { useController, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { addItemOrdenAction, type ItemOrdenFormState } from "@/app/actions/item-orden-actions";
import { itemOrdenInputSchema } from "@/lib/validation/orden";
import type { RepuestoOption } from "@/app/actions/repuesto-actions";
import { FormGroup } from "@/components/form-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ItemOrdenFormState = { error: null, success: false };

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

export function AgregarItemForm({ ordenId, repuestos }: { ordenId: string; repuestos: RepuestoOption[] }) {
  const addItem = addItemOrdenAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(addItem, initialState);
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
    () => repuestos.map((repuesto) => ({ value: repuesto.id, label: `${repuesto.codigo} — ${repuesto.nombre}` })),
    [repuestos],
  );

  return (
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
              onValueChange={repuestoIdField.onChange}
              placeholder="Ítem manual (completa descripción y precio abajo)"
              emptyMessage="Ningún repuesto coincide"
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
  );
}
