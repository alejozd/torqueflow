"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useController, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createRepuestoAction, type RepuestoFormState } from "@/app/actions/repuesto-actions";
import { repuestoInputSchema, repuestoStockInicialSchema } from "@/lib/validation/inventario";
import type { Bodega, Proveedor } from "@/generated/prisma-tenant";
import { FormGroup } from "@/components/form-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

const initialState: RepuestoFormState = { error: null, success: false, repuestoId: null };

const repuestoFormSchema = repuestoInputSchema.extend({ stockActual: repuestoStockInicialSchema });
type RepuestoFormInput = z.input<typeof repuestoFormSchema>;

export function NuevoRepuestoForm({
  bodegas,
  proveedores,
  onCreated,
}: {
  bodegas: Bodega[];
  proveedores: Proveedor[];
  /**
   * When provided (embedded in NuevoRepuestoDialog from AgregarItemForm),
   * called with the created repuesto's id instead of showing the inline
   * "Repuesto creado" status -- the caller closes the dialog and selects it.
   * Manual useTransition + await, not useActionState + useEffect: same
   * pattern as GenerarFacturaForm/NuevaCitaForm, so the callback fires
   * synchronously with the action's result instead of racing a
   * state-driven effect against a parent re-render.
   */
  onCreated?: (repuestoId: string) => void;
}) {
  const [state, setState] = useState<RepuestoFormState>(initialState);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    control,
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
  const { field: proveedorIdField } = useController({ name: "proveedorId", control });

  const proveedorOptions: ComboboxOption[] = useMemo(
    () => proveedores.map((proveedor) => ({ value: proveedor.id, label: proveedor.nombre })),
    [proveedores],
  );

  function onValid(data: { proveedorId?: string }) {
    startTransition(async () => {
      const formData = new FormData(formRef.current!);
      // proveedorId is a Combobox (react-hook-form-controlled, not a
      // native <select name="..."> register()) -- it doesn't populate
      // FormData on its own, so it must be set explicitly here.
      formData.set("proveedorId", data.proveedorId ?? "");
      const result = await createRepuestoAction(initialState, formData);
      if (result.success && result.repuestoId) {
        if (onCreated) onCreated(result.repuestoId);
        else setState(result);
      } else {
        setState(result);
      }
    });
  }

  return (
    <form noValidate ref={formRef} onSubmit={handleSubmit(onValid)} className="flex flex-col gap-4">
      <FormGroup label="Identificación">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="codigo">Código</Label>
            <Input
              id="codigo"
              className="font-mono"
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

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="descripcion">Descripción</Label>
            <Textarea
              id="descripcion"
              aria-invalid={errors.descripcion ? true : undefined}
              aria-describedby={errors.descripcion ? "descripcion-error" : undefined}
              {...register("descripcion")}
            />
            {errors.descripcion ? <p id="descripcion-error">{errors.descripcion.message}</p> : null}
          </div>
        </div>
      </FormGroup>

      <FormGroup label="Ubicación">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bodegaId">Bodega</Label>
            {/*
              Native <select>, not shadcn's Select (Base UI, no DOM <option>s
              while closed) -- userEvent.selectOptions()/getByRole("option")
              in the existing tests need real <select>/<option> elements.
              Styled by hand to match the shadcn select trigger look.
            */}
            <NativeSelect
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
            </NativeSelect>
            {errors.bodegaId ? <p id="bodegaId-error">{errors.bodegaId.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="proveedorId">Proveedor</Label>
            <Combobox
              id="proveedorId"
              items={proveedorOptions}
              value={proveedorIdField.value ?? ""}
              onValueChange={proveedorIdField.onChange}
              placeholder="Sin proveedor asignado"
              emptyMessage="Ningún proveedor coincide"
              aria-invalid={errors.proveedorId ? true : undefined}
              aria-describedby={errors.proveedorId ? "proveedorId-error" : undefined}
            />
            {errors.proveedorId ? <p id="proveedorId-error">{errors.proveedorId.message}</p> : null}
          </div>
        </div>
      </FormGroup>

      <FormGroup label="Precios y stock">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="precioCompra">Precio de compra</Label>
            <Input
              id="precioCompra"
              type="number"
              min="0"
              step="0.01"
              className="font-mono"
              aria-invalid={errors.precioCompra ? true : undefined}
              aria-describedby={errors.precioCompra ? "precioCompra-error" : undefined}
              {...register("precioCompra")}
            />
            {errors.precioCompra ? <p id="precioCompra-error">{errors.precioCompra.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="precioVenta">Precio de venta</Label>
            <Input
              id="precioVenta"
              type="number"
              min="0"
              step="0.01"
              className="font-mono"
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
              className="font-mono"
              aria-invalid={errors.stockActual ? true : undefined}
              aria-describedby={errors.stockActual ? "stockActual-error" : undefined}
              {...register("stockActual")}
            />
            {errors.stockActual ? <p id="stockActual-error">{errors.stockActual.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stockMinimo">Stock mínimo</Label>
            <Input
              id="stockMinimo"
              type="number"
              min="0"
              className="font-mono"
              aria-invalid={errors.stockMinimo ? true : undefined}
              aria-describedby={errors.stockMinimo ? "stockMinimo-error" : undefined}
              {...register("stockMinimo")}
            />
            {errors.stockMinimo ? <p id="stockMinimo-error">{errors.stockMinimo.message}</p> : null}
          </div>
        </div>
      </FormGroup>

      <Button type="submit" disabled={isPending} className="self-end">
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
