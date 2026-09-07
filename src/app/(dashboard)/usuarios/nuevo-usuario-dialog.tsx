"use client";

import { useState } from "react";
import { NuevoUsuarioForm } from "./nuevo/nuevo-usuario-form";
import type { SedeCheckboxOption } from "@/app/actions/usuario-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Same shape as NuevoRepuestoDialog: a self-contained Dialog with its own
 * trigger ("Crear usuario"), wrapping the create form with showCancelButton
 * so the modal can be dismissed via Cancelar instead of only its X button.
 */
export function NuevoUsuarioDialog({ sedes }: { sedes: SedeCheckboxOption[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Crear usuario</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo usuario</DialogTitle>
          <DialogDescription>Crea una cuenta de acceso y asígnale sus sedes.</DialogDescription>
        </DialogHeader>
        <NuevoUsuarioForm sedes={sedes} showCancelButton />
      </DialogContent>
    </Dialog>
  );
}
