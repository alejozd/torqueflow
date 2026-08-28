"use client";

import { useState } from "react";
import { EditarProveedorForm, type ProveedorEditable } from "./editar-proveedor-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function EditarProveedorDialog({ proveedor }: { proveedor: ProveedorEditable }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Editar</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar {proveedor.nombre}</DialogTitle>
          <DialogDescription>Los cambios aplican de inmediato a este proveedor.</DialogDescription>
        </DialogHeader>
        <EditarProveedorForm proveedor={proveedor} />
      </DialogContent>
    </Dialog>
  );
}
