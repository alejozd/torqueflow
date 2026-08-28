"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  updateCitaAction,
  type CitaConDetalle,
  type CitaFormState,
  type VehiculoOption,
} from "@/app/actions/cita-actions";
import { FormGroup } from "@/components/form-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: CitaFormState = { error: null, success: false };

const formatoFechaHoraBogota = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const formatoActualizacion = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Bogota",
});

// citaInputSchema expects the same naive "YYYY-MM-DDTHH:mm" shape
// <input type="datetime-local"> produces, so the default value has to be
// rebuilt from parts (not toISOString, which is UTC, not Bogotá local).
function paraInputDatetimeLocal(fecha: Date): string {
  const partes = formatoFechaHoraBogota.formatToParts(fecha);
  const obtener = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${obtener("year")}-${obtener("month")}-${obtener("day")}T${obtener("hour")}:${obtener("minute")}`;
}

export function EditarCitaForm({
  cita,
  vehiculos,
}: {
  cita: CitaConDetalle;
  vehiculos: VehiculoOption[];
}) {
  const [state, formAction, isPending] = useActionState(updateCitaAction.bind(null, cita.id), initialState);
  const [vehiculoId, setVehiculoId] = useState(cita.vehiculo.id);

  const vehiculoOptions: ComboboxOption[] = useMemo(
    () =>
      vehiculos.map((vehiculo) => ({
        value: vehiculo.id,
        label: `${vehiculo.placa} — ${vehiculo.marca} ${vehiculo.modelo} (${vehiculo.clienteNombre})`,
      })),
    [vehiculos],
  );

  return (
    <form noValidate action={formAction} className="flex flex-col gap-4">
      <FormGroup label="Cuándo y quién">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vehiculoId">Vehículo</Label>
            <Combobox
              id="vehiculoId"
              required
              items={vehiculoOptions}
              value={vehiculoId}
              onValueChange={setVehiculoId}
              placeholder="Buscar vehículo..."
              emptyMessage="Ningún vehículo coincide"
            />
            {/*
              This form submits via a native form action (useActionState), not
              react-hook-form + manual FormData -- the Combobox is a
              react-controlled <input>, not a native <select name="...">, so it
              doesn't participate in the browser's own FormData construction.
              This hidden input keeps vehiculoId in the native form submission.
            */}
            <input type="hidden" name="vehiculoId" value={vehiculoId} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fechaHora">Fecha y hora</Label>
            <Input
              id="fechaHora"
              name="fechaHora"
              type="datetime-local"
              required
              className="font-mono"
              defaultValue={paraInputDatetimeLocal(cita.fechaHora)}
            />
            <span className="text-[10px] text-muted-foreground">Zona horaria de la sede: America/Bogotá</span>
          </div>
        </div>
      </FormGroup>

      <FormGroup label="Detalles">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="motivo">Motivo</Label>
            <Input id="motivo" name="motivo" required defaultValue={cita.motivo} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notas">Notas</Label>
            <Textarea id="notas" name="notas" defaultValue={cita.notas ?? ""} />
          </div>
        </div>
      </FormGroup>

      <div className="flex items-center gap-3 border-t border-border pt-3">
        <span className="flex-1 text-xs text-muted-foreground">
          Última actualización: {formatoActualizacion.format(cita.updatedAt)}
        </span>
        <Link href="/citas" className={buttonVariants({ variant: "outline" })}>
          Descartar
        </Link>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar cambios"}
        </Button>
      </div>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? <p role="status">Cita actualizada</p> : null}
    </form>
  );
}
