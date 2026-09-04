"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useController, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { createOrdenDesdeVehiculoAction, type OrdenFormState, type TecnicoOption } from "@/app/actions/orden-actions";
import { ordenTrabajoInputSchema } from "@/lib/validation/orden";
import type { ClienteParaOrden } from "@/app/actions/cliente-actions";
import type { MarcaVehiculo, ModeloVehiculo } from "@/generated/prisma-tenant";
import { ClientVehicleSelector } from "./client-vehicle-selector";
import { FormGroup } from "@/components/form-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";

const initialState: OrdenFormState = { error: null, success: false };

// clienteId only narrows the Vehículo options client-side -- the server
// action (createOrdenDesdeVehiculoAction) never reads it, it derives the real
// cliente from the chosen vehiculo, same rule createCitaAction documents.
const ordenDesdeCeroFormSchema = ordenTrabajoInputSchema.extend({
  clienteId: z.string().min(1, "Selecciona un cliente"),
  vehiculoId: z.string().min(1, "Selecciona un vehículo"),
  kilometrajeIngreso: z.preprocess(
    (v) => (v === "" ? undefined : v),
    ordenTrabajoInputSchema.shape.kilometrajeIngreso,
  ),
});
type OrdenDesdeCeroFormInput = z.input<typeof ordenDesdeCeroFormSchema>;

export function NuevaOrdenDesdeCeroForm({
  clientes: clientesIniciales,
  tecnicos,
  marcas,
  modelos,
  esAdmin,
  onCreated,
}: {
  clientes: ClienteParaOrden[];
  tecnicos: TecnicoOption[];
  marcas: MarcaVehiculo[];
  modelos: ModeloVehiculo[];
  esAdmin: boolean;
  /**
   * Fired synchronously right after a successful create -- not driven by
   * useActionState + a lingering "Orden creada" message: leaving the form
   * mounted with its stale values and an enabled submit button let a user
   * double-click "Crear orden" and create the same orden twice. Closing the
   * dialog on success (same race documented in citas/nueva-cita-form.tsx)
   * removes the possibility entirely instead of just disabling the button
   * for the pending window.
   */
  onCreated?: () => void;
}) {
  const [state, setState] = useState<OrdenFormState>(initialState);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  // Owned here (not just the initial prop) so ClientVehicleSelector's
  // create-cliente/create-vehículo dialogs can append to it and have the
  // rest of this form (kilometraje hint, vehículo options) see the result
  // immediately, without waiting on the server actions' revalidatePath to
  // reach this already-open dialog.
  const [clientes, setClientes] = useState(clientesIniciales);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<OrdenDesdeCeroFormInput>({
    resolver: zodResolver(ordenDesdeCeroFormSchema),
    defaultValues: { clienteId: "", vehiculoId: "", kilometrajeIngreso: "", sintomas: "", mecanicoId: "" },
  });
  const { field: clienteIdField } = useController({ name: "clienteId", control });
  const { field: vehiculoIdField } = useController({ name: "vehiculoId", control });
  const { field: mecanicoIdField } = useController({ name: "mecanicoId", control });

  const vehiculosDisponibles = useMemo(
    () => clientes.find((cliente) => cliente.id === clienteIdField.value)?.vehiculos ?? [],
    [clientes, clienteIdField.value],
  );
  const kilometrajeActual = vehiculosDisponibles.find((vehiculo) => vehiculo.id === vehiculoIdField.value)
    ?.kilometrajeActual;

  function onValid(data: { vehiculoId: string; mecanicoId?: string }) {
    startTransition(async () => {
      const formData = new FormData(formRef.current!);
      // vehiculoId is a Combobox (react-hook-form-controlled, not a native
      // <select name="..."> register()) -- it doesn't populate FormData on
      // its own, so it must be set explicitly here before submitting.
      formData.set("vehiculoId", data.vehiculoId);
      // mecanicoId is a SelectField (react-hook-form-controlled, not a
      // native <select name="..."> register()) -- it doesn't populate
      // FormData on its own, so it must be set explicitly here before
      // submitting.
      formData.set("mecanicoId", data.mecanicoId ?? "");
      const result = await createOrdenDesdeVehiculoAction(initialState, formData);
      if (result.success) {
        toast.success("Orden creada");
        if (onCreated) onCreated();
        else setState(result);
      } else {
        toast.error(result.error ?? "No se pudo crear la orden");
        setState(result);
      }
    });
  }

  return (
    <form noValidate ref={formRef} onSubmit={handleSubmit(onValid)} className="flex flex-col gap-4">
      <FormGroup label="Vehículo">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ClientVehicleSelector
            clientes={clientes}
            onClientesChange={setClientes}
            clienteId={clienteIdField.value}
            vehiculoId={vehiculoIdField.value}
            onClienteIdChange={clienteIdField.onChange}
            onVehiculoIdChange={vehiculoIdField.onChange}
            clienteError={errors.clienteId?.message}
            vehiculoError={errors.vehiculoId?.message}
            marcas={marcas}
            modelos={modelos}
            esAdmin={esAdmin}
          />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="kilometrajeIngreso">Kilometraje de ingreso</Label>
            <Input
              id="kilometrajeIngreso"
              type="number"
              min="0"
              className="font-mono"
              aria-invalid={errors.kilometrajeIngreso ? true : undefined}
              aria-describedby={errors.kilometrajeIngreso ? "kilometrajeIngreso-error" : undefined}
              {...register("kilometrajeIngreso")}
            />
            {kilometrajeActual !== null && kilometrajeActual !== undefined ? (
              <span className="text-[10px] text-muted-foreground">
                Último kilometraje registrado: {kilometrajeActual.toLocaleString("es-CO")} km
              </span>
            ) : null}
            {errors.kilometrajeIngreso ? (
              <p id="kilometrajeIngreso-error" className="text-xs text-destructive">
                {errors.kilometrajeIngreso.message}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mecanicoId">Mecánico asignado</Label>
            <SelectField
              id="mecanicoId"
              aria-invalid={errors.mecanicoId ? true : undefined}
              aria-describedby={errors.mecanicoId ? "mecanicoId-error" : undefined}
              value={mecanicoIdField.value ?? ""}
              onValueChange={mecanicoIdField.onChange}
              placeholder="Sin asignar"
              items={[
                { value: "", label: "Sin asignar" },
                ...tecnicos.map((tecnico) => ({ value: tecnico.id, label: tecnico.nombre })),
              ]}
            />
            {errors.mecanicoId ? (
              <p id="mecanicoId-error" className="text-xs text-destructive">
                {errors.mecanicoId.message}
              </p>
            ) : null}
          </div>
        </div>
      </FormGroup>

      <FormGroup label="Diagnóstico">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sintomas">Síntomas reportados</Label>
          <Textarea
            id="sintomas"
            aria-invalid={errors.sintomas ? true : undefined}
            aria-describedby={errors.sintomas ? "sintomas-error" : undefined}
            {...register("sintomas")}
          />
          {errors.sintomas ? (
            <p id="sintomas-error" className="text-xs text-destructive">
              {errors.sintomas.message}
            </p>
          ) : null}
        </div>
      </FormGroup>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? <p role="status">Orden creada</p> : null}

      <div className="flex justify-end gap-2">
        <DialogClose render={<Button type="button" variant="outline" />}>
          Cancelar
        </DialogClose>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creando..." : "Crear orden"}
        </Button>
      </div>
    </form>
  );
}
