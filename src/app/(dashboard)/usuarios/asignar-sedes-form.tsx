"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  setUsuarioSedesAction,
  type UsuarioConSedes,
  type UsuarioSedesFormState,
} from "@/app/actions/usuario-actions";
import { usuarioSedesInputSchema, type UsuarioSedesInput } from "@/lib/validation/sede";
import { FormGroup } from "@/components/form-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const initialState: UsuarioSedesFormState = { error: null, success: false };

export interface SedeCheckboxOption {
  id: string;
  nombre: string;
}

export function AsignarSedesForm({
  usuario,
  sedes,
}: {
  usuario: UsuarioConSedes;
  sedes: SedeCheckboxOption[];
}) {
  const [state, formAction, isPending] = useActionState(
    setUsuarioSedesAction.bind(null, usuario.id),
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UsuarioSedesInput>({
    resolver: zodResolver(usuarioSedesInputSchema),
    defaultValues: { sedeIds: usuario.sedeIds },
  });
  const sedesErrorId = `sedeIds-error-${usuario.id}`;

  return (
    <form
      noValidate
      ref={formRef}
      onSubmit={handleSubmit(() => startTransition(() => formAction(new FormData(formRef.current!))))}
      className="flex flex-col gap-4"
    >
      <FormGroup label="Sedes asignadas">
        <div className="flex flex-col gap-1.5">
          {sedes.map((sede) => {
            const inputId = `sede-${sede.id}-usuario-${usuario.id}`;
            return (
              <div key={sede.id} className="flex items-center gap-2">
                {/*
                  Native checkbox input -- no shadcn Checkbox component exists
                  in this project yet, and this form's tests rely on a real
                  <input type="checkbox"> for userEvent.click()/.checked.
                */}
                <input
                  id={inputId}
                  type="checkbox"
                  value={sede.id}
                  aria-describedby={errors.sedeIds ? sedesErrorId : undefined}
                  {...register("sedeIds")}
                />
                <Label htmlFor={inputId}>
                  {sede.nombre} para {usuario.nombre}
                </Label>
              </div>
            );
          })}
          {errors.sedeIds ? <p id={sedesErrorId}>{errors.sedeIds.message}</p> : null}
        </div>
      </FormGroup>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : `Guardar sedes de ${usuario.nombre}`}
      </Button>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? <p role="status">Sedes actualizadas</p> : null}
    </form>
  );
}
