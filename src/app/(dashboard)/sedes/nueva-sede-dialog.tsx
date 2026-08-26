"use client";

import { useState } from "react";
import { NuevaSedeForm } from "./nueva-sede-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/**
 * Fase 11-14: the mockup opens "Nueva sede" as a modal instead of the
 * always-visible inline Card the page used to render. The form itself
 * (validation, server action, plan-limit check) is untouched -- only where
 * it renders changed. Same pattern as clientes/nuevo-cliente-dialog.tsx.
 */
export function NuevaSedeDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Nueva sede</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva sede</DialogTitle>
        </DialogHeader>
        <NuevaSedeForm />
      </DialogContent>
    </Dialog>
  );
}
