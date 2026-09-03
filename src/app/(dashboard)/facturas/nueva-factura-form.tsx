"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useController, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { crearFacturaAction, type FacturaFormState, type OrdenFacturableOption } from "@/app/actions/factura-actions";
import { normalizeForSearch } from "@/lib/search";
import { facturarOrdenInputSchema } from "@/lib/validation/factura";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { DialogClose } from "@/components/ui/dialog";
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
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<NuevaFacturaFormInput>({
    resolver: zodResolver(nuevaFacturaFormSchema),
    defaultValues: { ordenId: "", descuento: 0 },
  });
  const { field: ordenIdField } = useController({ name: "ordenId", control });

  // ordenId no se lee de FormData (crearFacturaAction lo recibe como argumento
  // aparte, no del form) -- el Combobox solo necesita quedar sincronizado con
  // react-hook-form vía useController, no con name/FormData.
  const ordenesPorId = useMemo(() => new Map(ordenes.map((orden) => [orden.id, orden])), [ordenes]);
  const ordenOptions: ComboboxOption[] = useMemo(
    () =>
      ordenes.map((orden) => ({
        value: orden.id,
        label: `${orden.placa} — ${orden.clienteNombre} · ${formatoMoneda.format(orden.total)}`,
      })),
    [ordenes],
  );

  if (ordenes.length === 0) {
    return <p>No hay órdenes terminadas o entregadas pendientes de facturar.</p>;
  }

  function onValid(data: { ordenId: string }) {
    startTransition(async () => {
      const formData = new FormData(formRef.current!);
      const result = await crearFacturaAction(data.ordenId, initialState, formData);
      if (result.success && result.facturaId) {
        toast.success("Factura generada");
        router.push(`/facturas/${result.facturaId}`);
      } else {
        toast.error(result.error ?? "No se pudo generar la factura");
        setState(result);
      }
    });
  }

  return (
    <form noValidate ref={formRef} onSubmit={handleSubmit(onValid)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ordenId">Orden</Label>
        <Combobox
          id="ordenId"
          required
          items={ordenOptions}
          value={ordenIdField.value}
          onValueChange={ordenIdField.onChange}
          placeholder="Cliente, cédula o placa…"
          emptyMessage="Ninguna orden coincide con la búsqueda"
          aria-invalid={errors.ordenId ? true : undefined}
          aria-describedby={errors.ordenId ? "ordenId-error" : undefined}
          filter={(item, query) => {
            const orden = ordenesPorId.get(item.value);
            if (!orden) return false;
            const q = normalizeForSearch(query.trim());
            if (!q) return true;
            return (
              normalizeForSearch(orden.placa).includes(q) ||
              normalizeForSearch(orden.clienteNombre).includes(q) ||
              (orden.clienteDocumento ? normalizeForSearch(orden.clienteDocumento).includes(q) : false)
            );
          }}
        />
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

      <div className="flex justify-end gap-2">
        <DialogClose render={<Button type="button" variant="outline" />}>
          Cancelar
        </DialogClose>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Generando..." : "Generar factura"}
        </Button>
      </div>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}
