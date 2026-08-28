"use client";

import { startTransition, useActionState, useMemo, useRef } from "react";
import { useController, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  updateRepuestoAction,
  deleteRepuestoFormAction,
  type RepuestoFormState,
} from "@/app/actions/repuesto-actions";
import { repuestoInputSchema } from "@/lib/validation/inventario";
import type { Bodega, Proveedor } from "@/generated/prisma-tenant";
import { FormGroup } from "@/components/form-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type RepuestoFormInput = z.input<typeof repuestoInputSchema>;

const initialState: RepuestoFormState = { error: null, success: false };

export interface RepuestoEditable {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  precioCompra: number;
  precioVenta: number;
  stockMinimo: number;
  bodegaId: string;
  proveedorId: string | null;
}

export function EditarRepuestoForm({
  repuesto,
  bodegas,
  proveedores,
}: {
  repuesto: RepuestoEditable;
  bodegas: Bodega[];
  proveedores: Proveedor[];
}) {
  const [state, formAction, isPending] = useActionState(
    updateRepuestoAction.bind(null, repuesto.id),
    initialState,
  );
  const [deleteState, deleteFormAction, isDeletePending] = useActionState(
    deleteRepuestoFormAction.bind(null, repuesto.id),
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<RepuestoFormInput>({
    resolver: zodResolver(repuestoInputSchema),
    defaultValues: {
      codigo: repuesto.codigo,
      nombre: repuesto.nombre,
      descripcion: repuesto.descripcion ?? "",
      precioCompra: String(repuesto.precioCompra),
      precioVenta: String(repuesto.precioVenta),
      stockMinimo: String(repuesto.stockMinimo),
      bodegaId: repuesto.bodegaId,
      proveedorId: repuesto.proveedorId ?? "",
    },
  });
  const { field: proveedorIdField } = useController({ name: "proveedorId", control });

  const proveedorOptions: ComboboxOption[] = useMemo(
    () => proveedores.map((proveedor) => ({ value: proveedor.id, label: proveedor.nombre })),
    [proveedores],
  );

  return (
    <div className="flex flex-col gap-4">
      <form
        noValidate
        ref={formRef}
        onSubmit={handleSubmit((data) =>
          startTransition(() => {
            const formData = new FormData(formRef.current!);
            formData.set("proveedorId", data.proveedorId ?? "");
            formAction(formData);
          }),
        )}
        className="flex flex-col gap-4"
      >
        <FormGroup label="Identificación">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`codigo-${repuesto.id}`}>Código</Label>
              <Input
                id={`codigo-${repuesto.id}`}
                className="font-mono"
                aria-invalid={errors.codigo ? true : undefined}
                aria-describedby={errors.codigo ? `codigo-${repuesto.id}-error` : undefined}
                {...register("codigo")}
              />
              {errors.codigo ? <p id={`codigo-${repuesto.id}-error`}>{errors.codigo.message}</p> : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`nombre-${repuesto.id}`}>Nombre</Label>
              <Input
                id={`nombre-${repuesto.id}`}
                aria-invalid={errors.nombre ? true : undefined}
                aria-describedby={errors.nombre ? `nombre-${repuesto.id}-error` : undefined}
                {...register("nombre")}
              />
              {errors.nombre ? <p id={`nombre-${repuesto.id}-error`}>{errors.nombre.message}</p> : null}
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor={`descripcion-${repuesto.id}`}>Descripción</Label>
              <Textarea
                id={`descripcion-${repuesto.id}`}
                aria-invalid={errors.descripcion ? true : undefined}
                aria-describedby={errors.descripcion ? `descripcion-${repuesto.id}-error` : undefined}
                {...register("descripcion")}
              />
              {errors.descripcion ? (
                <p id={`descripcion-${repuesto.id}-error`}>{errors.descripcion.message}</p>
              ) : null}
            </div>
          </div>
        </FormGroup>

        <FormGroup label="Ubicación">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`bodegaId-${repuesto.id}`}>Bodega</Label>
              <select
                id={`bodegaId-${repuesto.id}`}
                aria-invalid={errors.bodegaId ? true : undefined}
                aria-describedby={errors.bodegaId ? `bodegaId-${repuesto.id}-error` : undefined}
                className="flex h-8 w-full items-center justify-between rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
                {...register("bodegaId")}
              >
                {bodegas.map((bodega) => (
                  <option key={bodega.id} value={bodega.id}>
                    {bodega.nombre}
                  </option>
                ))}
              </select>
              {errors.bodegaId ? <p id={`bodegaId-${repuesto.id}-error`}>{errors.bodegaId.message}</p> : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`proveedorId-${repuesto.id}`}>Proveedor</Label>
              <Combobox
                id={`proveedorId-${repuesto.id}`}
                items={proveedorOptions}
                value={proveedorIdField.value ?? ""}
                onValueChange={proveedorIdField.onChange}
                placeholder="Sin proveedor asignado"
                emptyMessage="Ningún proveedor coincide"
                aria-invalid={errors.proveedorId ? true : undefined}
                aria-describedby={errors.proveedorId ? `proveedorId-${repuesto.id}-error` : undefined}
              />
              {errors.proveedorId ? (
                <p id={`proveedorId-${repuesto.id}-error`}>{errors.proveedorId.message}</p>
              ) : null}
            </div>
          </div>
        </FormGroup>

        <FormGroup label="Precios">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`precioCompra-${repuesto.id}`}>Precio de compra</Label>
              <Input
                id={`precioCompra-${repuesto.id}`}
                type="number"
                min="0"
                step="0.01"
                className="font-mono"
                aria-invalid={errors.precioCompra ? true : undefined}
                aria-describedby={errors.precioCompra ? `precioCompra-${repuesto.id}-error` : undefined}
                {...register("precioCompra")}
              />
              {errors.precioCompra ? (
                <p id={`precioCompra-${repuesto.id}-error`}>{errors.precioCompra.message}</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`precioVenta-${repuesto.id}`}>Precio de venta</Label>
              <Input
                id={`precioVenta-${repuesto.id}`}
                type="number"
                min="0"
                step="0.01"
                className="font-mono"
                aria-invalid={errors.precioVenta ? true : undefined}
                aria-describedby={errors.precioVenta ? `precioVenta-${repuesto.id}-error` : undefined}
                {...register("precioVenta")}
              />
              {errors.precioVenta ? (
                <p id={`precioVenta-${repuesto.id}-error`}>{errors.precioVenta.message}</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`stockMinimo-${repuesto.id}`}>Stock mínimo</Label>
              <Input
                id={`stockMinimo-${repuesto.id}`}
                type="number"
                min="0"
                className="font-mono"
                aria-invalid={errors.stockMinimo ? true : undefined}
                aria-describedby={errors.stockMinimo ? `stockMinimo-${repuesto.id}-error` : undefined}
                {...register("stockMinimo")}
              />
              {errors.stockMinimo ? (
                <p id={`stockMinimo-${repuesto.id}-error`}>{errors.stockMinimo.message}</p>
              ) : null}
            </div>
          </div>
        </FormGroup>

        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar repuesto"}
        </Button>

        {state.error ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        {state.success ? <p role="status">Repuesto actualizado</p> : null}
      </form>

      <form action={deleteFormAction} className="flex flex-col gap-1.5 border-t border-border pt-4">
        <Button type="submit" variant="destructive" disabled={isDeletePending}>
          Eliminar {repuesto.nombre}
        </Button>
        {deleteState.error ? (
          <Alert variant="destructive">
            <AlertDescription>{deleteState.error}</AlertDescription>
          </Alert>
        ) : null}
      </form>
    </div>
  );
}
