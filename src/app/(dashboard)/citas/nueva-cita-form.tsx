"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useController, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { createCitaAction, type CitaFormState, type VehiculoOption } from "@/app/actions/cita-actions";
import { citaInputSchema } from "@/lib/validation/cita";
import { FormGroup } from "@/components/form-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: CitaFormState = { error: null, success: false };

type CitaFormInput = z.input<typeof citaInputSchema>;
type CitaFormOutput = z.output<typeof citaInputSchema>;

export function NuevaCitaForm({
  vehiculos,
  onCreated,
}: {
  vehiculos: VehiculoOption[];
  /**
   * Fired synchronously right after a successful create -- not driven by
   * useActionState + useEffect: createCitaAction's revalidatePath("/citas")
   * can refresh (and unmount, inside a dialog) this form's parent before a
   * state-driven effect gets a chance to run, same race
   * vehiculos/[id]/nueva-orden-form.tsx's onCreated documents. useTransition +
   * a manual submit calls onCreated from inside the same transition as the
   * action call, ahead of any RSC update.
   */
  onCreated?: () => void;
}) {
  const [state, setState] = useState<CitaFormState>(initialState);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CitaFormInput, unknown, CitaFormOutput>({
    resolver: zodResolver(citaInputSchema),
    defaultValues: { vehiculoId: "", fechaHora: "", motivo: "", notas: "" },
  });
  const { field: vehiculoIdField } = useController({ name: "vehiculoId", control });

  const vehiculoOptions: ComboboxOption[] = useMemo(
    () =>
      vehiculos.map((vehiculo) => ({
        value: vehiculo.id,
        label: `${vehiculo.placa} — ${vehiculo.marca} ${vehiculo.modelo} (${vehiculo.clienteNombre})`,
      })),
    [vehiculos],
  );

  if (vehiculos.length === 0) {
    return <p>Registra un cliente y su vehículo antes de agendar una cita.</p>;
  }

  function onValid(data: { vehiculoId: string }) {
    startTransition(async () => {
      const formData = new FormData(formRef.current!);
      // vehiculoId is a Combobox (react-hook-form-controlled, not a native
      // <select name="..."> register()) -- it doesn't populate FormData on
      // its own, so it must be set explicitly here before submitting.
      formData.set("vehiculoId", data.vehiculoId);
      const result = await createCitaAction(initialState, formData);
      if (result.success) {
        toast.success("Cita agendada");
        if (onCreated) onCreated();
        else setState(result);
      } else {
        toast.error(result.error ?? "No se pudo agendar la cita");
        setState(result);
      }
    });
  }

  return (
    <form noValidate ref={formRef} onSubmit={handleSubmit(onValid)} className="flex flex-col gap-4">
      <FormGroup label="Cuándo y quién">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vehiculoId">Vehículo</Label>
            <Combobox
              id="vehiculoId"
              required
              items={vehiculoOptions}
              value={vehiculoIdField.value}
              onValueChange={vehiculoIdField.onChange}
              placeholder="Buscar vehículo..."
              emptyMessage="Ningún vehículo coincide"
              aria-invalid={errors.vehiculoId ? true : undefined}
              aria-describedby={errors.vehiculoId ? "vehiculoId-error" : undefined}
            />
            {errors.vehiculoId ? <p id="vehiculoId-error">{errors.vehiculoId.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fechaHora">Fecha y hora</Label>
            <Input
              id="fechaHora"
              type="datetime-local"
              required
              className="font-mono"
              aria-invalid={errors.fechaHora ? true : undefined}
              aria-describedby={errors.fechaHora ? "fechaHora-error" : undefined}
              {...register("fechaHora")}
            />
            <span className="text-[10px] text-muted-foreground">Zona horaria de la sede: America/Bogotá</span>
            {errors.fechaHora ? <p id="fechaHora-error">{errors.fechaHora.message}</p> : null}
          </div>
        </div>
      </FormGroup>

      <FormGroup label="Detalles">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="motivo">Motivo</Label>
            <Input
              id="motivo"
              required
              aria-invalid={errors.motivo ? true : undefined}
              aria-describedby={errors.motivo ? "motivo-error" : undefined}
              {...register("motivo")}
            />
            {errors.motivo ? <p id="motivo-error">{errors.motivo.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notas">Notas</Label>
            <Textarea
              id="notas"
              aria-invalid={errors.notas ? true : undefined}
              aria-describedby={errors.notas ? "notas-error" : undefined}
              {...register("notas")}
            />
            {errors.notas ? <p id="notas-error">{errors.notas.message}</p> : null}
          </div>
        </div>
      </FormGroup>

      <Button type="submit" disabled={isPending} className="self-end">
        {isPending ? "Guardando..." : "Agendar cita"}
      </Button>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? <p role="status">Cita agendada</p> : null}
    </form>
  );
}
