"use client";

import { startTransition, useActionState, useEffect, useMemo, useRef } from "react";
import { Plus } from "lucide-react";
import { useController, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { addEntradaItemAction, type EntradaFormState } from "@/app/actions/entrada-mercancia-actions";
import { entradaMercanciaItemInputSchema } from "@/lib/validation/inventario";
import type { RepuestoOption } from "@/app/actions/repuesto-actions";
import { normalizeForSearch } from "@/lib/search";
import { cn } from "@/lib/utils";
import type { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { KPI_TONE } from "@/components/ui/kpi-card";
import { Label } from "@/components/ui/label";

const initialState: EntradaFormState = { error: null, success: false, entradaId: null };

type EntradaItemFormInput = z.input<typeof entradaMercanciaItemInputSchema>;

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function AgregarEntradaItemForm({
  entradaId,
  repuestos,
}: {
  entradaId: string;
  repuestos: RepuestoOption[];
}) {
  const addItem = addEntradaItemAction.bind(null, entradaId);
  const [state, formAction, isPending] = useActionState(addItem, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors },
  } = useForm<EntradaItemFormInput>({
    resolver: zodResolver(entradaMercanciaItemInputSchema),
    defaultValues: { repuestoId: "", cantidad: "", precioCompraUnitario: "" },
  });
  const { field: repuestoIdField } = useController({ name: "repuestoId", control });
  const cantidadValue = useWatch({ control, name: "cantidad" });
  const costoValue = useWatch({ control, name: "precioCompraUnitario" });

  const repuestosPorId = useMemo(() => new Map(repuestos.map((r) => [r.id, r])), [repuestos]);
  const seleccionado = repuestosPorId.get(repuestoIdField.value ?? "") ?? null;

  const repuestoOptions: ComboboxOption[] = useMemo(
    () => repuestos.map((r) => ({ value: r.id, label: `${r.codigo} — ${r.nombre}` })),
    [repuestos],
  );

  // Selecting a repuesto prefills "costo unitario" with its own last recorded
  // purchase cost -- the common case is receiving at the same price as last
  // time, so this saves re-typing it on every ítem.
  function seleccionarRepuesto(id: string) {
    repuestoIdField.onChange(id);
    const repuesto = repuestosPorId.get(id);
    if (repuesto) {
      setValue("precioCompraUnitario", String(repuesto.precioCompra), { shouldValidate: true });
    }
  }

  const cantidadNum = Number(cantidadValue) || 0;
  const costoNum = Number(costoValue) || 0;
  const subtotal = cantidadNum * costoNum;
  const stockActual = seleccionado?.stockActual ?? 0;
  const stockResultante = stockActual + cantidadNum;
  const ultimoCosto = seleccionado?.precioCompra ?? 0;
  const deltaPct = ultimoCosto > 0 ? ((costoNum - ultimoCosto) / ultimoCosto) * 100 : 0;
  // Real weighted-average cost after this receipt -- distinct from simply
  // echoing the entered unit cost.
  const costoMedioNuevo = stockResultante > 0 ? (stockActual * ultimoCosto + cantidadNum * costoNum) / stockResultante : 0;
  const cantidadBaja = cantidadNum > 0 && cantidadNum <= 2;

  useEffect(() => {
    if (state.success) {
      reset();
    }
  }, [state, reset]);

  return (
    <form
      noValidate
      ref={formRef}
      onSubmit={handleSubmit((data) =>
        startTransition(() => {
          const formData = new FormData(formRef.current!);
          // repuestoId is a Combobox (react-hook-form-controlled, not a
          // native <select name="..."> register()) -- it doesn't populate
          // FormData on its own, so it must be set explicitly here before
          // submitting.
          formData.set("repuestoId", data.repuestoId ?? "");
          formAction(formData);
        }),
      )}
      className="flex flex-col gap-2"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
          <Label htmlFor="repuestoId">Repuesto</Label>
          <Combobox
            id="repuestoId"
            items={repuestoOptions}
            value={repuestoIdField.value ?? ""}
            onValueChange={seleccionarRepuesto}
            placeholder="Buscar por código o nombre"
            emptyMessage="Ningún repuesto coincide"
            aria-invalid={errors.repuestoId ? true : undefined}
            aria-describedby={errors.repuestoId ? "repuestoId-error" : undefined}
            filter={(item, q) => normalizeForSearch(item.label).includes(normalizeForSearch(q))}
            renderOption={(item) => {
              const repuesto = repuestosPorId.get(item.value);
              if (!repuesto) return item.label;
              const stockBajo = repuesto.stockActual <= repuesto.stockMinimo;
              return (
                <span className="flex w-full min-w-0 items-center justify-between gap-3">
                  <span className="min-w-0 truncate" title={repuesto.nombre}>
                    {repuesto.nombre}{" "}
                    <span className="font-mono text-xs text-muted-foreground">{repuesto.codigo}</span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 font-mono text-xs",
                      stockBajo ? "font-semibold text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {repuesto.stockActual} u
                  </span>
                </span>
              );
            }}
          />
          {errors.repuestoId ? (
            <p id="repuestoId-error" className="text-xs text-destructive">
              {errors.repuestoId.message}
            </p>
          ) : null}
        </div>

        <div className="flex w-[120px] shrink-0 flex-col gap-1.5">
          <Label htmlFor="cantidad">Cantidad</Label>
          <div className="flex h-8 items-center overflow-hidden rounded-lg border border-input bg-background">
            <button
              type="button"
              aria-label="Disminuir cantidad"
              onClick={() => setValue("cantidad", String(Math.max(0, cantidadNum - 1)), { shouldValidate: true })}
              className="flex h-full w-7 shrink-0 items-center justify-center border-r border-input text-muted-foreground hover:bg-muted"
            >
              −
            </button>
            <Input
              id="cantidad"
              type="number"
              min="1"
              className="h-full border-0 px-1 text-center font-mono shadow-none focus-visible:ring-0"
              aria-invalid={errors.cantidad ? true : undefined}
              aria-describedby={errors.cantidad ? "cantidad-error" : undefined}
              {...register("cantidad")}
            />
            <button
              type="button"
              aria-label="Aumentar cantidad"
              onClick={() => setValue("cantidad", String(cantidadNum + 1), { shouldValidate: true })}
              className="flex h-full w-7 shrink-0 items-center justify-center border-l border-input text-muted-foreground hover:bg-muted"
            >
              +
            </button>
          </div>
          {errors.cantidad ? (
            <p id="cantidad-error" className="text-xs text-destructive">
              {errors.cantidad.message}
            </p>
          ) : null}
        </div>

        <div className="flex w-[150px] shrink-0 flex-col gap-1.5">
          <Label htmlFor="precioCompraUnitario">Costo unitario</Label>
          <div className="relative flex items-center">
            <span className="pointer-events-none absolute left-2.5 text-sm text-muted-foreground">$</span>
            <Input
              id="precioCompraUnitario"
              type="number"
              min="0"
              step="0.01"
              className="h-8 pl-5 font-mono"
              aria-invalid={errors.precioCompraUnitario ? true : undefined}
              aria-describedby={errors.precioCompraUnitario ? "precioCompraUnitario-error" : undefined}
              {...register("precioCompraUnitario")}
            />
          </div>
          {errors.precioCompraUnitario ? (
            <p id="precioCompraUnitario-error" className="text-xs text-destructive">
              {errors.precioCompraUnitario.message}
            </p>
          ) : null}
        </div>

        <Button type="submit" disabled={isPending}>
          <Plus />
          {isPending ? "Guardando..." : "Agregar"}
        </Button>
      </div>

      {seleccionado ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground">
          <span>
            Subtotal <span className="font-mono font-semibold text-foreground">{formatoMoneda.format(subtotal)}</span>
          </span>
          <span>
            Stock{" "}
            <span className="font-mono font-semibold text-[oklch(0.4_0.1_150)]">
              {stockActual} → {stockResultante}
            </span>
          </span>
          <span>
            Último costo <span className="font-mono text-foreground/80">{formatoMoneda.format(ultimoCosto)}</span>
          </span>
          <span>
            Variación{" "}
            <span
              className={cn(
                "font-mono font-semibold",
                Math.abs(deltaPct) < 0.05
                  ? "text-foreground"
                  : deltaPct > 0
                    ? "text-[oklch(0.5_0.2_27)]"
                    : "text-[oklch(0.4_0.1_150)]",
              )}
            >
              {`${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%`}
            </span>
          </span>
          <span>
            Costo medio nuevo{" "}
            <span className="font-mono font-semibold text-foreground">{formatoMoneda.format(costoMedioNuevo)}</span>
          </span>
          {cantidadBaja ? (
            <span className={cn("font-medium", KPI_TONE.warning.icon)}>
              Cantidad muy baja: verifica la factura del proveedor
            </span>
          ) : null}
        </div>
      ) : null}

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? <p role="status">Ítem registrado, stock actualizado</p> : null}
    </form>
  );
}
