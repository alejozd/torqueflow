"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registrarPagoAction, type PagoFormState } from "@/app/actions/pago-actions";
import { pagoInputSchema } from "@/lib/validation/factura";
import type { EstadoFactura } from "@/generated/prisma-tenant";
import type { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: PagoFormState = { error: null, success: false };

type PagoFormInput = z.input<typeof pagoInputSchema>;

export function RegistrarPagoForm({ facturaId, estado }: { facturaId: string; estado: EstadoFactura }) {
  const registrarPago = registrarPagoAction.bind(null, facturaId);
  const [state, formAction, isPending] = useActionState(registrarPago, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PagoFormInput>({
    resolver: zodResolver(pagoInputSchema),
    defaultValues: { monto: "", metodoPago: "EFECTIVO", referencia: "" },
  });

  if (estado === "PAGADA") {
    return <p role="status">Factura pagada</p>;
  }

  return (
    <form
      noValidate
      ref={formRef}
      onSubmit={handleSubmit(() => startTransition(() => formAction(new FormData(formRef.current!))))}
      className="flex flex-col gap-6"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="monto">Monto</Label>
          <Input
            id="monto"
            type="number"
            min="0.01"
            step="0.01"
            required
            aria-invalid={errors.monto ? true : undefined}
            aria-describedby={errors.monto ? "monto-error" : undefined}
            {...register("monto")}
          />
          {errors.monto ? <p id="monto-error">{errors.monto.message}</p> : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="metodoPago">Método de pago</Label>
          {/*
            Native <select>, not shadcn's Select (Base UI, no DOM <option>s
            while closed) -- userEvent.selectOptions()/getByRole("option")
            in the existing tests need real <select>/<option> elements.
            Styled by hand to match the shadcn select trigger look.
          */}
          <select
            id="metodoPago"
            aria-invalid={errors.metodoPago ? true : undefined}
            aria-describedby={errors.metodoPago ? "metodoPago-error" : undefined}
            className="flex h-8 w-full items-center justify-between rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
            {...register("metodoPago")}
          >
            <option value="EFECTIVO">Efectivo</option>
            <option value="TARJETA">Tarjeta</option>
            <option value="TRANSFERENCIA">Transferencia</option>
            <option value="OTRO">Otro</option>
          </select>
          {errors.metodoPago ? <p id="metodoPago-error">{errors.metodoPago.message}</p> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
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
