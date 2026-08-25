"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { addEntradaItemAction, type EntradaFormState } from "@/app/actions/entrada-mercancia-actions";
import { entradaMercanciaItemInputSchema } from "@/lib/validation/inventario";
import type { RepuestoOption } from "@/app/actions/repuesto-actions";
import type { z } from "zod";

const initialState: EntradaFormState = { error: null, success: false };

type EntradaItemFormInput = z.input<typeof entradaMercanciaItemInputSchema>;

export function AgregarEntradaItemForm({
  entradaId,
  repuestos,
}: {
  entradaId: string;
  repuestos: RepuestoOption[];
}) {
  const addItem = addEntradaItemAction.bind(null, entradaId);
  const [state, formAction, isPending] = useActionState(addItem, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EntradaItemFormInput>({
    resolver: zodResolver(entradaMercanciaItemInputSchema),
    defaultValues: { repuestoId: "", cantidad: "", precioCompraUnitario: "" },
  });

  return (
    <form
      noValidate
      ref={formRef}
      onSubmit={handleSubmit(() => startTransition(() => formAction(new FormData(formRef.current!))))}
    >
      <label htmlFor="repuestoId">Repuesto</label>
      <select
        id="repuestoId"
        required
        aria-invalid={errors.repuestoId ? true : undefined}
        aria-describedby={errors.repuestoId ? "repuestoId-error" : undefined}
        {...register("repuestoId")}
      >
        <option value="" disabled>
          Selecciona un repuesto
        </option>
        {repuestos.map((repuesto) => (
          <option key={repuesto.id} value={repuesto.id}>
            {repuesto.codigo} — {repuesto.nombre}
          </option>
        ))}
      </select>
      {errors.repuestoId ? <p id="repuestoId-error">{errors.repuestoId.message}</p> : null}

      <label htmlFor="cantidad">Cantidad</label>
      <input
        id="cantidad"
        type="number"
        min="1"
        required
        aria-invalid={errors.cantidad ? true : undefined}
        aria-describedby={errors.cantidad ? "cantidad-error" : undefined}
        {...register("cantidad")}
      />
      {errors.cantidad ? <p id="cantidad-error">{errors.cantidad.message}</p> : null}

      <label htmlFor="precioCompraUnitario">Precio de compra unitario</label>
      <input
        id="precioCompraUnitario"
        type="number"
        min="0"
        step="0.01"
        required
        aria-invalid={errors.precioCompraUnitario ? true : undefined}
        aria-describedby={errors.precioCompraUnitario ? "precioCompraUnitario-error" : undefined}
        {...register("precioCompraUnitario")}
      />
      {errors.precioCompraUnitario ? (
        <p id="precioCompraUnitario-error">{errors.precioCompraUnitario.message}</p>
      ) : null}

      <button type="submit" disabled={isPending}>
        {isPending ? "Registrando..." : "Registrar ítem"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Ítem registrado, stock actualizado</p> : null}
    </form>
  );
}
