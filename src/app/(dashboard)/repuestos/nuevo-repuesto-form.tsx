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
import { DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";

const initialState: RepuestoFormState = { error: null, success: false, repuestoId: null };

const repuestoFormSchema = repuestoInputSchema.extend({ stockActual: repuestoStockInicialSchema });
type RepuestoFormInput = z.input<typeof repuestoFormSchema>;

export function NuevoRepuestoForm({
  bodegas,
  proveedores,
  onCreated,
  showCancelButton = false,
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
  /**
   * Renders a Cancel button (via DialogClose) next to the submit button.
   * Only safe when this form is rendered inside a Dialog ancestor (e.g.
   * NuevoRepuestoDialog) -- defaults to false because this same form is
   * also rendered standalone on /repuestos/nuevo with no Dialog ancestor,
   * where DialogClose would throw.
   */
  showCancelButton?: boolean;
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
  const { field: bodegaIdField } = useController({ name: "bodegaId", control });

  const proveedorOptions: ComboboxOption[] = useMemo(
    () => proveedores.map((proveedor) => ({ value: proveedor.id, label: proveedor.nombre })),
    [proveedores],
  );

  function onValid(data: { proveedorId?: string; bodegaId?: string }) {
    startTransition(async () => {
      const formData = new FormData(formRef.current!);
      // proveedorId and bodegaId are Combobox/SelectField
      // (react-hook-form-controlled, not native <select name="..."> register())
      // -- they don't populate FormData on their own, so they must be set
      // explicitly here.
      formData.set("proveedorId", data.proveedorId ?? "");
      formData.set("bodegaId", data.bodegaId ?? "");
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
            <SelectField
              id="bodegaId"
              aria-invalid={errors.bodegaId ? true : undefined}
              aria-describedby={errors.bodegaId ? "bodegaId-error" : undefined}
              value={bodegaIdField.value ?? ""}
              onValueChange={bodegaIdField.onChange}
              placeholder="Selecciona una bodega"
              items={bodegas.map((bodega) => ({ value: bodega.id, label: bodega.nombre }))}
            />
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

      <div className="flex justify-end gap-2">
        {showCancelButton ? (
          <DialogClose render={<Button type="button" variant="outline" />}>
            Cancelar
          </DialogClose>
        ) : null}
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Crear repuesto"}
        </Button>
      </div>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? <p role="status">Repuesto creado</p> : null}
    </form>
  );
}
