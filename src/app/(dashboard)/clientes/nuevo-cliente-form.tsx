"use client";

import { useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClienteAction, type ClienteFormState } from "@/app/actions/cliente-actions";
import { clienteInputSchema, type ClienteInput } from "@/lib/validation/cliente";
import type { Cliente } from "@/generated/prisma-tenant";
import { FormGroup } from "@/components/form-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ClienteFormState = { error: null, success: false };

export function NuevoClienteForm({
  onCreated,
}: {
  /**
   * Fired synchronously right after a successful create, with the new
   * cliente -- same reason NuevoVehiculoForm's onCreated exists: a lingering
   * "Cliente creado" message with a still-enabled submit button invites a
   * double-click, and createClienteAction's revalidatePath can refresh (and
   * unmount, inside a dialog) this form's parent before a
   * useActionState-driven effect would get a chance to run.
   */
  onCreated?: (cliente: Cliente) => void;
}) {
  const [state, setState] = useState<ClienteFormState>(initialState);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ClienteInput>({
    resolver: zodResolver(clienteInputSchema),
    defaultValues: { nombre: "", telefono: "", email: "", documento: "" },
  });

  function onValid() {
    startTransition(async () => {
      const formData = new FormData(formRef.current!);
      const result = await createClienteAction(initialState, formData);
      if (result.success && result.cliente) {
        if (onCreated) onCreated(result.cliente);
        else setState(result);
      } else {
        setState(result);
      }
    });
  }

  return (
    <form noValidate ref={formRef} onSubmit={handleSubmit(onValid)} className="flex flex-col gap-4">
      <FormGroup label="Identificación">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nombre">Nombre</Label>
            <Input
              id="nombre"
              aria-invalid={errors.nombre ? true : undefined}
              aria-describedby={errors.nombre ? "nombre-error" : undefined}
              {...register("nombre")}
            />
            {errors.nombre ? <p id="nombre-error">{errors.nombre.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="documento">Documento</Label>
            <Input
              id="documento"
              className="font-mono"
              aria-invalid={errors.documento ? true : undefined}
              aria-describedby={errors.documento ? "documento-error" : undefined}
              {...register("documento")}
            />
            {errors.documento ? <p id="documento-error">{errors.documento.message}</p> : null}
          </div>
        </div>
      </FormGroup>

      <FormGroup label="Contacto">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="telefono">Teléfono</Label>
            <Input
              id="telefono"
              className="font-mono"
              aria-invalid={errors.telefono ? true : undefined}
              aria-describedby={errors.telefono ? "telefono-error" : undefined}
              {...register("telefono")}
            />
            {errors.telefono ? <p id="telefono-error">{errors.telefono.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Correo</Label>
            <Input
              id="email"
              type="email"
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? "email-error" : undefined}
              {...register("email")}
            />
            {errors.email ? <p id="email-error">{errors.email.message}</p> : null}
          </div>
        </div>
      </FormGroup>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? <p role="status">Cliente creado</p> : null}

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <span className="text-xs text-muted-foreground">Solo el nombre es obligatorio</span>
        <div className="flex justify-end gap-2">
          <DialogClose render={<Button type="button" variant="outline" />}>
            Cancelar
          </DialogClose>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Guardando..." : "Crear cliente"}
          </Button>
        </div>
      </div>
    </form>
  );
}
