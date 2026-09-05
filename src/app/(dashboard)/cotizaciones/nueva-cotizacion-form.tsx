"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useController, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import {
  crearCotizacionAction,
  type CotizacionFormState,
  type VehiculoOption,
} from "@/app/actions/cotizacion-actions";
import { normalizeForSearch } from "@/lib/search";
import { crearCotizacionInputSchema } from "@/lib/validation/cotizacion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: CotizacionFormState = { error: null, success: false, cotizacionId: null };

// An untouched date input submits "" -- .optional() alone does not treat
// that as absent, same note as ordenes/[id]/generar-factura-form.tsx.
const nuevaCotizacionFormSchema = crearCotizacionInputSchema.extend({
  validaHasta: z.preprocess(
    (v) => (v === "" ? undefined : v),
    crearCotizacionInputSchema.shape.validaHasta,
  ),
});
type NuevaCotizacionFormInput = z.input<typeof nuevaCotizacionFormSchema>;

export function NuevaCotizacionForm({ vehiculos }: { vehiculos: VehiculoOption[] }) {
  const router = useRouter();
  const [state, setState] = useState<CotizacionFormState>(initialState);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<NuevaCotizacionFormInput>({
    resolver: zodResolver(nuevaCotizacionFormSchema),
    defaultValues: { vehiculoId: "", motivo: "" },
  });
  const { field: vehiculoIdField } = useController({ name: "vehiculoId", control });

  const vehiculosPorId = useMemo(() => new Map(vehiculos.map((vehiculo) => [vehiculo.id, vehiculo])), [vehiculos]);
  const vehiculoOptions: ComboboxOption[] = useMemo(
    () =>
      vehiculos.map((vehiculo) => ({
        value: vehiculo.id,
        label: `${vehiculo.placa} — ${vehiculo.clienteNombre} · ${vehiculo.marca} ${vehiculo.modelo}`,
      })),
    [vehiculos],
  );

  if (vehiculos.length === 0) {
    return <p>No hay vehículos registrados. Registra un vehículo antes de cotizar.</p>;
  }

  function onValid(data: NuevaCotizacionFormInput) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("vehiculoId", data.vehiculoId);
      formData.set("motivo", data.motivo);
      if (data.validaHasta) {
        formData.set("validaHasta", String(data.validaHasta));
      }
      const result = await crearCotizacionAction(initialState, formData);
      if (result.success && result.cotizacionId) {
        toast.success("Cotización creada");
        router.push(`/cotizaciones/${result.cotizacionId}`);
      } else {
        toast.error(result.error ?? "No se pudo crear la cotización");
        setState(result);
      }
    });
  }

  return (
    <form noValidate onSubmit={handleSubmit(onValid)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="vehiculoId">Vehículo</Label>
        <Combobox
          id="vehiculoId"
          required
          items={vehiculoOptions}
          value={vehiculoIdField.value}
          onValueChange={vehiculoIdField.onChange}
          placeholder="Placa, cliente o modelo…"
          emptyMessage="Ningún vehículo coincide con la búsqueda"
          aria-invalid={errors.vehiculoId ? true : undefined}
          aria-describedby={errors.vehiculoId ? "vehiculoId-error" : undefined}
          filter={(item, query) => {
            const vehiculo = vehiculosPorId.get(item.value);
            if (!vehiculo) return false;
            const q = normalizeForSearch(query.trim());
            if (!q) return true;
            return (
              normalizeForSearch(vehiculo.placa).includes(q) ||
              normalizeForSearch(vehiculo.clienteNombre).includes(q) ||
              normalizeForSearch(`${vehiculo.marca} ${vehiculo.modelo}`).includes(q)
            );
          }}
        />
        {errors.vehiculoId ? <p id="vehiculoId-error">{errors.vehiculoId.message}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="motivo">Motivo</Label>
        <Textarea
          id="motivo"
          rows={3}
          placeholder="Ej: Revisión de frenos y cambio de pastillas"
          aria-invalid={errors.motivo ? true : undefined}
          aria-describedby={errors.motivo ? "motivo-error" : undefined}
          {...register("motivo")}
        />
        {errors.motivo ? <p id="motivo-error">{errors.motivo.message}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="validaHasta">Válida hasta (opcional)</Label>
        <Input
          id="validaHasta"
          type="date"
          aria-invalid={errors.validaHasta ? true : undefined}
          aria-describedby={errors.validaHasta ? "validaHasta-error" : undefined}
          {...register("validaHasta")}
        />
        {errors.validaHasta ? <p id="validaHasta-error">{String(errors.validaHasta.message)}</p> : null}
      </div>

      <div className="flex justify-end gap-2">
        <DialogClose render={<Button type="button" variant="outline" />}>
          Cancelar
        </DialogClose>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creando..." : "Crear cotización"}
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
