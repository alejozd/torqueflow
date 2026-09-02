"use client";

import { startTransition, useActionState, useRef } from "react";
import { useController, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createUsuarioAction, type UsuarioFormState } from "@/app/actions/usuario-actions";
import { usuarioCreateInputSchema, type UsuarioCreateInput } from "@/lib/validation/usuario";
import { FormGroup } from "@/components/form-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";

const initialState: UsuarioFormState = { error: null, success: false };

export function NuevoUsuarioForm() {
  const [state, formAction, isPending] = useActionState(createUsuarioAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<UsuarioCreateInput>({
    resolver: zodResolver(usuarioCreateInputSchema),
    defaultValues: { nombre: "", email: "", password: "", role: "TECNICO" },
  });
  const { field: roleField } = useController({ name: "role", control });

  return (
    <form
      noValidate
      ref={formRef}
      onSubmit={handleSubmit((data) =>
        startTransition(() => {
          const formData = new FormData(formRef.current!);
          // role is a SelectField (react-hook-form-controlled, not a native
          // <select name="..."> register()) -- it doesn't populate FormData
          // on its own, so it must be set explicitly here before submitting.
          formData.set("role", data.role ?? "");
          formAction(formData);
        }),
      )}
      className="flex flex-col gap-4"
    >
      <FormGroup label="Persona">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nombre">Nombre</Label>
            <Input
              id="nombre"
              required
              aria-invalid={errors.nombre ? true : undefined}
              aria-describedby={errors.nombre ? "nombre-error" : undefined}
              {...register("nombre")}
            />
            {errors.nombre ? <p id="nombre-error">{errors.nombre.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Correo</Label>
            <Input
              id="email"
              type="email"
              required
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? "email-error" : undefined}
              {...register("email")}
            />
            {errors.email ? <p id="email-error">{errors.email.message}</p> : null}
          </div>
        </div>
      </FormGroup>

      <FormGroup label="Acceso">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? "password-error" : undefined}
              {...register("password")}
            />
            {errors.password ? <p id="password-error">{errors.password.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="role">Rol</Label>
            <SelectField
              id="role"
              value={roleField.value ?? ""}
              onValueChange={roleField.onChange}
              items={[
                { value: "ADMIN", label: "ADMIN" },
                { value: "TECNICO", label: "TECNICO" },
                { value: "RECEPCION", label: "RECEPCION" },
              ]}
            />
          </div>
        </div>
      </FormGroup>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Creando..." : "Crear usuario"}
      </Button>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? <p role="status">Usuario creado</p> : null}
    </form>
  );
}
