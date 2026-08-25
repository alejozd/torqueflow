"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createRepuestoAction, type RepuestoFormState } from "@/app/actions/repuesto-actions";
import { repuestoInputSchema, repuestoStockInicialSchema } from "@/lib/validation/inventario";
import type { Bodega, Proveedor } from "@/generated/prisma-tenant";

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
    >
      <label htmlFor="codigo">Código</label>
      <input
        id="codigo"
        aria-invalid={errors.codigo ? true : undefined}
        aria-describedby={errors.codigo ? "codigo-error" : undefined}
        {...register("codigo")}
      />
      {errors.codigo ? <p id="codigo-error">{errors.codigo.message}</p> : null}

      <label htmlFor="nombre">Nombre</label>
      <input
        id="nombre"
        aria-invalid={errors.nombre ? true : undefined}
        aria-describedby={errors.nombre ? "nombre-error" : undefined}
        {...register("nombre")}
      />
      {errors.nombre ? <p id="nombre-error">{errors.nombre.message}</p> : null}

      <label htmlFor="descripcion">Descripción</label>
      <textarea id="descripcion" {...register("descripcion")} />

      <label htmlFor="precioCompra">Precio de compra</label>
      <input
        id="precioCompra"
        type="number"
        min="0"
        step="0.01"
        aria-invalid={errors.precioCompra ? true : undefined}
        aria-describedby={errors.precioCompra ? "precioCompra-error" : undefined}
        {...register("precioCompra")}
      />
      {errors.precioCompra ? <p id="precioCompra-error">{errors.precioCompra.message}</p> : null}

      <label htmlFor="precioVenta">Precio de venta</label>
      <input
        id="precioVenta"
        type="number"
        min="0"
        step="0.01"
        aria-invalid={errors.precioVenta ? true : undefined}
        aria-describedby={errors.precioVenta ? "precioVenta-error" : undefined}
        {...register("precioVenta")}
      />
      {errors.precioVenta ? <p id="precioVenta-error">{errors.precioVenta.message}</p> : null}

      <label htmlFor="stockActual">Stock inicial</label>
      <input
        id="stockActual"
        type="number"
        min="0"
        aria-invalid={errors.stockActual ? true : undefined}
        aria-describedby={errors.stockActual ? "stockActual-error" : undefined}
        {...register("stockActual")}
      />
      {errors.stockActual ? <p id="stockActual-error">{errors.stockActual.message}</p> : null}

      <label htmlFor="stockMinimo">Stock mínimo</label>
      <input
        id="stockMinimo"
        type="number"
        min="0"
        aria-invalid={errors.stockMinimo ? true : undefined}
        aria-describedby={errors.stockMinimo ? "stockMinimo-error" : undefined}
        {...register("stockMinimo")}
      />
      {errors.stockMinimo ? <p id="stockMinimo-error">{errors.stockMinimo.message}</p> : null}

      <label htmlFor="bodegaId">Bodega</label>
      <select
        id="bodegaId"
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

      <label htmlFor="proveedorId">Proveedor</label>
      <select id="proveedorId" {...register("proveedorId")}>
        <option value="">Sin proveedor asignado</option>
        {proveedores.map((proveedor) => (
          <option key={proveedor.id} value={proveedor.id}>
            {proveedor.nombre}
          </option>
        ))}
      </select>

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Crear repuesto"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Repuesto creado</p> : null}
    </form>
  );
}
