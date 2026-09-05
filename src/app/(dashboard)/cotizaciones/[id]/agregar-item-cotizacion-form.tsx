"use client";

import { startTransition, useActionState, useEffect, useMemo, useRef } from "react";
import { useController, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { agregarItemCotizacionAction, type ItemCotizacionFormState } from "@/app/actions/cotizacion-actions";
import { itemCotizacionInputSchema } from "@/lib/validation/cotizacion";
import type { RepuestoOption } from "@/app/actions/repuesto-actions";
import { normalizeForSearch } from "@/lib/search";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const initialState: ItemCotizacionFormState = { error: null, success: false };

type ItemCotizacionFormInput = z.input<typeof itemCotizacionInputSchema>;

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function AgregarItemCotizacionForm({
  cotizacionId,
  repuestos,
}: {
  cotizacionId: string;
  repuestos: RepuestoOption[];
}) {
  const addItem = agregarItemCotizacionAction.bind(null, cotizacionId);
  const [state, formAction, isPending] = useActionState(addItem, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ItemCotizacionFormInput>({
    resolver: zodResolver(itemCotizacionInputSchema),
    defaultValues: { tipo: "REPUESTO", repuestoId: "", descripcion: "", cantidad: "", precioUnitario: "" },
  });
  const { field: tipoField } = useController({ name: "tipo", control });
  const { field: repuestoIdField } = useController({ name: "repuestoId", control });
  const cantidad = useWatch({ control, name: "cantidad" });
  const precioUnitario = useWatch({ control, name: "precioUnitario" });

  const repuestosPorId = useMemo(() => new Map(repuestos.map((repuesto) => [repuesto.id, repuesto])), [repuestos]);
  const repuestoOptions: ComboboxOption[] = useMemo(
    () =>
      repuestos.map((repuesto) => ({
        value: repuesto.id,
        label: `${repuesto.codigo} — ${repuesto.nombre} · stock ${repuesto.stockActual}`,
      })),
    [repuestos],
  );

  const importe = (Number(cantidad) || 0) * (Number(precioUnitario) || 0);

  // Prefills precioUnitario from the catalog once a repuesto is picked -- same
  // technique ordenes/[id]/agregar-item-form.tsx uses, without the "already
  // prefilled for this id" guard (this form resets after every successful
  // submit, so there's no long-lived selection to avoid re-stomping).
  useEffect(() => {
    if (!repuestoIdField.value) return;
    const seleccionado = repuestosPorId.get(repuestoIdField.value);
    if (seleccionado) {
      setValue("precioUnitario", String(seleccionado.precioVenta));
    }
  }, [repuestoIdField.value, repuestosPorId, setValue]);

  useEffect(() => {
    if (state.success) {
      reset({ tipo: tipoField.value, repuestoId: "", descripcion: "", cantidad: "", precioUnitario: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form
      noValidate
      ref={formRef}
      onSubmit={handleSubmit((data) =>
        startTransition(() => {
          const formData = new FormData(formRef.current!);
          // tipo/repuestoId are Combobox/toggle-controlled (react-hook-form,
          // not native register()) -- they don't populate FormData on their
          // own, so they must be set explicitly here before submitting.
          formData.set("tipo", data.tipo);
          formData.set("repuestoId", data.repuestoId ?? "");
          formAction(formData);
        }),
      )}
      className="flex flex-col gap-3"
    >
      <div className="flex gap-2">
        <Button
          type="button"
          variant={tipoField.value === "REPUESTO" ? "default" : "outline"}
          size="sm"
          onClick={() => {
            tipoField.onChange("REPUESTO");
            setValue("descripcion", "");
          }}
        >
          Repuesto
        </Button>
        <Button
          type="button"
          variant={tipoField.value === "MANO_OBRA" ? "default" : "outline"}
          size="sm"
          onClick={() => {
            tipoField.onChange("MANO_OBRA");
            repuestoIdField.onChange("");
          }}
        >
          Mano de obra
        </Button>
      </div>

      {tipoField.value === "REPUESTO" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="itemRepuestoId">Repuesto del inventario</Label>
          <Combobox
            id="itemRepuestoId"
            required
            items={repuestoOptions}
            value={repuestoIdField.value ?? ""}
            onValueChange={repuestoIdField.onChange}
            placeholder="Código o nombre…"
            emptyMessage="Ningún repuesto coincide"
            aria-invalid={errors.repuestoId ? true : undefined}
            filter={(item, query) => normalizeForSearch(item.label).includes(normalizeForSearch(query))}
          />
          {errors.repuestoId ? <p className="text-sm text-destructive">{errors.repuestoId.message}</p> : null}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="itemDescripcion">Descripción</Label>
          <Input
            id="itemDescripcion"
            placeholder="Ej: Cambio de pastillas de freno"
            aria-invalid={errors.descripcion ? true : undefined}
            {...register("descripcion")}
          />
          {errors.descripcion ? <p className="text-sm text-destructive">{errors.descripcion.message}</p> : null}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="itemCantidad">Cantidad</Label>
          <Input
            id="itemCantidad"
            type="number"
            min="0.01"
            step="0.01"
            className="font-mono"
            aria-invalid={errors.cantidad ? true : undefined}
            {...register("cantidad")}
          />
          {errors.cantidad ? <p className="text-sm text-destructive">{errors.cantidad.message}</p> : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="itemPrecioUnitario">Precio unitario</Label>
          <Input
            id="itemPrecioUnitario"
            type="number"
            min="0"
            step="0.01"
            className="font-mono"
            aria-invalid={errors.precioUnitario ? true : undefined}
            {...register("precioUnitario")}
          />
          {errors.precioUnitario ? <p className="text-sm text-destructive">{errors.precioUnitario.message}</p> : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Importe</Label>
          <div className={cn("flex h-8 items-center rounded-lg border border-input px-2.5 font-mono text-sm")}>
            {formatoMoneda.format(importe)}
          </div>
        </div>
      </div>

      <Button type="submit" disabled={isPending} className="self-end">
        {isPending ? "Agregando..." : "Agregar"}
      </Button>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}
