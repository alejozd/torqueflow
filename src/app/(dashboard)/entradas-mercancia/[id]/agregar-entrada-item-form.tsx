"use client";

import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
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
  const [pickerOpen, setPickerOpen] = useState(false);
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
  // last recorded purchase cost and closes the picker -- the common case is
  // receiving at the same price as last time, and there's nothing left to
  // browse for once a repuesto is chosen.
  function seleccionarRepuesto(repuesto: RepuestoOption) {
    repuestoIdField.onChange(repuesto.id);
    setValue("precioCompraUnitario", String(repuesto.precioCompra), { shouldValidate: true });
    setPickerOpen(false);
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
      setQuery("");
      setPickerOpen(false);
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
      className="flex flex-col gap-2"
    >
      <div className="flex flex-wrap items-end gap-2.5 rounded-lg bg-muted/50 p-2.5">
        <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
          <Label htmlFor="repuesto-toggle">Repuesto</Label>
          <button
            type="button"
            id="repuesto-toggle"
            onClick={() => setPickerOpen((open) => !open)}
            className={cn(
              "flex h-8 items-center gap-2 rounded-lg border px-2.5 text-left transition-colors",
              pickerOpen ? "border-primary/45 bg-primary/5" : "border-input bg-background hover:bg-accent",
            )}
          >
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {seleccionado ? seleccionado.nombre : "Selecciona un repuesto"}
            </span>
            {seleccionado ? <span className="shrink-0 font-mono text-xs text-primary">{seleccionado.codigo}</span> : null}
            <ChevronDown
              className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", pickerOpen && "rotate-180")}
            />
          </button>
          {errors.repuestoId ? (
            <p id="repuestoId-error" className="text-xs text-destructive">
              {errors.repuestoId.message}
            </p>
          ) : null}
        </div>

        <div className="flex w-28 shrink-0 flex-col gap-1.5">
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

        <div className="flex w-32 shrink-0 flex-col gap-1.5">
          <Label htmlFor="precioCompraUnitario">Costo unit.</Label>
          <Input
            id="precioCompraUnitario"
            type="number"
            min="0"
            step="0.01"
            className="h-8 font-mono"
            aria-invalid={errors.precioCompraUnitario ? true : undefined}
            aria-describedby={errors.precioCompraUnitario ? "precioCompraUnitario-error" : undefined}
            {...register("precioCompraUnitario")}
          />
          {errors.precioCompraUnitario ? (
            <p id="precioCompraUnitario-error" className="text-xs text-destructive">
              {errors.precioCompraUnitario.message}
            </p>
          ) : null}
        </div>

        <div className="flex w-28 shrink-0 flex-col gap-1.5">
          <Label className="text-muted-foreground">Subtotal</Label>
          <div className="flex h-8 items-center font-mono text-sm font-semibold">{formatoMoneda.format(subtotal)}</div>
        </div>

        <Button type="submit" disabled={isPending} size="sm" className="h-8">
          {isPending ? "Guardando..." : "Agregar"}
        </Button>
      </div>

      {seleccionado ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground">
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

      {pickerOpen ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-2.5">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
            {/* eslint-disable-next-line jsx-a11y/no-autofocus -- opening this
                picker is itself the user's request to search; autofocus
                saves the extra click that a static, always-visible search
                box (the previous design) didn't need. */}
            <Input
              aria-label="Buscar repuesto"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por código o nombre"
              className="h-8 pl-8"
              autoFocus
            />
          </div>
          <div className="grid max-h-48 grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-1.5 overflow-y-auto">
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
