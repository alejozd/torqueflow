"use client";

import { useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createOrdenAction, type OrdenFormState, type TecnicoOption } from "@/app/actions/orden-actions";
import { ordenTrabajoInputSchema } from "@/lib/validation/orden";
import { FormGroup } from "@/components/form-group";
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
  /**
   * Fired synchronously right after a successful create, with the new
   * orden's id -- instead of a status message, so a caller like
   * NuevaOrdenDialog can navigate immediately. Not driven by useActionState +
   * useEffect: createOrdenAction's revalidatePath(`/clientes/${clienteId}`) /
   * (`/vehiculos/${vehiculoId}`) can refresh this form's parent before a
   * state-driven effect gets a chance to run, same race
   * generar-factura-form.tsx's onValid comment documents. useTransition + a
   * manual submit calls onCreated from inside the same transition as the
   * action call, ahead of any RSC update.
   */
  onCreated?: (ordenId: string) => void;
}) {
  const [state, setState] = useState<OrdenFormState>(initialState);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OrdenFormInput>({
    resolver: zodResolver(ordenFormSchema),
    defaultValues: { kilometrajeIngreso: "", sintomas: "", mecanicoId: "" },
  });

  function onValid() {
    startTransition(async () => {
      const formData = new FormData(formRef.current!);
      const result = await createOrdenAction(clienteId, vehiculoId, initialState, formData);
      if (result.success && result.ordenId && onCreated) {
        onCreated(result.ordenId);
      } else {
        setState(result);
      }
    });
  }

  return (
    <form noValidate ref={formRef} onSubmit={handleSubmit(onValid)} className="flex flex-col gap-4">
      <FormGroup label="Ingreso">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            {errors.kilometrajeIngreso ? (
              <p id="kilometrajeIngreso-error">{errors.kilometrajeIngreso.message}</p>
            ) : null}
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
          {errors.sintomas ? <p id="sintomas-error">{errors.sintomas.message}</p> : null}
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
