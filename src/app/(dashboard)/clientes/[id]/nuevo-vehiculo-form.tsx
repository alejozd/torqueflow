"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createVehiculoAction, type VehiculoFormState } from "@/app/actions/vehiculo-actions";
import { VehiculoFormFields, vehiculoFormSchema, type VehiculoFormInput } from "./vehiculo-form-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogClose } from "@/components/ui/dialog";

const initialState: VehiculoFormState = { error: null, success: false };

export function NuevoVehiculoForm({ clienteId }: { clienteId: string }) {
  const createVehiculoForCliente = createVehiculoAction.bind(null, clienteId);
  const [state, formAction, isPending] = useActionState(createVehiculoForCliente, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    control,
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
      {state.success ? <p role="status">Vehículo agregado</p> : null}

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <span className="text-xs text-muted-foreground">Placa, marca y modelo son obligatorios</span>
        <div className="flex justify-end gap-2">
          <DialogClose render={<Button type="button" variant="outline" />}>
            Cancelar
          </DialogClose>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Guardando..." : "Agregar vehículo"}
          </Button>
        </div>
      </div>
    </form>
  );
}
