"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { addEntradaItemAction, type EntradaFormState } from "@/app/actions/entrada-mercancia-actions";
import { entradaMercanciaItemInputSchema } from "@/lib/validation/inventario";
import type { RepuestoOption } from "@/app/actions/repuesto-actions";
import type { z } from "zod";
import { FormGroup } from "@/components/form-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
      className="flex flex-col gap-4"
    >
      <FormGroup label="Repuesto">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="repuestoId">Repuesto</Label>
          {/*
            Native <select>, not shadcn's Select (Base UI, no DOM <option>s
            while closed) -- userEvent.selectOptions()/getByRole("option")
            in the existing tests need real <select>/<option> elements.
            Styled by hand to match the shadcn select trigger look.
          */}
          <select
            id="repuestoId"
            required
            aria-invalid={errors.repuestoId ? true : undefined}
            aria-describedby={errors.repuestoId ? "repuestoId-error" : undefined}
            className="flex h-8 w-full items-center justify-between rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
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
        </div>
      </FormGroup>

      <FormGroup label="Recepción">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cantidad">Cantidad</Label>
            <Input
              id="cantidad"
              type="number"
              min="1"
              required
              className="font-mono"
              aria-invalid={errors.cantidad ? true : undefined}
              aria-describedby={errors.cantidad ? "cantidad-error" : undefined}
              {...register("cantidad")}
            />
            {errors.cantidad ? <p id="cantidad-error">{errors.cantidad.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="precioCompraUnitario">Precio de compra unitario</Label>
            <Input
              id="precioCompraUnitario"
              type="number"
              min="0"
              step="0.01"
              required
              className="font-mono"
              aria-invalid={errors.precioCompraUnitario ? true : undefined}
              aria-describedby={errors.precioCompraUnitario ? "precioCompraUnitario-error" : undefined}
              {...register("precioCompraUnitario")}
            />
            {errors.precioCompraUnitario ? (
              <p id="precioCompraUnitario-error">{errors.precioCompraUnitario.message}</p>
            ) : null}
          </div>
        </div>
      </FormGroup>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Registrando..." : "Registrar ítem"}
      </Button>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? <p role="status">Ítem registrado, stock actualizado</p> : null}
    </form>
  );
}
