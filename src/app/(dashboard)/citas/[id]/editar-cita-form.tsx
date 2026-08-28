"use client";

import { useActionState } from "react";
import {
  updateCitaAction,
  type CitaConDetalle,
  type CitaFormState,
  type VehiculoOption,
} from "@/app/actions/cita-actions";
import { FormGroup } from "@/components/form-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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

  return (
    <form noValidate action={formAction} className="flex flex-col gap-4">
      <FormGroup label="Cuándo y quién">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vehiculoId">Vehículo</Label>
            {/* Native <select>: matches nueva-cita-form.tsx's real <option> requirement for tests. */}
            <select
              id="vehiculoId"
              name="vehiculoId"
              required
              defaultValue={cita.vehiculo.id}
              className="flex h-8 w-full items-center justify-between rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
            >
              {vehiculos.map((vehiculo) => (
                <option key={vehiculo.id} value={vehiculo.id}>
                  {`${vehiculo.placa} — ${vehiculo.marca} ${vehiculo.modelo} (${vehiculo.clienteNombre})`}
                </option>
              ))}
            </select>
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
          </div>
        </div>
      </FormGroup>

      <FormGroup label="Detalles">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

      <Button type="submit" disabled={isPending} className="self-end">
        {isPending ? "Guardando..." : "Guardar cambios"}
      </Button>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? <p role="status">Cita actualizada</p> : null}
    </form>
  );
}
