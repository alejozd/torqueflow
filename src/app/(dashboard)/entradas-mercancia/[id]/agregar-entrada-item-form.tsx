"use client";

import { startTransition, useActionState, useMemo, useRef } from "react";
import { useController, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { addEntradaItemAction, type EntradaFormState } from "@/app/actions/entrada-mercancia-actions";
import { entradaMercanciaItemInputSchema } from "@/lib/validation/inventario";
import type { RepuestoOption } from "@/app/actions/repuesto-actions";
import type { z } from "zod";
import { FormGroup } from "@/components/form-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: EntradaFormState = { error: null, success: false, entradaId: null };

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
    control,
    formState: { errors },
  } = useForm<EntradaItemFormInput>({
    resolver: zodResolver(entradaMercanciaItemInputSchema),
    defaultValues: { repuestoId: "", cantidad: "", precioCompraUnitario: "" },
  });
  const { field: repuestoIdField } = useController({ name: "repuestoId", control });

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
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="repuestoId">Repuesto</Label>
          <Combobox
            id="repuestoId"
            required
            items={repuestoOptions}
            value={repuestoIdField.value ?? ""}
            onValueChange={repuestoIdField.onChange}
            placeholder="Buscar repuesto..."
            emptyMessage="Ningún repuesto coincide"
            aria-invalid={errors.repuestoId ? true : undefined}
            aria-describedby={errors.repuestoId ? "repuestoId-error" : undefined}
          />
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
