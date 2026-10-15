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
import { DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SelectorFechaHora } from "@/components/selector-fecha-hora";
import { momentoBogota, type OcupacionCita } from "@/lib/agenda-cita";

const initialState: CitaFormState = { error: null, success: false };

type CitaFormInput = z.input<typeof citaInputSchema>;
type CitaFormOutput = z.output<typeof citaInputSchema>;

export function NuevaCitaForm({
  vehiculos,
  ocupacion,
  onCreated,
}: {
  vehiculos: VehiculoOption[];
  /** Citas ya agendadas de la sede, para mostrar qué días y horas están ocupados. */
  ocupacion: OcupacionCita[];
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
  const { field: fechaHoraField } = useController({ name: "fechaHora", control });
  // El formulario solo se monta al abrir la ventana (nunca en el servidor), así
  // que "ahora" es el momento en que se abre, no el de cargar la página.
  const [ahora] = useState(() => momentoBogota(new Date()));

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
    <form noValidate ref={formRef} onSubmit={(evento) => handleSubmit(onValid)(evento)} className="flex min-w-0 flex-col gap-4">
      <FormGroup label="Quién">
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
          {errors.vehiculoId ? <p id="vehiculoId-error" className="text-xs text-destructive">{errors.vehiculoId.message}</p> : null}
        </div>
      </FormGroup>

      <FormGroup label="Cuándo">
        <div className="flex flex-col gap-1.5">
          <SelectorFechaHora
            id="fechaHora"
            name="fechaHora"
            value={fechaHoraField.value}
            onChange={fechaHoraField.onChange}
            ahora={ahora}
            ocupacion={ocupacion}
            invalid={errors.fechaHora ? true : undefined}
            describedBy={errors.fechaHora ? "fechaHora-error" : undefined}
          />
          {errors.fechaHora ? <p id="fechaHora-error" className="text-xs text-destructive">Elige el día y la hora de la cita.</p> : null}
        </div>
      </FormGroup>

      <FormGroup label="Detalles">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="motivo">Motivo</Label>
            <Input
              id="motivo"
              required
              aria-invalid={errors.motivo ? true : undefined}
              aria-describedby={errors.motivo ? "motivo-error" : undefined}
              {...register("motivo")}
            />
            {errors.motivo ? <p id="motivo-error" className="text-xs text-destructive">{errors.motivo.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notas">Notas</Label>
            <Textarea
              id="notas"
              aria-invalid={errors.notas ? true : undefined}
              aria-describedby={errors.notas ? "notas-error" : undefined}
              {...register("notas")}
            />
            {errors.notas ? <p id="notas-error" className="text-xs text-destructive">{errors.notas.message}</p> : null}
          </div>
        </div>
      </FormGroup>

      <div className="flex justify-end gap-2">
        <DialogClose render={<Button type="button" variant="outline" />}>
          Cancelar
        </DialogClose>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Agendar cita"}
        </Button>
      </div>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? <p role="status">Cita agendada</p> : null}
    </form>
  );
}
