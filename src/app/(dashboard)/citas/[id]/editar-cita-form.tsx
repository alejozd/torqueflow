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
import { SelectorFechaHora } from "@/components/selector-fecha-hora";
import { valorFechaHoraDeDate, type MomentoBogota, type OcupacionCita } from "@/lib/agenda-cita";

const initialState: CitaFormState = { error: null, success: false };

const formatoActualizacion = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Bogota",
});

export function EditarCitaForm({
  cita,
  vehiculos,
  ocupacion,
  ahora,
}: {
  cita: CitaConDetalle;
  vehiculos: VehiculoOption[];
  /** Citas de la sede sin esta ni las canceladas. */
  ocupacion: OcupacionCita[];
  /** Del servidor: este formulario se pinta en el servidor y la hora tiene que coincidir al hidratar. */
  ahora: MomentoBogota;
}) {
  const [state, formAction, isPending] = useActionState(updateCitaAction.bind(null, cita.id), initialState);
  const [vehiculoId, setVehiculoId] = useState(cita.vehiculo.id);
  const [valorOriginal] = useState(() => valorFechaHoraDeDate(cita.fechaHora));
  const [fechaHora, setFechaHora] = useState(valorOriginal);

  const vehiculoOptions: ComboboxOption[] = useMemo(
    () =>
      vehiculos.map((vehiculo) => ({
        value: vehiculo.id,
        label: `${vehiculo.placa} — ${vehiculo.marca} ${vehiculo.modelo} (${vehiculo.clienteNombre})`,
      })),
    [vehiculos],
  );

  return (
    <form noValidate action={formAction} className="flex min-w-0 flex-col gap-4">
      <FormGroup label="Quién">
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
      </FormGroup>

      <FormGroup label="Cuándo">
        {/* SelectorFechaHora lleva su propio <input type="hidden" name="fechaHora">. */}
        <SelectorFechaHora
          id="fechaHora"
          name="fechaHora"
          value={fechaHora}
          onChange={setFechaHora}
          ahora={ahora}
          ocupacion={ocupacion}
          valorOriginal={valorOriginal}
        />
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
