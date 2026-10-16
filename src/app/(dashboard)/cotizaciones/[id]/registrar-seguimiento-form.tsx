"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { Controller, useController, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import {
  registrarSeguimientoAction,
  type SeguimientoCotizacionFormState,
} from "@/app/actions/cotizacion-seguimiento-actions";
import { valorFechaHoraDeDate } from "@/lib/agenda-cita";
import { formatoDiaBogota } from "@/lib/fecha-bogota";
import { registrarSeguimientoInputSchema } from "@/lib/validation/cotizacion-seguimiento";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CampoFecha } from "@/components/campo-fecha";
import { CampoFechaHora } from "@/components/campo-fecha-hora";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";

const initialState: SeguimientoCotizacionFormState = { error: null, success: false };

const TIPO_OPTIONS = [
  { value: "LLAMADA", label: "Llamada" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Correo electrónico" },
  { value: "VISITA", label: "Visita" },
  { value: "NOTA", label: "Nota" },
];

function valoresIniciales() {
  return { tipo: "LLAMADA" as const, fecha: valorFechaHoraDeDate(new Date()), resultado: "", proximoSeguimiento: "" };
}

// An empty CampoFecha submits "" -- .optional() alone does not treat that
// as absent, same note as nueva-cotizacion-form.tsx's validaHasta.
const registrarSeguimientoFormSchema = registrarSeguimientoInputSchema.extend({
  proximoSeguimiento: z.preprocess(
    (v) => (v === "" ? undefined : v),
    registrarSeguimientoInputSchema.shape.proximoSeguimiento,
  ),
});
type RegistrarSeguimientoFormInput = z.input<typeof registrarSeguimientoFormSchema>;
type RegistrarSeguimientoFormOutput = z.output<typeof registrarSeguimientoFormSchema>;

export function RegistrarSeguimientoForm({
  cotizacionId,
  onSuccess,
}: {
  cotizacionId: string;
  onSuccess?: () => void;
}) {
  const registrar = registrarSeguimientoAction.bind(null, cotizacionId);
  const [state, formAction, isPending] = useActionState(registrar, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<RegistrarSeguimientoFormInput, unknown, RegistrarSeguimientoFormOutput>({
    resolver: zodResolver(registrarSeguimientoFormSchema),
    defaultValues: valoresIniciales(),
  });
  const { field: tipoField } = useController({ name: "tipo", control });

  useEffect(() => {
    if (state.success) {
      toast.success("Seguimiento registrado");
      reset(valoresIniciales());
      onSuccess?.();
    } else if (state.error) {
      toast.error(state.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form
      noValidate
      ref={formRef}
      onSubmit={(evento) => handleSubmit((data) =>
        startTransition(() => {
          const formData = new FormData(formRef.current!);
          // tipo is a SelectField (react-hook-form-controlled, not a native
          // <select name="..."> register()) -- it doesn't populate FormData
          // on its own, so it must be set explicitly here before submitting.
          formData.set("tipo", data.tipo ?? "");
          formAction(formData);
        }),
      )(evento)}
      className="flex flex-col gap-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="seguimientoTipo">Tipo</Label>
          <SelectField
            id="seguimientoTipo"
            aria-invalid={errors.tipo ? true : undefined}
            aria-describedby={errors.tipo ? "seguimientoTipo-error" : undefined}
            value={tipoField.value ?? ""}
            onValueChange={tipoField.onChange}
            items={TIPO_OPTIONS}
          />
          {errors.tipo ? <p id="seguimientoTipo-error" className="text-xs text-destructive">{errors.tipo.message}</p> : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="seguimientoFecha">Fecha</Label>
          <Controller
            control={control}
            name="fecha"
            render={({ field }) => (
              <CampoFechaHora
                id="seguimientoFecha"
                name="fecha"
                soloPasado
                value={typeof field.value === "string" ? field.value : ""}
                onChange={field.onChange}
                onBlur={field.onBlur}
                invalid={!!errors.fecha}
                describedBy={errors.fecha ? "seguimientoFecha-error" : undefined}
              />
            )}
          />
          {errors.fecha ? <p id="seguimientoFecha-error" className="text-xs text-destructive">{String(errors.fecha.message)}</p> : null}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="seguimientoResultado">Resultado</Label>
        <Textarea
          id="seguimientoResultado"
          rows={3}
          placeholder="Ej: Cliente confirmó que revisará la cotización esta semana"
          aria-invalid={errors.resultado ? true : undefined}
          aria-describedby={errors.resultado ? "seguimientoResultado-error" : undefined}
          {...register("resultado")}
        />
        {errors.resultado ? <p id="seguimientoResultado-error" className="text-xs text-destructive">{errors.resultado.message}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="seguimientoProximo">Próximo seguimiento (opcional)</Label>
        <Controller
              control={control}
              name="proximoSeguimiento"
              render={({ field }) => (
                <CampoFecha
                  id="seguimientoProximo"
                  name="proximoSeguimiento"
                  tipo="seguimiento"
                  min={formatoDiaBogota.format(new Date())}
                  value={typeof field.value === "string" ? field.value : ""}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  invalid={!!errors.proximoSeguimiento}
                  describedBy={errors.proximoSeguimiento ? "seguimientoProximo-error" : undefined}
                />
              )}
            />
        {errors.proximoSeguimiento ? (
          <p id="seguimientoProximo-error" className="text-xs text-destructive">{String(errors.proximoSeguimiento.message)}</p>
        ) : null}
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Registrar seguimiento"}
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
