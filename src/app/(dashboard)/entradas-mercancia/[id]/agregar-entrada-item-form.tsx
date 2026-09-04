"use client";

import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
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
  const [query, setQuery] = useState("");
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

  const catalogoFiltrado = useMemo(() => {
    const q = normalizeForSearch(query.trim());
    if (!q) return repuestos;
    return repuestos.filter((r) => normalizeForSearch(`${r.codigo} ${r.nombre}`).includes(q));
  }, [repuestos, query]);

  // Selecting a catalog row prefills "costo unitario" with the repuesto's own
  // last recorded purchase cost -- the common case is receiving at the same
  // price as last time, so this saves re-typing it on every ítem.
  function seleccionarRepuesto(repuesto: RepuestoOption) {
    repuestoIdField.onChange(repuesto.id);
    setValue("precioCompraUnitario", String(repuesto.precioCompra), { shouldValidate: true });
  }

  const cantidadNum = Number(cantidadValue) || 0;
  const costoNum = Number(costoValue) || 0;
  const subtotal = cantidadNum * costoNum;
  const stockActual = seleccionado?.stockActual ?? 0;
  const stockResultante = stockActual + cantidadNum;
  const ultimoCosto = seleccionado?.precioCompra ?? 0;
  const deltaPct = ultimoCosto > 0 ? ((costoNum - ultimoCosto) / ultimoCosto) * 100 : 0;
  // Real weighted-average cost after this receipt -- (stock actual a su costo
  // actual) + (lo nuevo a su costo nuevo), repartido entre el stock total
  // resultante. Distinto de simplemente mostrar el costo unitario ingresado.
  const costoMedioNuevo = stockResultante > 0 ? (stockActual * ultimoCosto + cantidadNum * costoNum) / stockResultante : 0;
  const cantidadBaja = cantidadNum > 0 && cantidadNum <= 2;

  useEffect(() => {
    if (state.success) {
      reset();
      setQuery("");
    }
  }, [state, reset]);

  return (
    <form
      noValidate
      ref={formRef}
      onSubmit={handleSubmit((data) =>
        startTransition(() => {
          const formData = new FormData(formRef.current!);
          // repuestoId is controlled via useController (not a native
          // <select name="..."> register()) -- it doesn't populate FormData
          // on its own, so it must be set explicitly here before submitting.
          formData.set("repuestoId", data.repuestoId ?? "");
          formAction(formData);
        }),
      )}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-stretch gap-3.5">
        <div className="flex min-w-[260px] flex-1 flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="repuesto-buscar">Repuesto</Label>
            <span className="text-[10.5px] text-muted-foreground">Catálogo de la bodega</span>
          </div>
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
            <Input
              id="repuesto-buscar"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por código o nombre"
              className="pl-8"
            />
          </div>
          <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto rounded-lg border border-border bg-muted/40 p-2">
            {catalogoFiltrado.length === 0 ? (
              <p className="p-2 text-xs text-muted-foreground">Ningún repuesto coincide</p>
            ) : (
              catalogoFiltrado.map((repuesto) => {
                const activo = repuesto.id === repuestoIdField.value;
                const stockBajo = repuesto.stockActual <= repuesto.stockMinimo;
                return (
                  <button
                    key={repuesto.id}
                    type="button"
                    onClick={() => seleccionarRepuesto(repuesto)}
                    className={cn(
                      "flex flex-col gap-0.5 rounded-md border px-2.5 py-1.5 text-left transition-colors",
                      activo ? "border-primary/50 bg-primary/5" : "border-border bg-card hover:bg-accent",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{repuesto.nombre}</span>
                      <span
                        className={cn(
                          "shrink-0 font-mono text-xs",
                          stockBajo ? "font-semibold text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {repuesto.stockActual} u
                      </span>
                    </span>
                    <span className="flex items-center justify-between gap-2 font-mono text-[11px] text-muted-foreground">
                      <span>{repuesto.codigo}</span>
                      <span>{formatoMoneda.format(repuesto.precioCompra)}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
          {errors.repuestoId ? (
            <p id="repuestoId-error" className="text-xs text-destructive">
              {errors.repuestoId.message}
            </p>
          ) : null}
        </div>

        <div className="flex min-w-[240px] flex-1 flex-col gap-3 rounded-lg border border-border bg-muted/40 p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {seleccionado ? seleccionado.nombre : "Ningún repuesto seleccionado"}
              </p>
              {seleccionado ? <p className="mt-0.5 font-mono text-xs text-muted-foreground">{seleccionado.codigo}</p> : null}
            </div>
            {seleccionado ? (
              <div className="shrink-0 text-right">
                <p className="text-[10px] tracking-wide text-muted-foreground uppercase">En bodega</p>
                <p className="mt-0.5 font-mono text-sm font-semibold">{stockActual} u</p>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cantidad">Cantidad</Label>
              <div className="flex items-center overflow-hidden rounded-lg border border-input bg-background">
                <button
                  type="button"
                  aria-label="Disminuir cantidad"
                  onClick={() => setValue("cantidad", String(Math.max(0, cantidadNum - 1)), { shouldValidate: true })}
                  className="flex h-8 w-8 shrink-0 items-center justify-center border-r border-input text-muted-foreground hover:bg-muted"
                >
                  −
                </button>
                <Input
                  id="cantidad"
                  type="number"
                  min="1"
                  className="border-0 text-center font-mono shadow-none focus-visible:ring-0"
                  aria-invalid={errors.cantidad ? true : undefined}
                  aria-describedby={errors.cantidad ? "cantidad-error" : undefined}
                  {...register("cantidad")}
                />
                <button
                  type="button"
                  aria-label="Aumentar cantidad"
                  onClick={() => setValue("cantidad", String(cantidadNum + 1), { shouldValidate: true })}
                  className="flex h-8 w-8 shrink-0 items-center justify-center border-l border-input text-muted-foreground hover:bg-muted"
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

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="precioCompraUnitario">Precio de compra unitario</Label>
              <Input
                id="precioCompraUnitario"
                type="number"
                min="0"
                step="0.01"
                className="font-mono"
                aria-invalid={errors.precioCompraUnitario ? true : undefined}
                aria-describedby={errors.precioCompraUnitario ? "precioCompraUnitario-error" : undefined}
                {...register("precioCompraUnitario")}
              />
              {seleccionado ? (
                <span className="text-[10.5px] text-muted-foreground">Último: {formatoMoneda.format(ultimoCosto)}</span>
              ) : null}
              {errors.precioCompraUnitario ? (
                <p id="precioCompraUnitario-error" className="text-xs text-destructive">
                  {errors.precioCompraUnitario.message}
                </p>
              ) : null}
            </div>
          </div>

          {cantidadBaja ? (
            <Alert className={cn("py-2", KPI_TONE.warning.cardBg)}>
              <AlertDescription className={cn("text-xs", KPI_TONE.warning.icon)}>
                Cantidad muy baja para una entrada. Verifica la factura del proveedor.
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        <div className="flex min-w-[210px] flex-1 flex-col gap-3 rounded-lg border border-border bg-muted/40 p-3.5">
          <div className="flex items-center gap-2">
            <span className="size-1.5 shrink-0 rounded-full bg-primary" />
            <span className="text-[10px] font-semibold tracking-wider text-primary uppercase">Efecto al guardar</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <div>
            <p className="text-[10px] tracking-wide text-muted-foreground uppercase">Subtotal</p>
            <p className="mt-0.5 font-mono text-xl font-semibold">{formatoMoneda.format(subtotal)}</p>
          </div>
          <div className="flex flex-col gap-2 border-t border-border pt-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-muted-foreground">Stock resultante</span>
              <span className="font-mono text-xs font-semibold text-[oklch(0.4_0.1_150)]">
                {stockActual} → {stockResultante}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-muted-foreground">Variación de costo</span>
              <span
                className={cn(
                  "font-mono text-xs font-semibold",
                  !seleccionado || Math.abs(deltaPct) < 0.05
                    ? "text-foreground"
                    : deltaPct > 0
                      ? "text-[oklch(0.5_0.2_27)]"
                      : "text-[oklch(0.4_0.1_150)]",
                )}
              >
                {seleccionado ? `${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%` : "—"}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-muted-foreground">Costo medio nuevo</span>
              <span className="font-mono text-xs font-semibold">{formatoMoneda.format(costoMedioNuevo)}</span>
            </div>
          </div>
          <Button type="submit" disabled={isPending} className="mt-auto">
            {isPending ? "Registrando..." : "Registrar ítem"}
          </Button>
        </div>
      </div>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? <p role="status">Ítem registrado, stock actualizado</p> : null}
    </form>
  );
}
