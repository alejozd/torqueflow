"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createOrdenAction, type OrdenFormState, type TecnicoOption } from "@/app/actions/orden-actions";
import { ordenTrabajoInputSchema } from "@/lib/validation/orden";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: OrdenFormState = { error: null, success: false };

// createOrdenAction reads formData.get("kilometrajeIngreso") || undefined
// before parsing -- an untouched number input submits "", which
// .optional() alone does not treat as absent.
const ordenFormSchema = ordenTrabajoInputSchema.extend({
  kilometrajeIngreso: z.preprocess(
    (v) => (v === "" ? undefined : v),
    ordenTrabajoInputSchema.shape.kilometrajeIngreso,
  ),
});
type OrdenFormInput = z.input<typeof ordenFormSchema>;

export function NuevaOrdenForm({
  clienteId,
  vehiculoId,
  tecnicos,
  onCreated,
}: {
  clienteId: string;
  vehiculoId: string;
  tecnicos: TecnicoOption[];
  /** Fired once, right after a successful create, with the new orden's id. */
  onCreated?: (ordenId: string) => void;
}) {
  const createForVehiculo = createOrdenAction.bind(null, clienteId, vehiculoId);
  const [state, formAction, isPending] = useActionState(createForVehiculo, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  // useActionState has no "then" -- this is the standard way to react to a
  // state transition it produces (as opposed to the submit event itself).
  // onCreated is deliberately omitted from the deps: it's a fresh closure
  // per render in every caller, and keying off it would refire this on every
  // parent re-render instead of only on a real state change.
  useEffect(() => {
    if (state.success && state.ordenId) {
      onCreated?.(state.ordenId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success, state.ordenId]);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OrdenFormInput>({
    resolver: zodResolver(ordenFormSchema),
    defaultValues: { kilometrajeIngreso: "", sintomas: "", mecanicoId: "" },
  });

  return (
    <form
      noValidate
      ref={formRef}
      onSubmit={handleSubmit(() => startTransition(() => formAction(new FormData(formRef.current!))))}
      className="flex flex-col gap-4"
    >
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
        {/*
          Native <select>, not shadcn's Select (Base UI, no DOM <option>s
          while closed) -- userEvent.selectOptions()/getByRole("option")
          in the existing tests need real <select>/<option> elements.
          Styled by hand to match the shadcn select trigger look.
        */}
        <select
          id="mecanicoId"
          aria-invalid={errors.mecanicoId ? true : undefined}
          aria-describedby={errors.mecanicoId ? "mecanicoId-error" : undefined}
          className="flex h-8 w-full items-center justify-between rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
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
