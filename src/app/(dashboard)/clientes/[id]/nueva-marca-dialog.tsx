"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { crearMarcaVehiculoAction, type MarcaVehiculoFormState } from "@/app/actions/vehiculo-marca-modelo-actions";
import type { MarcaVehiculo } from "@/generated/prisma-tenant";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: MarcaVehiculoFormState = { error: null, success: false };

/**
 * Controlled from the outside, no trigger of its own -- opened by the "+"
 * button next to the Marca combobox in VehiculoFormFields, same shape as
 * NuevoRepuestoDialog. Manual useTransition + await (not useActionState):
 * onCreated needs the created marca synchronously to select it and close
 * the dialog, matching NuevoRepuestoForm's onCreated pattern.
 */
export function NuevaMarcaDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (marca: MarcaVehiculo) => void;
}) {
  const [state, setState] = useState<MarcaVehiculoFormState>(initialState);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const formData = new FormData(formRef.current!);
      const result = await crearMarcaVehiculoAction(initialState, formData);
      if (result.success && result.marca) {
        onCreated(result.marca);
        setState(initialState);
        formRef.current?.reset();
      } else {
        setState(result);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Nueva marca</DialogTitle>
          <DialogDescription>Se agrega al catálogo del taller y queda seleccionada.</DialogDescription>
        </DialogHeader>
        <form noValidate ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nueva-marca-nombre">Nombre</Label>
            <Input id="nueva-marca-nombre" name="nombre" autoFocus />
          </div>

          {state.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex justify-end gap-2">
            <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : "Agregar marca"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
