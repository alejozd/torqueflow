"use client";

import { startTransition, useActionState, useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createOrdenDesdeVehiculoAction, type OrdenFormState, type TecnicoOption } from "@/app/actions/orden-actions";
import { ordenTrabajoInputSchema } from "@/lib/validation/orden";
import type { ClienteParaOrden } from "@/app/actions/cliente-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: OrdenFormState = { error: null, success: false };

const SELECT_CLASSNAME =
  "flex h-8 w-full items-center justify-between rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30";

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
}: {
  clientes: ClienteParaOrden[];
  tecnicos: TecnicoOption[];
}) {
  const [state, formAction, isPending] = useActionState(createOrdenDesdeVehiculoAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    watch,
    resetField,
    formState: { errors },
  } = useForm<OrdenDesdeCeroFormInput>({
    resolver: zodResolver(ordenDesdeCeroFormSchema),
    defaultValues: { clienteId: "", vehiculoId: "", kilometrajeIngreso: "", sintomas: "", mecanicoId: "" },
  });

  const clienteIdSeleccionado = watch("clienteId");
  const vehiculosDisponibles = useMemo(
    () => clientes.find((cliente) => cliente.id === clienteIdSeleccionado)?.vehiculos ?? [],
    [clientes, clienteIdSeleccionado],
  );

  return (
    <form
      noValidate
      ref={formRef}
      onSubmit={handleSubmit(() => startTransition(() => formAction(new FormData(formRef.current!))))}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="clienteId">Cliente</Label>
        {/*
          Native <select>, not shadcn's Select (Base UI, no DOM <option>s
          while closed) -- keeps userEvent.selectOptions()/getByRole("option")
          working, same reasoning as usuarios/nuevo-usuario-form.tsx.
        */}
        <select
          id="clienteId"
          aria-invalid={errors.clienteId ? true : undefined}
          aria-describedby={errors.clienteId ? "clienteId-error" : undefined}
          className={SELECT_CLASSNAME}
          {...register("clienteId", {
            // A vehículo selected under the previous cliente must not survive
            // the switch -- it would silently point at another client's car.
            onChange: () => resetField("vehiculoId", { defaultValue: "" }),
          })}
        >
          <option value="">Seleccionar...</option>
          {clientes.map((cliente) => (
            <option key={cliente.id} value={cliente.id}>
              {cliente.nombre}
            </option>
          ))}
        </select>
        {errors.clienteId ? <p id="clienteId-error">{errors.clienteId.message}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="vehiculoId">Vehículo</Label>
        <select
          id="vehiculoId"
          disabled={!clienteIdSeleccionado}
          aria-invalid={errors.vehiculoId ? true : undefined}
          aria-describedby={errors.vehiculoId ? "vehiculoId-error" : undefined}
          className={SELECT_CLASSNAME}
          {...register("vehiculoId")}
        >
          <option value="">{clienteIdSeleccionado ? "Seleccionar..." : "Primero selecciona un cliente"}</option>
          {vehiculosDisponibles.map((vehiculo) => (
            <option key={vehiculo.id} value={vehiculo.id}>
              {vehiculo.placa} · {vehiculo.marca} {vehiculo.modelo}
            </option>
          ))}
        </select>
        {clienteIdSeleccionado && vehiculosDisponibles.length === 0 ? (
          <p className="text-xs text-muted-foreground">Este cliente no tiene vehículos registrados.</p>
        ) : null}
        {errors.vehiculoId ? <p id="vehiculoId-error">{errors.vehiculoId.message}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="kilometrajeIngreso">Kilometraje de ingreso</Label>
        <Input
          id="kilometrajeIngreso"
          type="number"
          min="0"
          aria-invalid={errors.kilometrajeIngreso ? true : undefined}
          aria-describedby={errors.kilometrajeIngreso ? "kilometrajeIngreso-error" : undefined}
          {...register("kilometrajeIngreso")}
        />
        {errors.kilometrajeIngreso ? <p id="kilometrajeIngreso-error">{errors.kilometrajeIngreso.message}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sintomas">Síntomas reportados</Label>
        <Textarea
          id="sintomas"
          aria-invalid={errors.sintomas ? true : undefined}
          aria-describedby={errors.sintomas ? "sintomas-error" : undefined}
          {...register("sintomas")}
        />
        {errors.sintomas ? <p id="sintomas-error">{errors.sintomas.message}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mecanicoId">Mecánico asignado</Label>
        <select
          id="mecanicoId"
          aria-invalid={errors.mecanicoId ? true : undefined}
          aria-describedby={errors.mecanicoId ? "mecanicoId-error" : undefined}
          className={SELECT_CLASSNAME}
          {...register("mecanicoId")}
        >
          <option value="">Sin asignar</option>
          {tecnicos.map((tecnico) => (
            <option key={tecnico.id} value={tecnico.id}>
              {tecnico.nombre}
            </option>
          ))}
        </select>
        {errors.mecanicoId ? <p id="mecanicoId-error">{errors.mecanicoId.message}</p> : null}
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Creando..." : "Crear orden"}
      </Button>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? <p role="status">Orden creada</p> : null}
    </form>
  );
}
