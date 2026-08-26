"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createEntradaMercanciaAction, type EntradaFormState } from "@/app/actions/entrada-mercancia-actions";
import { entradaMercanciaInputSchema, type EntradaMercanciaInput } from "@/lib/validation/inventario";
import type { Bodega, Proveedor } from "@/generated/prisma-tenant";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

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
      className="flex flex-col gap-6"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="proveedorId">Proveedor</Label>
          {/*
            Native <select>, not shadcn's Select (Base UI, no DOM <option>s
            while closed) -- userEvent.selectOptions()/getByRole("option")
            in the existing tests need real <select>/<option> elements.
            Styled by hand to match the shadcn select trigger look.
          */}
          <select
            id="proveedorId"
            required
            aria-invalid={errors.proveedorId ? true : undefined}
            aria-describedby={errors.proveedorId ? "proveedorId-error" : undefined}
            className="flex h-8 w-full items-center justify-between rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
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
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bodegaId">Bodega</Label>
          {/*
            Native <select>, not shadcn's Select (Base UI, no DOM <option>s
            while closed) -- userEvent.selectOptions()/getByRole("option")
            in the existing tests need real <select>/<option> elements.
            Styled by hand to match the shadcn select trigger look.
          */}
          <select
            id="bodegaId"
            required
            aria-invalid={errors.bodegaId ? true : undefined}
            aria-describedby={errors.bodegaId ? "bodegaId-error" : undefined}
            className="flex h-8 w-full items-center justify-between rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
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
        </div>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Creando..." : "Crear entrada"}
      </Button>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? <p role="status">Entrada creada</p> : null}
    </form>
  );
}
