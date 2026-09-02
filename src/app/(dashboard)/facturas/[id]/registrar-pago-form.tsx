"use client";

import { startTransition, useActionState, useRef } from "react";
import { useController, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registrarPagoAction, type PagoFormState } from "@/app/actions/pago-actions";
import { pagoInputSchema } from "@/lib/validation/factura";
import type { EstadoFactura } from "@/generated/prisma-tenant";
import type { z } from "zod";
import { FormGroup } from "@/components/form-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";

const initialState: PagoFormState = { error: null, success: false };

type PagoFormInput = z.input<typeof pagoInputSchema>;

export function RegistrarPagoForm({ facturaId, estado }: { facturaId: string; estado: EstadoFactura }) {
  const registrarPago = registrarPagoAction.bind(null, facturaId);
  const [state, formAction, isPending] = useActionState(registrarPago, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<PagoFormInput>({
    resolver: zodResolver(pagoInputSchema),
    defaultValues: { monto: "", metodoPago: "EFECTIVO", referencia: "" },
  });
  const { field: metodoPagoField } = useController({ name: "metodoPago", control });

  if (estado === "PAGADA") {
    return <p role="status">Factura pagada</p>;
  }

  return (
    <form
      noValidate
      ref={formRef}
      onSubmit={handleSubmit((data) =>
        startTransition(() => {
          const formData = new FormData(formRef.current!);
          // metodoPago is a SelectField (react-hook-form-controlled, not a
          // native <select name="..."> register()) -- it doesn't populate
          // FormData on its own, so it must be set explicitly here before
          // submitting.
          formData.set("metodoPago", data.metodoPago ?? "");
          formAction(formData);
        }),
      )}
      className="flex flex-col gap-4"
    >
      <FormGroup label="Pago">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="monto">Monto</Label>
            <Input
              id="monto"
              type="number"
              min="0.01"
              step="0.01"
              required
              className="font-mono"
              aria-invalid={errors.monto ? true : undefined}
              aria-describedby={errors.monto ? "monto-error" : undefined}
              {...register("monto")}
            />
            {errors.monto ? <p id="monto-error">{errors.monto.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="metodoPago">Método de pago</Label>
            <SelectField
              id="metodoPago"
              aria-invalid={errors.metodoPago ? true : undefined}
              aria-describedby={errors.metodoPago ? "metodoPago-error" : undefined}
              value={metodoPagoField.value ?? ""}
              onValueChange={metodoPagoField.onChange}
              items={[
                { value: "EFECTIVO", label: "Efectivo" },
                { value: "TARJETA", label: "Tarjeta" },
                { value: "TRANSFERENCIA", label: "Transferencia" },
                { value: "OTRO", label: "Otro" },
              ]}
            />
            {errors.metodoPago ? <p id="metodoPago-error">{errors.metodoPago.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="referencia">Referencia (opcional)</Label>
            <Input
              id="referencia"
              aria-invalid={errors.referencia ? true : undefined}
              aria-describedby={errors.referencia ? "referencia-error" : undefined}
              {...register("referencia")}
            />
            {errors.referencia ? <p id="referencia-error">{errors.referencia.message}</p> : null}
          </div>
        </div>
      </FormGroup>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Registrando..." : "Registrar pago"}
      </Button>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? <p role="status">Pago registrado</p> : null}
    </form>
  );
}
