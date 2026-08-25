"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { addItemOrdenAction, type ItemOrdenFormState } from "@/app/actions/item-orden-actions";
import { itemOrdenInputSchema } from "@/lib/validation/orden";
import type { RepuestoOption } from "@/app/actions/repuesto-actions";

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
    formState: { errors },
  } = useForm<ItemFormInput>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: { repuestoId: "", descripcion: "", cantidad: "", precioUnitario: "" },
  });
  // The .refine() above has no field path, so zodResolver keys it under "" --
  // not a real field, hence the cast (FieldErrors<T> only types known field keys).
  const formError = (errors as Record<string, { message?: string } | undefined>)[""]?.message;

  return (
    <form
      noValidate
      ref={formRef}
      onSubmit={handleSubmit(() => startTransition(() => formAction(new FormData(formRef.current!))))}
    >
      <label htmlFor="repuestoId">Repuesto del inventario (opcional)</label>
      <select id="repuestoId" {...register("repuestoId")}>
        <option value="">Ítem manual (completa descripción y precio abajo)</option>
        {repuestos.map((repuesto) => (
          <option key={repuesto.id} value={repuesto.id}>
            {repuesto.codigo} — {repuesto.nombre}
          </option>
        ))}
      </select>

      <label htmlFor="itemDescripcion">Descripción</label>
      <input id="itemDescripcion" {...register("descripcion")} />

      <label htmlFor="itemCantidad">Cantidad</label>
      <input
        id="itemCantidad"
        type="number"
        min="1"
        required
        aria-invalid={errors.cantidad ? true : undefined}
        aria-describedby={errors.cantidad ? "itemCantidad-error" : undefined}
        {...register("cantidad")}
      />
      {errors.cantidad ? <p id="itemCantidad-error">{errors.cantidad.message}</p> : null}

      <label htmlFor="itemPrecioUnitario">Precio unitario</label>
      <input id="itemPrecioUnitario" type="number" min="0" step="0.01" {...register("precioUnitario")} />

      <p>Si seleccionas un repuesto del inventario, la descripción y el precio se completan automáticamente.</p>
      {formError ? <p>{formError}</p> : null}

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Agregar ítem"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Ítem agregado</p> : null}
    </form>
  );
}
