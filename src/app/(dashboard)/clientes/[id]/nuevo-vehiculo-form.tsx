"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createVehiculoAction, type VehiculoFormState } from "@/app/actions/vehiculo-actions";
import { VehiculoFormFields, vehiculoFormSchema, type VehiculoFormInput } from "./vehiculo-form-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const initialState: VehiculoFormState = { error: null, success: false };

export function NuevoVehiculoForm({ clienteId }: { clienteId: string }) {
  const createVehiculoForCliente = createVehiculoAction.bind(null, clienteId);
  const [state, formAction, isPending] = useActionState(createVehiculoForCliente, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VehiculoFormInput>({
    resolver: zodResolver(vehiculoFormSchema),
    defaultValues: {
      placa: "",
      marca: "",
      modelo: "",
      anio: "",
      combustible: "",
      kilometraje: "",
      proximoMantenimiento: "",
      transmision: "",
      observaciones: "",
    },
  });

  return (
    <form
      noValidate
      ref={formRef}
      onSubmit={handleSubmit(() => startTransition(() => formAction(new FormData(formRef.current!))))}
      className="flex flex-col gap-5"
    >
      <VehiculoFormFields register={register} errors={errors} />

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? <p role="status">Vehículo agregado</p> : null}

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <span className="text-xs text-muted-foreground">Placa, marca y modelo son obligatorios</span>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Agregar vehículo"}
        </Button>
      </div>
    </form>
  );
}
