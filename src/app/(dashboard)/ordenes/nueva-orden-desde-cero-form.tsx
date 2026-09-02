"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useController, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { createOrdenDesdeVehiculoAction, type OrdenFormState, type TecnicoOption } from "@/app/actions/orden-actions";
import { ordenTrabajoInputSchema } from "@/lib/validation/orden";
import type { ClienteParaOrden } from "@/app/actions/cliente-actions";
import { FormGroup } from "@/components/form-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
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
  clientes,
  tecnicos,
  onCreated,
}: {
  clientes: ClienteParaOrden[];
  tecnicos: TecnicoOption[];
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

  const clienteIdSeleccionado = clienteIdField.value;
  const vehiculoIdSeleccionado = vehiculoIdField.value;
  const vehiculosDisponibles = useMemo(
    () => clientes.find((cliente) => cliente.id === clienteIdSeleccionado)?.vehiculos ?? [],
    [clientes, clienteIdSeleccionado],
  );
  const kilometrajeActual = vehiculosDisponibles.find((vehiculo) => vehiculo.id === vehiculoIdSeleccionado)
    ?.kilometrajeActual;

  const clienteOptions: ComboboxOption[] = useMemo(
    () => clientes.map((cliente) => ({ value: cliente.id, label: cliente.nombre })),
    [clientes],
  );
  const vehiculoOptions: ComboboxOption[] = useMemo(
    () =>
      vehiculosDisponibles.map((vehiculo) => ({
        value: vehiculo.id,
        label: `${vehiculo.placa} · ${vehiculo.marca} ${vehiculo.modelo}`,
      })),
    [vehiculosDisponibles],
  );

  function onValid(data: { vehiculoId: string }) {
    startTransition(async () => {
      const formData = new FormData(formRef.current!);
      // vehiculoId is a Combobox (react-hook-form-controlled, not a native
      // <select name="..."> register()) -- it doesn't populate FormData on
      // its own, so it must be set explicitly here before submitting.
      formData.set("vehiculoId", data.vehiculoId);
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="clienteId">Cliente</Label>
            <Combobox
              id="clienteId"
              items={clienteOptions}
              value={clienteIdField.value}
              onValueChange={(value) => {
                clienteIdField.onChange(value);
                // A vehículo selected under the previous cliente must not survive
                // the switch -- it would silently point at another client's car.
                vehiculoIdField.onChange("");
              }}
              placeholder="Buscar cliente..."
              emptyMessage="Ningún cliente coincide"
              aria-invalid={errors.clienteId ? true : undefined}
              aria-describedby={errors.clienteId ? "clienteId-error" : undefined}
            />
            {errors.clienteId ? (
              <p id="clienteId-error" className="text-xs text-destructive">
                {errors.clienteId.message}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vehiculoId">Vehículo</Label>
            <Combobox
              id="vehiculoId"
              disabled={!clienteIdSeleccionado}
              items={vehiculoOptions}
              value={vehiculoIdField.value}
              onValueChange={vehiculoIdField.onChange}
              placeholder={clienteIdSeleccionado ? "Buscar vehículo..." : "Primero selecciona un cliente"}
              emptyMessage="Ningún vehículo coincide"
              aria-invalid={errors.vehiculoId ? true : undefined}
              aria-describedby={errors.vehiculoId ? "vehiculoId-error" : undefined}
            />
            {clienteIdSeleccionado && vehiculosDisponibles.length === 0 ? (
              <p className="text-xs text-muted-foreground">Este cliente no tiene vehículos registrados.</p>
            ) : null}
            {errors.vehiculoId ? (
              <p id="vehiculoId-error" className="text-xs text-destructive">
                {errors.vehiculoId.message}
              </p>
            ) : null}
          </div>

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
            <NativeSelect
              id="mecanicoId"
              aria-invalid={errors.mecanicoId ? true : undefined}
              aria-describedby={errors.mecanicoId ? "mecanicoId-error" : undefined}
              {...register("mecanicoId")}
            >
              <option value="">Sin asignar</option>
              {tecnicos.map((tecnico) => (
                <option key={tecnico.id} value={tecnico.id}>
                  {tecnico.nombre}
                </option>
              ))}
            </NativeSelect>
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

      <Button type="submit" disabled={isPending}>
        {isPending ? "Creando..." : "Crear orden"}
      </Button>
    </form>
  );
}
