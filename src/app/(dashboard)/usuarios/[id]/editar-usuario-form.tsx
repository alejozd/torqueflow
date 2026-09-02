"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateUsuarioAction, deleteUsuarioAction, type UsuarioFormState } from "@/app/actions/usuario-actions";
import { usuarioUpdateInputSchema, type UsuarioUpdateInput } from "@/lib/validation/usuario";
import { FormGroup } from "@/components/form-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

const initialState: UsuarioFormState = { error: null, success: false };

export interface EditarUsuarioFormUsuario {
  id: string;
  nombre: string;
  email: string;
  role: "ADMIN" | "TECNICO" | "RECEPCION";
}

export function EditarUsuarioForm({ usuario }: { usuario: EditarUsuarioFormUsuario }) {
  const updateEsteUsuario = updateUsuarioAction.bind(null, usuario.id);
  const [state, formAction, isPending] = useActionState(updateEsteUsuario, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UsuarioUpdateInput>({
    resolver: zodResolver(usuarioUpdateInputSchema),
    defaultValues: { nombre: usuario.nombre, email: usuario.email, password: "", role: usuario.role },
  });

  return (
    <div className="flex flex-col gap-4">
      <form
        noValidate
        ref={formRef}
        onSubmit={handleSubmit(() => startTransition(() => formAction(new FormData(formRef.current!))))}
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
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? "password-error" : undefined}
                {...register("password")}
              />
              <p className="text-xs text-muted-foreground">Déjala en blanco para conservar la contraseña actual.</p>
              {errors.password ? <p id="password-error">{errors.password.message}</p> : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="role">Rol</Label>
              {/*
                Native <select>, not shadcn's Select (Base UI, no DOM <option>s
                while closed) -- userEvent.selectOptions()/getByRole("option")
                in the existing tests need real <select>/<option> elements.
                Styled by hand to match the shadcn select trigger look.
              */}
              <NativeSelect id="role" {...register("role")}>
                <option value="ADMIN">ADMIN</option>
                <option value="TECNICO">TECNICO</option>
                <option value="RECEPCION">RECEPCION</option>
              </NativeSelect>
            </div>
          </div>
        </FormGroup>

        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar cambios"}
        </Button>

        {state.error ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        {state.success ? <p role="status">Usuario actualizado</p> : null}
      </form>

      <form action={deleteUsuarioAction.bind(null, usuario.id)} className="border-t border-border pt-4">
        <Button type="submit" variant="destructive">
          Eliminar usuario
        </Button>
      </form>
    </div>
  );
}
