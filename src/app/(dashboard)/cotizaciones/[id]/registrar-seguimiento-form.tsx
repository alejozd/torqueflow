"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { useController, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import {
  registrarSeguimientoAction,
  type SeguimientoCotizacionFormState,
} from "@/app/actions/cotizacion-seguimiento-actions";
import { registrarSeguimientoInputSchema } from "@/lib/validation/cotizacion-seguimiento";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

// Same datetime-local default-value construction as citas/[id]/editar-cita-form.tsx's
// paraInputDatetimeLocal -- the naive "YYYY-MM-DDTHH:mm" the input emits has to be
// built from Bogota parts by hand, not toISOString (UTC, not Bogota local).
const formatoFechaHoraBogota = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function paraInputDatetimeLocal(fecha: Date): string {
  const partes = formatoFechaHoraBogota.formatToParts(fecha);
  const obtener = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${obtener("year")}-${obtener("month")}-${obtener("day")}T${obtener("hour")}:${obtener("minute")}`;
}

function valoresIniciales() {
  return { tipo: "LLAMADA" as const, fecha: paraInputDatetimeLocal(new Date()), resultado: "", proximoSeguimiento: "" };
}

// An untouched date input submits "" -- .optional() alone does not treat that
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
      onSubmit={handleSubmit((data) =>
        startTransition(() => {
          const formData = new FormData(formRef.current!);
          // tipo is a SelectField (react-hook-form-controlled, not a native
          // <select name="..."> register()) -- it doesn't populate FormData
          // on its own, so it must be set explicitly here before submitting.
          formData.set("tipo", data.tipo ?? "");
          formAction(formData);
        }),
      )}
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
          {errors.tipo ? <p id="seguimientoTipo-error">{errors.tipo.message}</p> : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="seguimientoFecha">Fecha</Label>
          <Input
            id="seguimientoFecha"
            type="datetime-local"
            className="font-mono"
            aria-invalid={errors.fecha ? true : undefined}
            aria-describedby={errors.fecha ? "seguimientoFecha-error" : undefined}
            {...register("fecha")}
          />
          {errors.fecha ? <p id="seguimientoFecha-error">{String(errors.fecha.message)}</p> : null}
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
        {errors.resultado ? <p id="seguimientoResultado-error">{errors.resultado.message}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="seguimientoProximo">Próximo seguimiento (opcional)</Label>
        <Input
          id="seguimientoProximo"
          type="date"
          aria-invalid={errors.proximoSeguimiento ? true : undefined}
          aria-describedby={errors.proximoSeguimiento ? "seguimientoProximo-error" : undefined}
          {...register("proximoSeguimiento")}
        />
        {errors.proximoSeguimiento ? (
          <p id="seguimientoProximo-error">{String(errors.proximoSeguimiento.message)}</p>
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
