"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createEntradaMercanciaAction, type EntradaFormState } from "@/app/actions/entrada-mercancia-actions";
import { entradaMercanciaInputSchema, type EntradaMercanciaInput } from "@/lib/validation/inventario";
import type { Bodega, Proveedor } from "@/generated/prisma-tenant";

const initialState: EntradaFormState = { error: null, success: false };

export function NuevaEntradaMercanciaForm({
  proveedores,
  bodegas,
}: {
  proveedores: Proveedor[];
  bodegas: Bodega[];
}) {
  const [state, formAction, isPending] = useActionState(createEntradaMercanciaAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EntradaMercanciaInput>({
    resolver: zodResolver(entradaMercanciaInputSchema),
    defaultValues: { proveedorId: "", bodegaId: "" },
  });

  return (
    <form
      noValidate
      ref={formRef}
      onSubmit={handleSubmit(() => startTransition(() => formAction(new FormData(formRef.current!))))}
    >
      <label htmlFor="proveedorId">Proveedor</label>
      <select
        id="proveedorId"
        required
        aria-invalid={errors.proveedorId ? true : undefined}
        aria-describedby={errors.proveedorId ? "proveedorId-error" : undefined}
        {...register("proveedorId")}
      >
        <option value="" disabled>
          Selecciona un proveedor
        </option>
        {proveedores.map((proveedor) => (
          <option key={proveedor.id} value={proveedor.id}>
            {proveedor.nombre}
          </option>
        ))}
      </select>
      {errors.proveedorId ? <p id="proveedorId-error">{errors.proveedorId.message}</p> : null}

      <label htmlFor="bodegaId">Bodega</label>
      <select
        id="bodegaId"
        required
        aria-invalid={errors.bodegaId ? true : undefined}
        aria-describedby={errors.bodegaId ? "bodegaId-error" : undefined}
        {...register("bodegaId")}
      >
        <option value="" disabled>
          Selecciona una bodega
        </option>
        {bodegas.map((bodega) => (
          <option key={bodega.id} value={bodega.id}>
            {bodega.nombre}
          </option>
        ))}
      </select>
      {errors.bodegaId ? <p id="bodegaId-error">{errors.bodegaId.message}</p> : null}

      <button type="submit" disabled={isPending}>
        {isPending ? "Creando..." : "Crear entrada"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Entrada creada</p> : null}
    </form>
  );
}
