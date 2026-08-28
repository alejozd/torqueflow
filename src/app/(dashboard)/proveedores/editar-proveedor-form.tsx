"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  updateProveedorAction,
  deleteProveedorFormAction,
  type ProveedorFormState,
} from "@/app/actions/proveedor-actions";
import { proveedorInputSchema, type ProveedorInput } from "@/lib/validation/inventario";
import { FormGroup } from "@/components/form-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ProveedorFormState = { error: null, success: false };

export interface ProveedorEditable {
  id: string;
  nombre: string;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
}

export function EditarProveedorForm({ proveedor }: { proveedor: ProveedorEditable }) {
  const [state, formAction, isPending] = useActionState(
    updateProveedorAction.bind(null, proveedor.id),
    initialState,
  );
  const [deleteState, deleteFormAction, isDeletePending] = useActionState(
    deleteProveedorFormAction.bind(null, proveedor.id),
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProveedorInput>({
    resolver: zodResolver(proveedorInputSchema),
    defaultValues: {
      nombre: proveedor.nombre,
      contacto: proveedor.contacto ?? "",
      telefono: proveedor.telefono ?? "",
      email: proveedor.email ?? "",
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <form
        noValidate
        ref={formRef}
        onSubmit={handleSubmit(() => startTransition(() => formAction(new FormData(formRef.current!))))}
        className="flex flex-col gap-4"
      >
        <FormGroup label="Datos">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`nombre-${proveedor.id}`}>Nombre</Label>
              <Input
                id={`nombre-${proveedor.id}`}
                required
                aria-invalid={errors.nombre ? true : undefined}
                aria-describedby={errors.nombre ? `nombre-${proveedor.id}-error` : undefined}
                {...register("nombre")}
              />
              {errors.nombre ? <p id={`nombre-${proveedor.id}-error`}>{errors.nombre.message}</p> : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`contacto-${proveedor.id}`}>Contacto</Label>
              <Input
                id={`contacto-${proveedor.id}`}
                aria-invalid={errors.contacto ? true : undefined}
                aria-describedby={errors.contacto ? `contacto-${proveedor.id}-error` : undefined}
                {...register("contacto")}
              />
              {errors.contacto ? <p id={`contacto-${proveedor.id}-error`}>{errors.contacto.message}</p> : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`telefono-${proveedor.id}`}>Teléfono</Label>
              <Input
                id={`telefono-${proveedor.id}`}
                className="font-mono"
                aria-invalid={errors.telefono ? true : undefined}
                aria-describedby={errors.telefono ? `telefono-${proveedor.id}-error` : undefined}
                {...register("telefono")}
              />
              {errors.telefono ? <p id={`telefono-${proveedor.id}-error`}>{errors.telefono.message}</p> : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`email-${proveedor.id}`}>Correo</Label>
              <Input
                id={`email-${proveedor.id}`}
                type="email"
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? `email-${proveedor.id}-error` : undefined}
                {...register("email")}
              />
              {errors.email ? <p id={`email-${proveedor.id}-error`}>{errors.email.message}</p> : null}
            </div>
          </div>
        </FormGroup>

        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar proveedor"}
        </Button>

        {state.error ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        {state.success ? <p role="status">Proveedor actualizado</p> : null}
      </form>

      <form action={deleteFormAction} className="flex flex-col gap-1.5 border-t border-border pt-4">
        <Button type="submit" variant="destructive" disabled={isDeletePending}>
          Eliminar {proveedor.nombre}
        </Button>
        {deleteState.error ? (
          <Alert variant="destructive">
            <AlertDescription>{deleteState.error}</AlertDescription>
          </Alert>
        ) : null}
      </form>
    </div>
  );
}
