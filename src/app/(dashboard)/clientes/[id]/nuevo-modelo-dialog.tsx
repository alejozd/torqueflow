"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { crearModeloVehiculoAction, type ModeloVehiculoFormState } from "@/app/actions/vehiculo-marca-modelo-actions";
import type { ModeloVehiculo } from "@/generated/prisma-tenant";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ModeloVehiculoFormState = { error: null, success: false };

/**
 * Same shape as NuevaMarcaDialog. marcaId/marcaNombre come from whatever the
 * Marca combobox already has selected in VehiculoFormFields -- this dialog
 * only opens when that's non-empty (see the disabled "+ Agregar modelo"
 * button there), so marcaId is always a real id here, never re-selected.
 */
export function NuevoModeloDialog({
  open,
  onOpenChange,
  marcaId,
  marcaNombre,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  marcaId: string;
  marcaNombre: string;
  onCreated: (modelo: ModeloVehiculo) => void;
}) {
  const [state, setState] = useState<ModeloVehiculoFormState>(initialState);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const formData = new FormData(formRef.current!);
      formData.set("marcaId", marcaId);
      const result = await crearModeloVehiculoAction(initialState, formData);
      if (result.success && result.modelo) {
        onCreated(result.modelo);
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
          <DialogTitle>Nuevo modelo de {marcaNombre}</DialogTitle>
          <DialogDescription>Se agrega al catálogo del taller y queda seleccionado.</DialogDescription>
        </DialogHeader>
        <form noValidate ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nuevo-modelo-nombre">Nombre</Label>
            <Input id="nuevo-modelo-nombre" name="nombre" autoFocus />
          </div>

          {state.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex justify-end gap-2">
            <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : "Agregar modelo"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
