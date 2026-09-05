"use client";

import { useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createProveedorAction, type ProveedorFormState } from "@/app/actions/proveedor-actions";
import { proveedorInputSchema, type ProveedorInput } from "@/lib/validation/inventario";
import { FormGroup } from "@/components/form-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ProveedorFormState = { error: null, success: false };

export function NuevoProveedorForm({
  onCreated,
}: {
  /**
   * Fired synchronously right after a successful create -- mirrors
   * NuevoVehiculoForm's onCreated: createProveedorAction's revalidatePath
   * can refresh (and unmount, inside a dialog) this form's parent before a
   * useActionState-driven effect would get a chance to run.
   */
  onCreated?: () => void;
}) {
  const [state, setState] = useState<ProveedorFormState>(initialState);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProveedorInput>({
    resolver: zodResolver(proveedorInputSchema),
    defaultValues: { nombre: "", documento: "", contacto: "", telefono: "", email: "" },
  });

  function onValid() {
    startTransition(async () => {
      const formData = new FormData(formRef.current!);
      const result = await createProveedorAction(initialState, formData);
      if (result.success) {
        toast.success("Proveedor creado");
        if (onCreated) onCreated();
        else setState(result);
      } else {
        toast.error(result.error ?? "No se pudo crear el proveedor");
        setState(result);
      }
    });
  }

  return (
    <form noValidate ref={formRef} onSubmit={handleSubmit(onValid)} className="flex flex-col gap-4">
      <FormGroup label="Empresa">
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
            <Label htmlFor="documento">NIT / Cédula</Label>
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
            <Label htmlFor="contacto">Contacto</Label>
            <Input
              id="contacto"
              aria-invalid={errors.contacto ? true : undefined}
              aria-describedby={errors.contacto ? "contacto-error" : undefined}
              {...register("contacto")}
            />
            {errors.contacto ? <p id="contacto-error">{errors.contacto.message}</p> : null}
          </div>

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
      {state.success ? <p role="status">Proveedor creado</p> : null}

      <div className="flex justify-end gap-2">
        <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Crear proveedor"}
        </Button>
      </div>
    </form>
  );
}
