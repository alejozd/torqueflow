"use client";

import { Controller, type Control, type FieldErrors } from "react-hook-form";
import { CampoFecha } from "@/components/campo-fecha";
import { Label } from "@/components/ui/label";
import { formatoDiaBogota } from "@/lib/fecha-bogota";
import type { ClienteInput } from "@/lib/validation/cliente";

/**
 * Fecha de nacimiento del cliente para crear y editar. El calendario deja
 * escribir la fecha (12/03/1980), que es lo práctico para un cumpleaños, y
 * debajo muestra la edad y cuántos días faltan. `name` lo pone en el FormData.
 */
export function CampoFechaNacimiento({
  control,
  errors,
}: {
  control: Control<ClienteInput>;
  errors: FieldErrors<ClienteInput>;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="fechaNacimiento">Fecha de nacimiento</Label>
      <Controller
        control={control}
        name="fechaNacimiento"
        render={({ field }) => (
          <CampoFecha
            id="fechaNacimiento"
            name="fechaNacimiento"
            tipo="nacimiento"
            min="1900-01-01"
            max={formatoDiaBogota.format(new Date())}
            value={field.value ?? ""}
            onChange={field.onChange}
            onBlur={field.onBlur}
            invalid={!!errors.fechaNacimiento}
            describedBy={errors.fechaNacimiento ? "fechaNacimiento-error" : undefined}
          />
        )}
      />
      {errors.fechaNacimiento ? (
        <p id="fechaNacimiento-error" className="text-xs text-destructive">
          {errors.fechaNacimiento.message}
        </p>
      ) : null}
    </div>
  );
}
