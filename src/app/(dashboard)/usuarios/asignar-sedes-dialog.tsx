"use client";

import { useState } from "react";
import { AsignarSedesForm, type SedeCheckboxOption } from "./asignar-sedes-form";
import type { UsuarioConSedes } from "@/app/actions/usuario-actions";
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
 * Fase 11-14: row-level "Asignar sedes" opens the existing checkbox-group
 * form (untouched) in a modal instead of it rendering inline in the table
 * row -- a taller with many sedes made the row unreadable otherwise.
 */
export function AsignarSedesDialog({
  usuario,
  sedes,
}: {
  usuario: UsuarioConSedes;
  sedes: SedeCheckboxOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Asignar sedes</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Sedes de {usuario.nombre}</DialogTitle>
          <DialogDescription>Controla a qué sedes puede acceder este usuario.</DialogDescription>
        </DialogHeader>
        <AsignarSedesForm usuario={usuario} sedes={sedes} />
      </DialogContent>
    </Dialog>
  );
}
