"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { useController, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import {
  updateUsuarioAction,
  deleteUsuarioAction,
  type UsuarioFormState,
  type SedeCheckboxOption,
} from "@/app/actions/usuario-actions";
import { usuarioUpdateInputSchema } from "@/lib/validation/usuario";
import { FormGroup } from "@/components/form-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";

const initialState: UsuarioFormState = { error: null, success: false };

type EditarUsuarioFormInput = z.input<typeof usuarioUpdateInputSchema>;
type EditarUsuarioFormOutput = z.output<typeof usuarioUpdateInputSchema>;

const ESTADO_ITEMS = [
  { value: "true", label: "Activo" },
  { value: "false", label: "Suspendido" },
];

export interface EditarUsuarioFormUsuario {
  id: string;
  nombre: string;
  email: string;
  role: "ADMIN" | "TECNICO" | "RECEPCION";
  activo: boolean;
  sedeDefectoId: string | null;
  sedeIds: string[];
}

export function EditarUsuarioForm({
  usuario,
  sedes,
  showCancelButton = false,
}: {
  usuario: EditarUsuarioFormUsuario;
  sedes: SedeCheckboxOption[];
  /**
   * Renders a Cancel button (via DialogClose) next to the submit button.
   * Only safe when this form is rendered inside a Dialog ancestor (e.g.
   * EditarUsuarioDialog) -- defaults to false because this same form is also
   * rendered standalone on /usuarios/[id] with no Dialog ancestor, where
   * DialogClose would throw. Same convention as NuevoRepuestoForm.
   */
  showCancelButton?: boolean;
}) {
  const updateEsteUsuario = updateUsuarioAction.bind(null, usuario.id);
  const [state, formAction, isPending] = useActionState(updateEsteUsuario, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<EditarUsuarioFormInput, unknown, EditarUsuarioFormOutput>({
    resolver: zodResolver(usuarioUpdateInputSchema),
    defaultValues: {
      nombre: usuario.nombre,
      email: usuario.email,
      password: "",
      role: usuario.role,
      activo: usuario.activo ? "true" : "false",
      sedeIds: usuario.sedeIds,
      sedeDefectoId: usuario.sedeDefectoId ?? "",
    },
  });
  const { field: roleField } = useController({ name: "role", control });
  const { field: activoField } = useController({ name: "activo", control });
  const { field: sedeDefectoField } = useController({ name: "sedeDefectoId", control });
  const roleWatched = useWatch({ control, name: "role" });
  const sedeIdsWatched = useWatch({ control, name: "sedeIds" }) ?? [];

  // ADMIN bypasses sede assignment entirely (resolveSedeActiva's own bypass
  // rule) -- the checkboxes are hidden and "Sede por defecto" offers every
  // sede in the tenant instead of only the checked subset.
  const esAdmin = roleWatched === "ADMIN";
  const sedeDefectoOptions = esAdmin ? sedes : sedes.filter((sede) => sedeIdsWatched.includes(sede.id));

  useEffect(() => {
    if (sedeDefectoField.value && !sedeDefectoOptions.some((sede) => sede.id === sedeDefectoField.value)) {
      sedeDefectoField.onChange("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esAdmin, sedeIdsWatched.join(",")]);

  return (
    <div className="flex flex-col gap-4">
      <form
        noValidate
        ref={formRef}
        onSubmit={handleSubmit((data) =>
          startTransition(() => {
            const formData = new FormData(formRef.current!);
            // role/activo/sedeDefectoId are SelectFields (react-hook-form-
            // controlled, not native <select name="..."> register()) -- they
            // don't populate FormData on their own, so they must be set
            // explicitly here before submitting. sedeIds checkboxes ARE
            // register()-ed with a name, so FormData already has them.
            formData.set("role", data.role ?? "");
            formData.set("activo", String(data.activo ?? true));
            formData.set("sedeDefectoId", data.sedeDefectoId ?? "");
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
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? "password-error" : undefined}
                {...register("password")}
              />
              <p className="text-xs text-muted-foreground">Déjala en blanco para conservar la contraseña actual.</p>
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

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="activo">Estado</Label>
              <SelectField
                id="activo"
                value={activoField.value ?? "true"}
                onValueChange={activoField.onChange}
                items={ESTADO_ITEMS}
              />
            </div>
          </div>
        </FormGroup>

        <FormGroup label="Sedes asignadas">
          <div className="flex flex-col gap-4">
            {esAdmin ? (
              <p className="text-sm text-muted-foreground">
                Los administradores pueden operar cualquier sede, sin necesidad de asignación.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {sedes.map((sede) => {
                  const inputId = `sede-${sede.id}-usuario-${usuario.id}`;
                  return (
                    <div key={sede.id} className="flex items-center gap-2">
                      {/*
                        Native checkbox input -- no shadcn Checkbox component
                        exists in this project, same convention the deleted
                        AsignarSedesForm used.
                      */}
                      <input
                        id={inputId}
                        type="checkbox"
                        value={sede.id}
                        aria-describedby={errors.sedeIds ? "sedeIds-error" : undefined}
                        {...register("sedeIds")}
                      />
                      <Label htmlFor={inputId}>{sede.nombre}</Label>
                    </div>
                  );
                })}
                {errors.sedeIds ? <p id="sedeIds-error">{errors.sedeIds.message}</p> : null}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sedeDefectoId">Sede por defecto</Label>
              <SelectField
                id="sedeDefectoId"
                value={sedeDefectoField.value ?? ""}
                onValueChange={sedeDefectoField.onChange}
                placeholder="Sin sede por defecto"
                items={sedeDefectoOptions.map((sede) => ({ value: sede.id, label: sede.nombre }))}
                aria-invalid={errors.sedeDefectoId ? true : undefined}
                aria-describedby={errors.sedeDefectoId ? "sedeDefectoId-error" : undefined}
              />
              {errors.sedeDefectoId ? <p id="sedeDefectoId-error">{errors.sedeDefectoId.message}</p> : null}
            </div>
          </div>
        </FormGroup>

        <div className="flex items-center justify-end gap-2">
          {showCancelButton ? (
            <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
          ) : null}
          <Button type="submit" disabled={isPending}>
            {isPending ? "Guardando..." : "Guardar cambios"}
          </Button>
        </div>

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
