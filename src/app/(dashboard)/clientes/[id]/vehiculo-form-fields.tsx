"use client";

import { z } from "zod";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { vehiculoInputSchema } from "@/lib/validation/vehiculo";
import { FormGroup } from "@/components/form-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

// createVehiculoAction/updateVehiculoAction read these fields with `|| undefined`
// before parsing -- an untouched input submits "", which .optional() alone does
// not treat as absent. Mirrored here so a blank optional field does not
// spuriously fail validation client-side the way it never does server-side.
const blankToUndefined = (v: unknown) => (v === "" ? undefined : v);
export const vehiculoFormSchema = vehiculoInputSchema.extend({
  anio: z.preprocess(blankToUndefined, vehiculoInputSchema.shape.anio),
  combustible: z.preprocess(blankToUndefined, vehiculoInputSchema.shape.combustible),
  kilometraje: z.preprocess(blankToUndefined, vehiculoInputSchema.shape.kilometraje),
  proximoMantenimiento: z.preprocess(blankToUndefined, vehiculoInputSchema.shape.proximoMantenimiento),
  transmision: z.preprocess(blankToUndefined, vehiculoInputSchema.shape.transmision),
});
export type VehiculoFormInput = z.input<typeof vehiculoFormSchema>;

// Shared by NuevoVehiculoForm and EditarVehiculoForm -- both need the exact
// same 9-field, 4-group layout, only the submit action and defaultValues differ.
export function VehiculoFormFields({
  register,
  errors,
}: {
  register: UseFormRegister<VehiculoFormInput>;
  errors: FieldErrors<VehiculoFormInput>;
}) {
  return (
    <>
      <FormGroup label="Identificación">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="placa">Placa</Label>
            <Input
              id="placa"
              className="font-mono"
              aria-invalid={errors.placa ? true : undefined}
              aria-describedby={errors.placa ? "placa-error" : undefined}
              {...register("placa")}
            />
            {errors.placa ? <p id="placa-error">{errors.placa.message}</p> : null}
          </div>
        </div>
      </FormGroup>

      <FormGroup label="Vehículo">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="marca">Marca</Label>
            <Input
              id="marca"
              aria-invalid={errors.marca ? true : undefined}
              aria-describedby={errors.marca ? "marca-error" : undefined}
              {...register("marca")}
            />
            {errors.marca ? <p id="marca-error">{errors.marca.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="modelo">Modelo</Label>
            <Input
              id="modelo"
              aria-invalid={errors.modelo ? true : undefined}
              aria-describedby={errors.modelo ? "modelo-error" : undefined}
              {...register("modelo")}
            />
            {errors.modelo ? <p id="modelo-error">{errors.modelo.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-1">
            <Label htmlFor="anio">Año</Label>
            <Input
              id="anio"
              type="number"
              min="1900"
              max="2100"
              className="font-mono"
              aria-invalid={errors.anio ? true : undefined}
              aria-describedby={errors.anio ? "anio-error" : undefined}
              {...register("anio")}
            />
            {errors.anio ? <p id="anio-error">{errors.anio.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-1">
            <Label htmlFor="combustible">Combustible</Label>
            {/*
              Native <select>, not shadcn's Select (Base UI, no DOM <option>s
              while closed) -- keeps userEvent.selectOptions()/getByRole("option")
              working, same reasoning as usuarios/nuevo-usuario-form.tsx.
            */}
            <NativeSelect id="combustible" {...register("combustible")}>
              <option value="">Seleccionar...</option>
              <option value="GASOLINA">Gasolina</option>
              <option value="DIESEL">Diésel</option>
              <option value="HIBRIDO">Híbrido</option>
              <option value="ELECTRICO">Eléctrico</option>
            </NativeSelect>
          </div>
        </div>
      </FormGroup>

      <FormGroup label="Estado actual">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="kilometraje">Kilometraje</Label>
            <Input
              id="kilometraje"
              type="number"
              min="0"
              className="font-mono"
              aria-invalid={errors.kilometraje ? true : undefined}
              aria-describedby={errors.kilometraje ? "kilometraje-error" : undefined}
              {...register("kilometraje")}
            />
            {errors.kilometraje ? <p id="kilometraje-error">{errors.kilometraje.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="proximoMantenimiento">Próximo mantenimiento</Label>
            <Input
              id="proximoMantenimiento"
              type="date"
              aria-invalid={errors.proximoMantenimiento ? true : undefined}
              aria-describedby={errors.proximoMantenimiento ? "proximoMantenimiento-error" : undefined}
              {...register("proximoMantenimiento")}
            />
            {errors.proximoMantenimiento ? (
              <p id="proximoMantenimiento-error">{errors.proximoMantenimiento.message}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="transmision">Transmisión</Label>
            <NativeSelect id="transmision" {...register("transmision")}>
              <option value="">Seleccionar...</option>
              <option value="AUTOMATICA">Automática</option>
              <option value="MECANICA">Mecánica</option>
            </NativeSelect>
          </div>
        </div>
      </FormGroup>

      <FormGroup label="Notas">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="observaciones">Observaciones del vehículo</Label>
          <Textarea
            id="observaciones"
            rows={3}
            placeholder="Rines de posventa, llave de repuesto en recepción…"
            {...register("observaciones")}
          />
        </div>
      </FormGroup>
    </>
  );
}
