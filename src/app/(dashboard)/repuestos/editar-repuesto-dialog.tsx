"use client";

import { useState } from "react";
import { EditarRepuestoForm, type RepuestoEditable } from "./editar-repuesto-form";
import type { Bodega, Proveedor } from "@/generated/prisma-tenant";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Row-level edit action: rendered inside the "Repuesto" column's cell, but
 * the trigger stretches over the whole row (absolute inset-0, sized against
 * the row's own `position: relative` set via DataTable's rowClickable) --
 * same "click anywhere in the row" convention as the rowHref-based tables
 * (Clientes, Órdenes, etc.), just opening a Dialog instead of navigating.
 */
export function EditarRepuestoDialog({
  repuesto,
  bodegas,
  proveedores,
}: {
  repuesto: RepuestoEditable;
  bodegas: Bodega[];
  proveedores: Proveedor[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<button type="button" className="absolute inset-0 z-10 cursor-pointer" />}>
        <span className="sr-only">Editar {repuesto.nombre}</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar {repuesto.nombre}</DialogTitle>
          <DialogDescription>Los cambios aplican de inmediato a este repuesto. Al eliminarlo, quedará desvinculado de las órdenes de trabajo que lo hayan usado.</DialogDescription>
        </DialogHeader>
        <EditarRepuestoForm repuesto={repuesto} bodegas={bodegas} proveedores={proveedores} />
      </DialogContent>
    </Dialog>
  );
}
