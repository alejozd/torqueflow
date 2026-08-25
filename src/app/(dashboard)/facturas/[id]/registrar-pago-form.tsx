"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registrarPagoAction, type PagoFormState } from "@/app/actions/pago-actions";
import { pagoInputSchema } from "@/lib/validation/factura";
import type { EstadoFactura } from "@/generated/prisma-tenant";
import type { z } from "zod";

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
    >
      <label htmlFor="monto">Monto</label>
      <input
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

      <label htmlFor="metodoPago">Método de pago</label>
      <select id="metodoPago" {...register("metodoPago")}>
        <option value="EFECTIVO">Efectivo</option>
        <option value="TARJETA">Tarjeta</option>
        <option value="TRANSFERENCIA">Transferencia</option>
        <option value="OTRO">Otro</option>
      </select>

      <label htmlFor="referencia">Referencia (opcional)</label>
      <input id="referencia" {...register("referencia")} />

      <button type="submit" disabled={isPending}>
        {isPending ? "Registrando..." : "Registrar pago"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Pago registrado</p> : null}
    </form>
  );
}
