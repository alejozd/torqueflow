"use client";

import { useState } from "react";
import { EditarBodegaForm, type BodegaEditable } from "./editar-bodega-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function EditarBodegaDialog({ bodega }: { bodega: BodegaEditable }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Editar</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar {bodega.nombre}</DialogTitle>
          <DialogDescription>Los cambios aplican de inmediato a esta bodega.</DialogDescription>
        </DialogHeader>
        <EditarBodegaForm bodega={bodega} />
      </DialogContent>
    </Dialog>
  );
}
