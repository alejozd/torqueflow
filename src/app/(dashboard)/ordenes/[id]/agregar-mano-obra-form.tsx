"use client";

import { startTransition, useActionState, useRef } from "react";
import { useController, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { addManoDeObraAction, type ManoDeObraFormState } from "@/app/actions/mano-de-obra-actions";
import type { TecnicoOption } from "@/app/actions/orden-actions";
import { manoDeObraInputSchema } from "@/lib/validation/orden";
import { FormGroup } from "@/components/form-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";

const initialState: ManoDeObraFormState = { error: null, success: false };

type ManoDeObraFormInput = z.input<typeof manoDeObraInputSchema>;

export function AgregarManoObraForm({
  ordenId,
  tecnicos,
  mecanicoIdHeader,
}: {
  ordenId: string;
  tecnicos: TecnicoOption[];
  /** Distinto técnico por tarea (pastillas vs. correa) es habitual, así que
   * esto solo precarga el select -- no obliga a usar el mecánico de la orden. */
  mecanicoIdHeader?: string | null;
}) {
  const addManoObra = addManoDeObraAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(addManoObra, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<ManoDeObraFormInput>({
    resolver: zodResolver(manoDeObraInputSchema),
    defaultValues: { descripcion: "", valor: "", mecanicoId: mecanicoIdHeader ?? "" },
  });
  const { field: mecanicoIdField } = useController({ name: "mecanicoId", control });

  return (
    <form
      noValidate
      ref={formRef}
      onSubmit={handleSubmit((data) =>
        startTransition(() => {
          const formData = new FormData(formRef.current!);
          // mecanicoId is a SelectField (react-hook-form-controlled, not a
          // native <select name="..."> register()) -- it doesn't populate
          // FormData on its own, so it must be set explicitly here before
          // submitting.
          formData.set("mecanicoId", data.mecanicoId ?? "");
          formAction(formData);
        }),
      )}
      className="flex flex-col gap-4"
    >
      <FormGroup label="Trabajo">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="manoObraDescripcion">Descripción</Label>
            <Input
              id="manoObraDescripcion"
              aria-invalid={errors.descripcion ? true : undefined}
              aria-describedby={errors.descripcion ? "manoObraDescripcion-error" : undefined}
              {...register("descripcion")}
            />
            {errors.descripcion ? <p id="manoObraDescripcion-error">{errors.descripcion.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="manoObraValor">Valor</Label>
            {/* Flat labor charge, no hours captured -- Colombian shops quote mano de obra as a single amount. */}
            <Input
              id="manoObraValor"
              type="number"
              min="0"
              step="0.01"
              className="font-mono"
              aria-invalid={errors.valor ? true : undefined}
              aria-describedby={errors.valor ? "manoObraValor-error" : undefined}
              {...register("valor")}
            />
            {errors.valor ? <p id="manoObraValor-error">{errors.valor.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="manoObraMecanico">Mecánico</Label>
            <SelectField
              id="manoObraMecanico"
              aria-invalid={errors.mecanicoId ? true : undefined}
              aria-describedby={errors.mecanicoId ? "manoObraMecanico-error" : undefined}
              value={mecanicoIdField.value ?? ""}
              onValueChange={mecanicoIdField.onChange}
              placeholder="Sin asignar"
              items={[
                { value: "", label: "Sin asignar" },
                ...tecnicos.map((tecnico) => ({ value: tecnico.id, label: tecnico.nombre })),
              ]}
            />
            {errors.mecanicoId ? <p id="manoObraMecanico-error">{errors.mecanicoId.message}</p> : null}
          </div>
        </div>
      </FormGroup>

      <Button type="submit" disabled={isPending} className="self-end">
        {isPending ? "Guardando..." : "Agregar mano de obra"}
      </Button>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? <p role="status">Mano de obra agregada</p> : null}
    </form>
  );
}
