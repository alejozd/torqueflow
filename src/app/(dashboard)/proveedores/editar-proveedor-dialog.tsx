"use client";

import { useState } from "react";
import { EditarProveedorForm, type ProveedorEditable } from "./editar-proveedor-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Row-level edit action: rendered inside the "Proveedor" column's cell, but
 * the trigger stretches over the whole row (absolute inset-0, sized against
 * the row's own `position: relative` set via DataTable's rowClickable) --
 * same "click anywhere in the row" convention as the rowHref-based tables
 * (Clientes, Órdenes, etc.), just opening a Dialog instead of navigating.
 */
export function EditarProveedorDialog({ proveedor }: { proveedor: ProveedorEditable }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<button type="button" className="absolute inset-0 z-10" />}>
        <span className="sr-only">Editar {proveedor.nombre}</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar {proveedor.nombre}</DialogTitle>
          <DialogDescription>Los cambios aplican de inmediato a este proveedor. Al eliminarlo, sus repuestos asociados quedarán sin proveedor asignado.</DialogDescription>
        </DialogHeader>
        <EditarProveedorForm proveedor={proveedor} />
      </DialogContent>
    </Dialog>
  );
}
