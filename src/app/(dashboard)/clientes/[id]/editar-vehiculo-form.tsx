"use client";

import { useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { updateVehiculoAction, type VehiculoFormState } from "@/app/actions/vehiculo-actions";
import { VehiculoFormFields, vehiculoFormSchema, type VehiculoFormInput } from "./vehiculo-form-fields";
import type { MarcaVehiculo, ModeloVehiculo, Vehiculo } from "@/generated/prisma-tenant";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogClose } from "@/components/ui/dialog";

const initialState: VehiculoFormState = { error: null, success: false };

function toDateInputValue(fecha: Date | null): string {
  return fecha ? fecha.toISOString().slice(0, 10) : "";
}

export function EditarVehiculoForm({
  vehiculo,
  marcas,
  modelos,
  esAdmin,
  onUpdated,
}: {
  vehiculo: Vehiculo;
  marcas: MarcaVehiculo[];
  modelos: ModeloVehiculo[];
  esAdmin: boolean;
  /**
   * Fired synchronously right after a successful update -- mirrors
   * NuevaCitaForm's onCreated: updateVehiculoAction's revalidatePath can
   * refresh (and unmount, inside a dialog) this form's parent before a
   * useActionState-driven effect would get a chance to run.
   */
  onUpdated?: () => void;
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
      placa: vehiculo.placa,
      marca: vehiculo.marca,
      modelo: vehiculo.modelo,
      marcaId: vehiculo.marcaId ?? "",
      modeloId: vehiculo.modeloId ?? "",
      color: vehiculo.color ?? "",
      anio: vehiculo.anio ?? "",
      combustible: vehiculo.combustible ?? "",
      kilometraje: vehiculo.kilometraje ?? "",
      proximoMantenimiento: toDateInputValue(vehiculo.proximoMantenimiento),
      transmision: vehiculo.transmision ?? "",
      observaciones: vehiculo.observaciones ?? "",
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
      const result = await updateVehiculoAction(vehiculo.id, initialState, formData);
      if (result.success) {
        toast.success("Vehículo actualizado");
        if (onUpdated) onUpdated();
        else setState(result);
      } else {
        toast.error(result.error ?? "No se pudo actualizar el vehículo");
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
      {state.success ? <p role="status">Vehículo actualizado</p> : null}

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <span className="text-xs text-muted-foreground">Placa, marca y modelo son obligatorios</span>
        <div className="flex justify-end gap-2">
          <DialogClose render={<Button type="button" variant="outline" />}>
            Cancelar
          </DialogClose>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Guardando..." : "Guardar cambios"}
          </Button>
        </div>
      </div>
    </form>
  );
}
