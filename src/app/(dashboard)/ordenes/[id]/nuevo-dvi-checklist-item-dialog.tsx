"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import {
  crearDviChecklistItemAction,
  type DviChecklistItemFormState,
} from "@/app/actions/dvi-checklist-item-actions";
import type { DviChecklistItem } from "@/generated/prisma-tenant";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: DviChecklistItemFormState = { error: null, success: false };

/**
 * Controlled from the outside, no trigger of its own -- opened by the "+"
 * button in DviChecklistForm, same shape as NuevaMarcaDialog.
 */
export function NuevoDviChecklistItemDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (item: DviChecklistItem) => void;
}) {
  const [state, setState] = useState<DviChecklistItemFormState>(initialState);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const formData = new FormData(formRef.current!);
      const result = await crearDviChecklistItemAction(initialState, formData);
      if (result.success && result.item) {
        onCreated(result.item);
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
          <DialogTitle>Nuevo ítem del checklist</DialogTitle>
          <DialogDescription>Se agrega al checklist DVI de todas las órdenes de este taller.</DialogDescription>
        </DialogHeader>
        <form noValidate ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nuevo-dvi-item-label">Nombre</Label>
            <Input id="nuevo-dvi-item-label" name="label" autoFocus />
          </div>

          {state.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex justify-end gap-2">
            <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : "Agregar ítem"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
