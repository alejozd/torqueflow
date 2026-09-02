"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateVehiculoAction, type VehiculoFormState } from "@/app/actions/vehiculo-actions";
import { VehiculoFormFields, vehiculoFormSchema, type VehiculoFormInput } from "./vehiculo-form-fields";
import type { Vehiculo } from "@/generated/prisma-tenant";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const initialState: VehiculoFormState = { error: null, success: false };

function toDateInputValue(fecha: Date | null): string {
  return fecha ? fecha.toISOString().slice(0, 10) : "";
}

export function EditarVehiculoForm({ vehiculo }: { vehiculo: Vehiculo }) {
  const [state, formAction, isPending] = useActionState(
    updateVehiculoAction.bind(null, vehiculo.id),
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<VehiculoFormInput>({
    resolver: zodResolver(vehiculoFormSchema),
    defaultValues: {
      placa: vehiculo.placa,
      marca: vehiculo.marca,
      modelo: vehiculo.modelo,
      anio: vehiculo.anio ?? "",
      combustible: vehiculo.combustible ?? "",
      kilometraje: vehiculo.kilometraje ?? "",
      proximoMantenimiento: toDateInputValue(vehiculo.proximoMantenimiento),
      transmision: vehiculo.transmision ?? "",
      observaciones: vehiculo.observaciones ?? "",
    },
  });

  return (
    <form
      noValidate
      ref={formRef}
      onSubmit={handleSubmit((data) =>
        startTransition(() => {
          const formData = new FormData(formRef.current!);
          // combustible and transmision are SelectFields (react-hook-form-
          // controlled, not native <select name="..."> register()) -- they
          // don't populate FormData on their own, so they must be set
          // explicitly here before submitting.
          formData.set("combustible", (data.combustible as string | undefined) ?? "");
          formData.set("transmision", (data.transmision as string | undefined) ?? "");
          formAction(formData);
        }),
      )}
      className="flex flex-col gap-5"
    >
      <VehiculoFormFields register={register} errors={errors} control={control} />

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? <p role="status">Vehículo actualizado</p> : null}

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <span className="text-xs text-muted-foreground">Placa, marca y modelo son obligatorios</span>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}
