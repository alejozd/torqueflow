"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { crearFacturaAction, type FacturaFormState, type OrdenFacturableOption } from "@/app/actions/factura-actions";
import { facturarOrdenInputSchema } from "@/lib/validation/factura";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: FacturaFormState = { error: null, success: false, facturaId: null };

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

// crearFacturaAction reads formData.get("descuento") || undefined before
// parsing -- an untouched number input submits "", which .optional() alone
// does not treat as absent (same note as ordenes/[id]/generar-factura-form.tsx).
const nuevaFacturaFormSchema = facturarOrdenInputSchema.extend({
  ordenId: z.string().min(1, "Selecciona una orden"),
  descuento: z.preprocess((v) => (v === "" ? undefined : v), facturarOrdenInputSchema.shape.descuento),
});
type NuevaFacturaFormInput = z.input<typeof nuevaFacturaFormSchema>;

export function NuevaFacturaForm({ ordenes }: { ordenes: OrdenFacturableOption[] }) {
  const router = useRouter();
  const [state, setState] = useState<FacturaFormState>(initialState);
  const [isPending, startTransition] = useTransition();
  const [busqueda, setBusqueda] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<NuevaFacturaFormInput>({
    resolver: zodResolver(nuevaFacturaFormSchema),
    defaultValues: { ordenId: "", descuento: 0 },
  });

  const filtro = busqueda.trim().toLowerCase();
  const ordenesFiltradas = useMemo(() => {
    if (!filtro) return ordenes;
    return ordenes.filter(
      (orden) =>
        orden.placa.toLowerCase().includes(filtro) ||
        orden.clienteNombre.toLowerCase().includes(filtro) ||
        (orden.clienteDocumento?.toLowerCase().includes(filtro) ?? false),
    );
  }, [ordenes, filtro]);

  if (ordenes.length === 0) {
    return <p>No hay órdenes terminadas o entregadas pendientes de facturar.</p>;
  }

  function onValid(data: { ordenId: string }) {
    startTransition(async () => {
      const formData = new FormData(formRef.current!);
      const result = await crearFacturaAction(data.ordenId, initialState, formData);
      if (result.success && result.facturaId) {
        router.push(`/facturas/${result.facturaId}`);
      } else {
        setState(result);
      }
    });
  }

  return (
    <form noValidate ref={formRef} onSubmit={handleSubmit(onValid)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="busquedaOrden">Buscar por cliente, cédula o placa</Label>
        <Input
          id="busquedaOrden"
          type="search"
          value={busqueda}
          onChange={(event) => setBusqueda(event.target.value)}
          placeholder="María Gómez, 43128905, WGT-451…"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ordenId">Orden</Label>
        {/*
          Native <select>, not shadcn's Select (Base UI, no DOM <option>s
          while closed) -- userEvent.selectOptions()/getByRole("option")
          in the existing tests need real <select>/<option> elements.
          Styled by hand to match the shadcn select trigger look.
        */}
        <select
          id="ordenId"
          required
          aria-invalid={errors.ordenId ? true : undefined}
          aria-describedby={errors.ordenId ? "ordenId-error" : undefined}
          className="flex h-8 w-full items-center justify-between rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
          {...register("ordenId")}
        >
          <option value="" disabled>
            {ordenesFiltradas.length > 0 ? "Selecciona una orden" : "Ninguna orden coincide con la búsqueda"}
          </option>
          {ordenesFiltradas.map((orden) => (
            <option key={orden.id} value={orden.id}>
              {`${orden.placa} — ${orden.clienteNombre} · ${formatoMoneda.format(orden.total)}`}
            </option>
          ))}
        </select>
        {errors.ordenId ? <p id="ordenId-error">{errors.ordenId.message}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="descuento">Descuento (opcional)</Label>
        <Input
          id="descuento"
          type="number"
          min="0"
          step="0.01"
          className="font-mono"
          aria-invalid={errors.descuento ? true : undefined}
          aria-describedby={errors.descuento ? "descuento-error" : undefined}
          {...register("descuento")}
        />
        {errors.descuento ? <p id="descuento-error">{errors.descuento.message}</p> : null}
      </div>

      <Button type="submit" disabled={isPending} className="self-end">
        {isPending ? "Generando..." : "Generar factura"}
      </Button>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}
