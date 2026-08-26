"use client";

import { useState } from "react";
import { NuevoClienteForm } from "./nuevo-cliente-form";
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
 * Fase 11-14: the mockup opens "Nuevo cliente" as a modal instead of the
 * always-visible inline Card the page used to render. The form itself
 * (validation, server action, success/error states) is untouched -- only
 * where it renders changed.
 */
export function NuevoClienteDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Nuevo cliente</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo cliente</DialogTitle>
          <DialogDescription>Los datos de contacto alimentan los recordatorios de cita.</DialogDescription>
        </DialogHeader>
        <NuevoClienteForm />
      </DialogContent>
    </Dialog>
  );
}
