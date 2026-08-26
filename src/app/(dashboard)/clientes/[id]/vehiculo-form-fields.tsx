"use client";

import { z } from "zod";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { vehiculoInputSchema } from "@/lib/validation/vehiculo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

// Group label + divider line, matching the Claude Design mockup's form layout.
function GroupLabel({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-semibold tracking-[0.1em] text-[oklch(0.45_0.15_45)] uppercase">
        {children}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

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
      <div className="flex flex-col gap-3">
        <GroupLabel>Identificación</GroupLabel>
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
      </div>

      <div className="flex flex-col gap-3">
        <GroupLabel>Vehículo</GroupLabel>
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
            <select
              id="combustible"
              className="flex h-8 w-full items-center justify-between rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
              {...register("combustible")}
            >
              <option value="">Seleccionar...</option>
              <option value="GASOLINA">Gasolina</option>
              <option value="DIESEL">Diésel</option>
              <option value="HIBRIDO">Híbrido</option>
              <option value="ELECTRICO">Eléctrico</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <GroupLabel>Estado actual</GroupLabel>
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
            <select
              id="transmision"
              className="flex h-8 w-full items-center justify-between rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
              {...register("transmision")}
            >
              <option value="">Seleccionar...</option>
              <option value="AUTOMATICA">Automática</option>
              <option value="MECANICA">Mecánica</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <GroupLabel>Notas</GroupLabel>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="observaciones">Observaciones del vehículo</Label>
          <Textarea
            id="observaciones"
            rows={3}
            placeholder="Rines de posventa, llave de repuesto en recepción…"
            {...register("observaciones")}
          />
        </div>
      </div>
    </>
  );
}
