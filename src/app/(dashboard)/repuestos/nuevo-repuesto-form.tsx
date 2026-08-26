"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createRepuestoAction, type RepuestoFormState } from "@/app/actions/repuesto-actions";
import { repuestoInputSchema, repuestoStockInicialSchema } from "@/lib/validation/inventario";
import type { Bodega, Proveedor } from "@/generated/prisma-tenant";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: RepuestoFormState = { error: null, success: false };

const repuestoFormSchema = repuestoInputSchema.extend({ stockActual: repuestoStockInicialSchema });
type RepuestoFormInput = z.input<typeof repuestoFormSchema>;

export function NuevoRepuestoForm({
  bodegas,
  proveedores,
}: {
  bodegas: Bodega[];
  proveedores: Proveedor[];
}) {
  const [state, formAction, isPending] = useActionState(createRepuestoAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RepuestoFormInput>({
    resolver: zodResolver(repuestoFormSchema),
    defaultValues: {
      codigo: "",
      nombre: "",
      descripcion: "",
      precioCompra: "",
      precioVenta: "",
      stockActual: 0,
      stockMinimo: 0,
      bodegaId: "",
      proveedorId: "",
    },
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
          <Label htmlFor="codigo">Código</Label>
          <Input
            id="codigo"
            aria-invalid={errors.codigo ? true : undefined}
            aria-describedby={errors.codigo ? "codigo-error" : undefined}
            {...register("codigo")}
          />
          {errors.codigo ? <p id="codigo-error">{errors.codigo.message}</p> : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nombre">Nombre</Label>
          <Input
            id="nombre"
            aria-invalid={errors.nombre ? true : undefined}
            aria-describedby={errors.nombre ? "nombre-error" : undefined}
            {...register("nombre")}
          />
          {errors.nombre ? <p id="nombre-error">{errors.nombre.message}</p> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="descripcion">Descripción</Label>
          <Textarea
            id="descripcion"
            aria-invalid={errors.descripcion ? true : undefined}
            aria-describedby={errors.descripcion ? "descripcion-error" : undefined}
            {...register("descripcion")}
          />
          {errors.descripcion ? <p id="descripcion-error">{errors.descripcion.message}</p> : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="precioCompra">Precio de compra</Label>
          <Input
            id="precioCompra"
            type="number"
            min="0"
            step="0.01"
            aria-invalid={errors.precioCompra ? true : undefined}
            aria-describedby={errors.precioCompra ? "precioCompra-error" : undefined}
            {...register("precioCompra")}
          />
          {errors.precioCompra ? <p id="precioCompra-error">{errors.precioCompra.message}</p> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="precioVenta">Precio de venta</Label>
          <Input
            id="precioVenta"
            type="number"
            min="0"
            step="0.01"
            aria-invalid={errors.precioVenta ? true : undefined}
            aria-describedby={errors.precioVenta ? "precioVenta-error" : undefined}
            {...register("precioVenta")}
          />
          {errors.precioVenta ? <p id="precioVenta-error">{errors.precioVenta.message}</p> : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="stockActual">Stock inicial</Label>
          <Input
            id="stockActual"
            type="number"
            min="0"
            aria-invalid={errors.stockActual ? true : undefined}
            aria-describedby={errors.stockActual ? "stockActual-error" : undefined}
            {...register("stockActual")}
          />
          {errors.stockActual ? <p id="stockActual-error">{errors.stockActual.message}</p> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="stockMinimo">Stock mínimo</Label>
          <Input
            id="stockMinimo"
            type="number"
            min="0"
            aria-invalid={errors.stockMinimo ? true : undefined}
            aria-describedby={errors.stockMinimo ? "stockMinimo-error" : undefined}
            {...register("stockMinimo")}
          />
          {errors.stockMinimo ? <p id="stockMinimo-error">{errors.stockMinimo.message}</p> : null}
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
            aria-invalid={errors.proveedorId ? true : undefined}
            aria-describedby={errors.proveedorId ? "proveedorId-error" : undefined}
            className="flex h-8 w-full items-center justify-between rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
            {...register("proveedorId")}
          >
            <option value="">Sin proveedor asignado</option>
            {proveedores.map((proveedor) => (
              <option key={proveedor.id} value={proveedor.id}>
                {proveedor.nombre}
              </option>
            ))}
          </select>
          {errors.proveedorId ? <p id="proveedorId-error">{errors.proveedorId.message}</p> : null}
        </div>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Crear repuesto"}
      </Button>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? <p role="status">Repuesto creado</p> : null}
    </form>
  );
}
