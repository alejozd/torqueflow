"use client";

import { useState } from "react";
import { EditarUsuarioForm, type EditarUsuarioFormUsuario } from "./[id]/editar-usuario-form";
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
 * Row-level edit action, same shape as AsignarSedesDialog (the flow this
 * replaces): a small "Editar" button opens the modal instead of navigating
 * to /usuarios/[id], with showCancelButton so it can be dismissed via
 * Cancelar instead of only its X button.
 */
export function EditarUsuarioDialog({
  usuario,
  sedes,
}: {
  usuario: EditarUsuarioFormUsuario;
  sedes: SedeCheckboxOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Editar</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar usuario</DialogTitle>
          <DialogDescription>Los cambios aplican de inmediato a este usuario.</DialogDescription>
        </DialogHeader>
        <EditarUsuarioForm usuario={usuario} sedes={sedes} showCancelButton />
      </DialogContent>
    </Dialog>
  );
}
