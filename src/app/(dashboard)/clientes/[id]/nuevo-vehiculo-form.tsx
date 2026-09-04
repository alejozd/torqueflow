"use client";

import { useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createVehiculoAction, type VehiculoFormState } from "@/app/actions/vehiculo-actions";
import { VehiculoFormFields, vehiculoFormSchema, type VehiculoFormInput } from "./vehiculo-form-fields";
import type { MarcaVehiculo, ModeloVehiculo, Vehiculo } from "@/generated/prisma-tenant";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogClose } from "@/components/ui/dialog";

const initialState: VehiculoFormState = { error: null, success: false };

export function NuevoVehiculoForm({
  clienteId,
  marcas,
  modelos,
  esAdmin,
  onCreated,
}: {
  clienteId: string;
  marcas: MarcaVehiculo[];
  modelos: ModeloVehiculo[];
  esAdmin: boolean;
  /**
   * Fired synchronously right after a successful create, with the new
   * vehículo -- mirrors NuevaCitaForm's onCreated: createVehiculoAction's
   * revalidatePath can refresh (and unmount, inside a dialog) this form's
   * parent before a useActionState-driven effect would get a chance to run.
   */
  onCreated?: (vehiculo: Vehiculo) => void;
}) {
  const [state, setState] = useState<VehiculoFormState>(initialState);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<VehiculoFormInput>({
    resolver: zodResolver(vehiculoFormSchema),
    defaultValues: {
      placa: "",
      marca: "",
      modelo: "",
      marcaId: "",
      modeloId: "",
      color: "",
      anio: "",
      combustible: "",
      kilometraje: "",
      proximoMantenimiento: "",
      transmision: "",
      observaciones: "",
    },
  });

  function onValid(data: VehiculoFormInput) {
    startTransition(async () => {
      const formData = new FormData(formRef.current!);
      // combustible and transmision are SelectFields (react-hook-form-
      // controlled, not native <select name="..."> register()) -- they
      // don't populate FormData on their own, so they must be set
      // explicitly here before submitting.
      formData.set("combustible", (data.combustible as string | undefined) ?? "");
      formData.set("transmision", (data.transmision as string | undefined) ?? "");
      formData.set("marcaId", (data.marcaId as string | undefined) ?? "");
      formData.set("modeloId", (data.modeloId as string | undefined) ?? "");
      const result = await createVehiculoAction(clienteId, initialState, formData);
      if (result.success && result.vehiculo) {
        toast.success("Vehículo agregado");
        if (onCreated) onCreated(result.vehiculo);
        else setState(result);
      } else {
        toast.error(result.error ?? "No se pudo agregar el vehículo");
        setState(result);
      }
    });
  }

  return (
    <form noValidate ref={formRef} onSubmit={handleSubmit(onValid)} className="flex flex-col gap-5">
      <VehiculoFormFields
        register={register}
        errors={errors}
        control={control}
        setValue={setValue}
        marcas={marcas}
        modelos={modelos}
        esAdmin={esAdmin}
      />

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
